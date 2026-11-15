import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchDiagnosticBrowser, observeCredentialProbe } from './turn-diagnostic-support.mjs';

const issuance = {
  requestedAtMs: 0,
  receivedAtMs: 200,
  requestedAt: '2026-11-15T00:00:00.000Z',
  receivedAt: '2026-11-15T00:00:00.200Z',
};
const clock =
  (...values) =>
  () =>
    values.shift();

test('records request/receipt and start/end age bounds without credential contents', async () => {
  const result = await observeCredentialProbe(issuance, 60, () => ({ relayFound: true }), {
    baseline: true,
    now: clock(500, 1500),
  });
  assert.equal(result.status, 'observed');
  assert.deepEqual(result.timing.ageAtStartSeconds, { minimum: 0.3, maximum: 0.5 });
  assert.deepEqual(result.timing.ageAtEndSeconds, { minimum: 1.3, maximum: 1.5 });
  assert.equal(result.timing.credentialReceivedAt, issuance.receivedAt);
  assert.equal(result.timing.issuanceRequestedAt, issuance.requestedAt);
});

test('a later browser baseline cannot reuse a successful pre-TTL Python baseline', async () => {
  const first = await observeCredentialProbe(issuance, 60, () => ({ accepted: true }), {
    baseline: true,
    now: clock(500, 1000),
  });
  const browser = await observeCredentialProbe(issuance, 60, () => ({ relayFound: false }), {
    baseline: true,
    now: clock(61_000, 79_000),
  });
  assert.equal(first.status, 'observed');
  assert.equal(browser.status, 'inconclusive');
  assert.equal(browser.reason, 'baseline-not-completed-before-ttl');
  assert.equal(browser.observation.relayFound, false);
  assert.deepEqual(browser.timing.ageAtEndSeconds, { minimum: 78.8, maximum: 79 });
});

test('a baseline crossing or finishing exactly at TTL is inconclusive', async () => {
  for (const end of [60_000, 60_001]) {
    const result = await observeCredentialProbe(issuance, 60, async () => ({ accepted: false }), {
      baseline: true,
      now: clock(59_000, end),
    });
    assert.equal(result.status, 'inconclusive');
  }
});

test('issuance latency counts toward the conservative pre-TTL window', async () => {
  const result = await observeCredentialProbe(
    { ...issuance, receivedAtMs: 59_000 },
    60,
    () => ({}),
    {
      baseline: true,
      now: clock(59_500, 60_500),
    },
  );
  assert.equal(result.status, 'inconclusive');
  assert.deepEqual(result.timing.ageAtEndSeconds, { minimum: 1.5, maximum: 60.5 });
});

test('post-TTL observations stay measurements and use each credential issuance window', async () => {
  const older = await observeCredentialProbe(issuance, 60, () => ({}), {
    now: clock(80_000, 81_000),
  });
  const newer = await observeCredentialProbe(
    { ...issuance, requestedAtMs: 1000, receivedAtMs: 1200 },
    60,
    () => ({}),
    { now: clock(82_000, 83_000) },
  );
  assert.equal(older.status, 'observed');
  assert.equal(older.timing.beforeTtl, false);
  assert.equal(older.timing.ageAtStartSeconds.maximum, 80);
  assert.equal(newer.timing.ageAtStartSeconds.maximum, 81);
});

test('an invalid monotonic clock cannot validate a baseline', async () => {
  const result = await observeCredentialProbe(issuance, 60, () => ({}), {
    baseline: true,
    now: clock(500, 400),
  });
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.reason, 'invalid-monotonic-clock');
});

test('asynchronous browser spawn error rejects startup and cancels readiness polling', async () => {
  const child = new EventEmitter();
  let signal;
  const launched = launchDiagnosticBrowser(
    'fixture-browser',
    [],
    {},
    async (value) => {
      signal = value;
      await new Promise((resolve) => value.addEventListener('abort', resolve, { once: true }));
      value.throwIfAborted();
    },
    () => {
      setImmediate(() => child.emit('error', new Error('OS denied executable')));
      return child;
    },
  );
  assert.equal(launched.child, child);
  await assert.rejects(launched.ready, /browser launch failed/);
  assert.equal(signal.aborted, true);
  // Listener remains attached: another late error must not become an uncaught event.
  assert.doesNotThrow(() => child.emit('error', new Error('late process error')));
});

test('runner revokes both issued credentials and removes profile after browser spawn failure', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      new URL('./fixtures/turn-browser-spawn-failure.mjs', import.meta.url).href,
      'scripts/diagnose-cloudflare-turn.mjs',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, TURN_KEY_ID: 'fixture-key', TURN_KEY_API_TOKEN: 'fixture-token' },
    },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.trim(), result.stderr);
  const events = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === 'diagnostic-error').length, 1);
  assert.equal(
    events.filter((entry) => entry.event === 'revoke' && entry.status === 204).length,
    2,
  );
  assert.equal(events.find((entry) => entry.event === 'fixture-profile-cleanup')?.removed, true);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /fixture-password|fixture-token|fixture-user-/,
  );
});

test('synchronous spawn failure also rejects into cleanup', async () => {
  const launched = launchDiagnosticBrowser(
    'fixture-browser',
    [],
    {},
    async () => {},
    () => {
      throw new Error('spawn failed');
    },
  );
  assert.equal(launched.child, undefined);
  await assert.rejects(launched.ready, /spawn failed/);
});
