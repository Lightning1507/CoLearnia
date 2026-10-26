import { execFileSync } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sources = [
  'AGENTS.md',
  'apps/web/AGENTS.md',
  'apps/server/AGENTS.md',
  'packages/contracts/AGENTS.md',
  'README.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/technical-plan.md',
  'docs/decision-status.md',
  'docs/architecture.md',
  'docs/product/scope.md',
  'docs/product/workspace-channels.md',
  'docs/product/live-session.md',
  'docs/product/groups-media-policy.md',
  'docs/product/board-collaboration.md',
  'docs/database/model.md',
  'docs/database/lifecycle.md',
  'docs/ai/workflow.md',
  'docs/ai/task-template.md',
  'docs/contracts/README.md',
  'docs/runbooks/local-development.md',
  'docs/code-quality.md',
];
export const configFiles = [
  '.gitignore',
  '.node-version',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/web/package.json',
  'apps/server/package.json',
  'packages/contracts/package.json',
  'apps/web/Dockerfile',
  'apps/server/Dockerfile',
  '.github/workflows/ci.yml',
  '.github/pull_request_template.md',
  'eslint.config.mjs',
  'scripts/architecture-rules.mjs',
  'scripts/architecture.test.mjs',
  'scripts/check-harness.mjs',
  'scripts/check-harness.test.mjs',
];

export function localLinks(markdown) {
  const prose = markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, '').split(/[?#]/)[0])
    .filter((target) => target && !/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith('//'))
    .map((target) => decodeURIComponent(target));
}

function inside(base, path) {
  const rel = relative(base, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

export function localTarget(base, source, target) {
  const absolute = resolve(base, dirname(source), target);
  if (isAbsolute(target) || !inside(base, absolute)) {
    throw new Error(`Link outside repository: ${source} -> ${target}`);
  }
  return relative(base, absolute).split(sep).join('/');
}

export async function checkRuntime(base) {
  const read = (path) => readFile(resolve(base, path), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const version = (await read('.node-version')).trim();
  const pnpm = pkg.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)$/)?.[1];
  const errors = [];
  const need = (ok, message) => {
    if (!ok) errors.push(message);
  };
  need(/^\d+\.\d+\.\d+$/.test(version), '.node-version must pin a patch');
  need(Boolean(pnpm), 'packageManager must pin pnpm');
  need(pkg.devEngines?.runtime?.name === 'node', 'devEngines runtime must be node');
  need(
    pkg.devEngines?.runtime?.version === version,
    'devEngines runtime differs from .node-version',
  );
  need(pkg.devEngines?.runtime?.onFail === 'download', 'runtime download policy differs');
  const major = Number(version.split('.')[0]);
  need(pkg.engines?.node === `>=${version} <${major + 1}`, 'engines.node differs from runtime pin');
  need(pkg.engines?.pnpm === pnpm, 'engines.pnpm differs from packageManager');
  need(
    Number(pkg.devDependencies?.['@types/node']?.split('.')[0]) === major,
    '@types/node major differs',
  );
  const lock = await read('pnpm-lock.yaml');
  const runtime = lock.match(
    /\n {6}node:\n {8}specifier: runtime:([^\n]+)\n {8}version: runtime:([^\n]+)/,
  );
  need(runtime?.[1] === version && runtime?.[2] === version, 'lockfile runtime differs');
  for (const file of ['apps/server/Dockerfile', 'apps/web/Dockerfile']) {
    const content = await read(file);
    const images = [...content.matchAll(/^FROM node:([^\s]+).*$/gm)];
    need(
      images.length > 0 && images.every((m) => m[1] === `${version}-bookworm-slim`),
      `${file}: Node image differs`,
    );
    const installs = [...content.matchAll(/npm install --global pnpm@([^\s]+)/g)];
    need(installs.length > 0 && installs.every((m) => m[1] === pnpm), `${file}: pnpm differs`);
  }
  const ci = await read('.github/workflows/ci.yml');
  const installs = [...ci.matchAll(/npm install --global pnpm@([^\s]+)/g)];
  need(installs.length > 0 && installs.every((m) => m[1] === pnpm), 'CI pnpm differs');
  need(/node-version-file: \.node-version/.test(ci), 'CI must use .node-version');
  for (const file of [
    'README.md',
    'docs/technical-plan.md',
    'docs/runbooks/local-development.md',
  ]) {
    const content = await read(file);
    need(
      content.includes(version) && content.includes(pnpm),
      `${file}: runtime documentation differs`,
    );
  }
  for (const name of [
    'check:harness',
    'check',
    'dev',
    'test',
    'typecheck',
    'lint',
    'format:check',
    'media:smoke',
    'doctor',
  ]) {
    need(Boolean(pkg.scripts?.[name]), `Missing package script: ${name}`);
  }
  need(
    pkg.scripts?.check?.startsWith('pnpm check:harness && '),
    'pnpm check must start with harness checks',
  );
  if (errors.length) throw new Error(errors.join('\n'));
}

export async function checkHarness(base = root) {
  const required = new Set([...sources, ...configFiles]);
  const physicalRoot = await realpath(base);
  for (const source of sources) {
    const file = resolve(base, source);
    if (!inside(physicalRoot, await realpath(file)))
      throw new Error(`Source symlink escapes repository: ${source}`);
    const content = await readFile(file, 'utf8');
    if (/\/Users\/[^\s/]+\/|[A-Z]:\\Users\\/i.test(content)) {
      throw new Error(`Personal absolute path in shared source: ${source}`);
    }
    if (source.endsWith('AGENTS.md') && content.trim().split('\n').length > 100) {
      throw new Error(`Agent entry point exceeds 100 lines: ${source}`);
    }
    for (const target of localLinks(content)) required.add(localTarget(base, source, target));
  }
  for (const path of required) {
    const file = resolve(base, path);
    if (!(await stat(file)).isFile()) throw new Error(`Required source is not a file: ${path}`);
    if (!inside(physicalRoot, await realpath(file)))
      throw new Error(`Source symlink escapes repository: ${path}`);
  }
  // git check-ignore exits 1 when no path is ignored; other failures must not pass.
  try {
    const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: base,
      input: [...required].join('\n') + '\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (ignored) throw new Error(`Required sources are ignored:\n${ignored}`);
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  await checkRuntime(base);
  return required.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/check-harness.mjs');
    console.log(`PASS: ${await checkHarness()} required sources/links and runtime pins.`);
    console.log(
      'Does not validate anchors, business semantics, agent permissions or real media calls.',
    );
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
