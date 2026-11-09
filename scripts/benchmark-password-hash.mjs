// SCRUM-17 experiment. Uses synthetic input and writes only timing/resource data.
import { spawnSync } from 'node:child_process';
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { availableParallelism, cpus } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const derive = promisify(argon2);
const syntheticPassword = '🌱'.repeat(128);
const sampleSize = 40;
const mib = 1024 * 1024;
const round = (value) => Math.round(value * 100) / 100;

function percentile(values, p) {
  const sorted = values.toSorted((a, b) => a - b);
  return round(sorted[Math.ceil((p / 100) * sorted.length) - 1]);
}

function implementation({ engine, memory, passes, modulePath }) {
  if (engine === 'node-argon2') {
    const library = createRequire(import.meta.url)(modulePath);
    return {
      hash: () =>
        library.hash(syntheticPassword, {
          type: library.argon2id,
          memoryCost: memory,
          timeCost: passes,
          parallelism: 1,
          hashLength: 32,
          salt: randomBytes(16),
        }),
      verify: (digest, password) => library.verify(digest, password),
    };
  }
  const run = (message, nonce) =>
    derive('argon2id', { message, nonce, memory, passes, parallelism: 1, tagLength: 32 });
  return {
    async hash() {
      const salt = randomBytes(16);
      return { salt, tag: await run(syntheticPassword, salt) };
    },
    async verify({ salt, tag }, password) {
      return timingSafeEqual(tag, await run(password, salt));
    },
  };
}

async function measure(work, concurrency, count) {
  const latencies = [];
  const starts = [];
  const loop = monitorEventLoopDelay({ resolution: 5 });
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  let next = 0;
  loop.enable();
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < count) {
          next += 1;
          const began = performance.now();
          starts.push(began - start);
          await work();
          latencies.push(performance.now() - began);
        }
      }),
    );
  } finally {
    loop.disable();
  }
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  const cpuMs = (cpu.user + cpu.system) / 1000;
  return {
    count,
    wallMs: round(wallMs),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    cpuMsPerJob: round(cpuMs / count),
    cpuPercentOfOneCore: round((cpuMs / wallMs) * 100),
    loopP95Ms: round(loop.percentile(95) / 1e6),
    lastStartMs: round(Math.max(...starts)),
  };
}

async function runCase(options) {
  const rssBefore = process.memoryUsage.rss();
  const { hash, verify } = implementation(options);
  const digest = await hash();
  if (!(await verify(digest, syntheticPassword)) || (await verify(digest, 'wrong fixture'))) {
    throw new Error('Password verification failed');
  }
  const result = {
    engine: options.engine,
    memoryKiB: options.memory,
    passes: options.passes,
    lanes: 1,
    concurrency: options.concurrency,
    hash: await measure(hash, options.concurrency, sampleSize),
    verify: await measure(() => verify(digest, syntheticPassword), options.concurrency, sampleSize),
  };
  // Simulated immediate arrivals. Only slots plus bounded waiting room are admitted.
  if (options.concurrency === 2) {
    const arrivals = 12;
    const queueCapacity = 4;
    const admitted = Math.min(arrivals, options.concurrency + queueCapacity);
    result.burst = {
      arrivals,
      queueCapacity,
      rejected: arrivals - admitted,
      ...(await measure(hash, options.concurrency, admitted)),
    };
  }
  return {
    ...result,
    rssBeforeMiB: round(rssBefore / mib),
    peakRssMiB: round(process.resourceUsage().maxRSS / 1024),
  };
}

if (process.argv[2] === '--case') {
  console.log(JSON.stringify(await runCase(JSON.parse(process.argv[3]))));
} else {
  const modulePath = process.argv[2];
  if (modulePath && !isAbsolute(modulePath)) throw new Error('Provide an absolute argon2 path');
  console.log(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      availableParallelism: availableParallelism(),
      threadpool: process.env.UV_THREADPOOL_SIZE ?? 'default',
    }),
  );
  for (const engine of modulePath ? ['node:crypto', 'node-argon2'] : ['node:crypto']) {
    for (const [memory, passes] of [
      [19 * 1024, 2],
      [32 * 1024, 2],
      [64 * 1024, 3],
    ]) {
      for (const concurrency of [1, 2, 4]) {
        const child = spawnSync(
          process.execPath,
          [
            fileURLToPath(import.meta.url),
            '--case',
            JSON.stringify({
              engine,
              memory,
              passes,
              concurrency,
              modulePath,
            }),
          ],
          { encoding: 'utf8', timeout: 120_000 },
        );
        if (child.error) throw child.error;
        if (child.status !== 0) throw new Error(child.stderr || 'Benchmark process failed');
        process.stdout.write(child.stdout);
      }
    }
  }
}
