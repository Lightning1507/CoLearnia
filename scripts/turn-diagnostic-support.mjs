import { spawn } from 'node:child_process';

// Server issuance occurs somewhere between request and response. Use the earliest
// possible issue time for a conservative pre-TTL baseline, not a reset after probes.
export async function observeCredentialProbe(
  issuance,
  ttl,
  measure,
  { baseline = false, now = () => performance.now() } = {},
) {
  const startedAtMs = now();
  const observation = await measure();
  const finishedAtMs = now();
  const validClock =
    Number.isFinite(issuance.requestedAtMs) &&
    Number.isFinite(issuance.receivedAtMs) &&
    Number.isFinite(startedAtMs) &&
    Number.isFinite(finishedAtMs) &&
    issuance.receivedAtMs >= issuance.requestedAtMs &&
    startedAtMs >= issuance.receivedAtMs &&
    finishedAtMs >= startedAtMs;
  const beforeTtl = validClock && finishedAtMs < issuance.requestedAtMs + ttl * 1000;
  return {
    status: validClock && (!baseline || beforeTtl) ? 'observed' : 'inconclusive',
    ...(!validClock
      ? { reason: 'invalid-monotonic-clock' }
      : baseline && !beforeTtl
        ? { reason: 'baseline-not-completed-before-ttl' }
        : {}),
    timing: {
      issuanceRequestedAt: issuance.requestedAt,
      credentialReceivedAt: issuance.receivedAt,
      // Bounds include the issuance HTTP round trip. No provider timestamp is inferred.
      ageAtStartSeconds: validClock
        ? {
            minimum: (startedAtMs - issuance.receivedAtMs) / 1000,
            maximum: (startedAtMs - issuance.requestedAtMs) / 1000,
          }
        : null,
      ageAtEndSeconds: validClock
        ? {
            minimum: (finishedAtMs - issuance.receivedAtMs) / 1000,
            maximum: (finishedAtMs - issuance.requestedAtMs) / 1000,
          }
        : null,
      beforeTtl,
    },
    observation,
  };
}

// Register error handling synchronously, before the first startup await. A launch
// failure rejects into the runner's existing try/finally and cancels readiness polling.
export function launchDiagnosticBrowser(
  executable,
  args,
  options,
  waitReady,
  spawnProcess = spawn,
) {
  const controller = new AbortController();
  let child;
  const ready = new Promise((resolve, reject) => {
    child = spawnProcess(executable, args, options);
    child.on('error', () => {
      controller.abort();
      reject(new Error('Diagnostic browser launch failed'));
    });
    Promise.resolve()
      .then(() => waitReady(controller.signal))
      .then(resolve, reject);
  });
  return { child, ready };
}
