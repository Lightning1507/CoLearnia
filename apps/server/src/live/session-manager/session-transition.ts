import { performance } from 'node:perf_hooks';
import {
  sessionCleanupRequestSchema,
  sessionCleanupResultSchema,
  sessionControlBudget,
} from '@colearnia/contracts';
import type {
  CleanupSessionResources,
  CommonErrorCode,
  SessionCleanupRequest,
  SessionCleanupResult,
  SessionScopeRef,
} from '@colearnia/contracts';
import { CleanupAdmission, sessionCleanupAdmission } from './cleanup-admission.js';

const domains = ['media', 'messaging', 'board'] as const;
type Domain = (typeof domains)[number];
type Outcome = SessionCleanupResult['outcome'];
export type SessionTransitionAdapters = Record<
  Exclude<Domain, 'media'>,
  CleanupSessionResources
> & {
  media: CleanupSessionResources | { revoke(request: SessionCleanupRequest): SessionCleanupResult };
};
const admissionPollMs = 100;

export type SessionTransitionTiming = Readonly<{ acceptedAtMs: number; deadlineMs: number }>;

// Capture once when accepting the operation, before waiting for any gate.
export function createSessionTransitionTiming(
  now: () => number = () => performance.now(),
): SessionTransitionTiming {
  const acceptedAtMs = now();
  if (!Number.isFinite(acceptedAtMs)) throw new TypeError('Invalid transition clock');
  return Object.freeze({
    acceptedAtMs,
    deadlineMs: acceptedAtMs + sessionControlBudget.foregroundTransitionTimeoutMs,
  });
}

// Construct this only in the server composition layer, from the caller's live gate context.
// isCurrent rechecks identity/access, epoch/generation/token, policy and destination deadline.
export type HeldTransitionContext = {
  assertHeld(): void;
  isCurrent(request: Readonly<SessionCleanupRequest>): boolean;
};
export type TransitionAudience = {
  sessionId: string;
  epoch: string;
  participantId: string;
  callGeneration: number;
  audienceEpoch: number;
  scope: SessionScopeRef;
};
type AdapterState = {
  attempts: number;
  inFlight: Promise<void> | null;
  outcome: Outcome | null;
};

function sameScope(left: SessionScopeRef, right: SessionScopeRef) {
  return (
    left.type === right.type &&
    (left.type === 'MAIN' || (right.type === 'GROUP' && left.groupId === right.groupId))
  );
}

function identity(value: SessionCleanupRequest | SessionCleanupResult): string {
  return JSON.stringify([
    value.operationId,
    value.sessionId,
    value.epoch,
    value.transitionToken,
    'callGeneration' in value ? value.callGeneration : null,
    value.target,
  ]);
}

const failure = (
  errorCode: CommonErrorCode = 'DEPENDENCY_UNAVAILABLE',
  retryable = true,
): Outcome => ({
  permissionRevoked: false,
  pendingInvalidated: false,
  cleanupPending: true,
  errorCode,
  retryable,
});

function waitFor(promise: Promise<void>, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<'SETTLED' | 'TIMEOUT' | 'CANCELLED'>((resolve) => {
    let finished = false;
    const finish = (result: 'SETTLED' | 'TIMEOUT' | 'CANCELLED') => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelled);
      resolve(result);
    };
    const cancelled = () => finish('CANCELLED');
    const timer = setTimeout(() => finish('TIMEOUT'), Math.max(0, timeoutMs));
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
    void promise.then(() => finish('SETTLED'));
  });
}

function pause(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, timeoutMs));
    signal?.addEventListener('abort', finish, { once: true });
    if (signal?.aborted) finish();
  });
}

export function beginSessionTransition(
  rawRequest: SessionCleanupRequest,
  context: HeldTransitionContext,
  adapters: SessionTransitionAdapters,
  options: {
    userId: string;
    timing: SessionTransitionTiming;
    admission?: CleanupAdmission;
    now?: () => number;
    random?: () => number;
  },
) {
  context.assertHeld();
  const request = sessionCleanupRequestSchema.parse(rawRequest);
  if (!/^[a-f\d]{24}$/i.test(options.userId)) throw new TypeError('Invalid cleanup actor');
  if (!context.isCurrent(request)) throw new Error('Transition context is stale');
  for (const name of domains) {
    const adapter = adapters[name];
    if (typeof adapter === 'function') continue;
    if (name === 'media' && adapter && typeof adapter.revoke === 'function') continue;
    throw new TypeError(`Missing ${name} cleanup adapter`);
  }
  if ('scope' in request.target) Object.freeze(request.target.scope);
  Object.freeze(request.target);
  Object.freeze(request);
  // Capture adapter bindings and limits; callers cannot change an operation after admission.
  const cleanup = { ...adapters };
  const admission = options.admission ?? sessionCleanupAdmission;
  const userId = options.userId.toLowerCase();
  const sessionKey = `${request.sessionId}:${request.epoch}`.toLowerCase();
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const startedAt = options.timing.acceptedAtMs;
  const deadline = options.timing.deadlineMs;
  const enteredAt = now();
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(deadline) ||
    !Number.isFinite(enteredAt) ||
    deadline <= startedAt ||
    deadline > startedAt + sessionControlBudget.foregroundTransitionTimeoutMs ||
    enteredAt < startedAt
  )
    throw new TypeError('Invalid transition timing');
  const abort = new AbortController();
  const states = Object.fromEntries(
    domains.map((name) => [
      name,
      {
        attempts: 0,
        inFlight: null,
        outcome: null,
      },
    ]),
  ) as Record<Domain, AdapterState>;
  function readOutcome(value: unknown): Outcome {
    const parsed = sessionCleanupResultSchema.safeParse(value);
    return !parsed.success || identity(parsed.data) !== identity(request)
      ? failure('CONFLICT', false)
      : parsed.data.outcome;
  }

  // Closing local transports and invalidating pending handles is synchronous and bounded.
  // Do it under the current gate even if native create/connect has exhausted admission.
  if (typeof cleanup.media !== 'function') {
    try {
      const outcome = readOutcome(cleanup.media.revoke(structuredClone(request)));
      states.media.outcome = outcome.permissionRevoked ? outcome : { ...outcome, retryable: false };
    } catch {
      states.media.outcome = failure('DEPENDENCY_UNAVAILABLE', false);
    }
  }
  let cancelled = false;
  let committed = false;
  let retired = false;
  let foregroundFinished = false;
  let reconciled = false;
  let foreground: Promise<ReturnType<typeof inspect>> | null = null;
  let reconciliation: Promise<ReturnType<typeof inspect>> | null = null;

  const confirmed = () => domains.every((name) => states[name].outcome?.permissionRevoked === true);
  let lastTime = enteredAt;
  let clockFailed = false;
  const currentTime = () => {
    if (clockFailed) return Number.POSITIVE_INFINITY;
    const value = now();
    if (!Number.isFinite(value) || value < lastTime) {
      clockFailed = true;
      return Number.POSITIVE_INFINITY;
    }
    lastTime = value;
    return value;
  };

  function inspect() {
    const permissionRevoked = confirmed();
    const time = currentTime();
    const ready = permissionRevoked && Number.isFinite(time) && (time < deadline || reconciled);
    return {
      barrierActive: !committed && !retired,
      phase: committed
        ? ('COMMITTED' as const)
        : cancelled
          ? ('CANCELLED' as const)
          : ready
            ? ('READY' as const)
            : foregroundFinished || currentTime() >= deadline
              ? ('DEGRADED' as const)
              : ('CLEANING' as const),
      permissionRevoked,
      pendingInvalidated: domains.every(
        (name) => states[name].outcome?.pendingInvalidated === true,
      ),
      cleanupPending: domains.some((name) => states[name].outcome?.cleanupPending !== false),
      adapters: domains.map((name) => ({
        name,
        attempts: states[name].attempts,
        inFlight: states[name].inFlight !== null,
        outcome: states[name].outcome ? { ...states[name].outcome } : null,
      })),
    };
  }

  function startAdapter(name: Domain): Promise<void> | null {
    const state = states[name];
    if (state.inFlight) return state.inFlight;
    const adapter = cleanup[name];
    if (typeof adapter !== 'function') return null;
    const release = admission.tryAcquire(userId, sessionKey);
    if (!release) {
      state.outcome = failure();
      return null;
    }
    state.attempts++;
    state.inFlight = Promise.resolve()
      .then(() => adapter(structuredClone(request)))
      .then(
        (value) => {
          state.outcome = readOutcome(value);
        },
        () => {
          state.outcome = failure();
        },
      )
      .catch(() => {
        state.outcome = failure();
      })
      .finally(() => {
        release();
        state.inFlight = null;
      });
    return state.inFlight;
  }

  async function attempt(name: Domain, until: number, signal?: AbortSignal) {
    const state = states[name];
    if (
      state.outcome?.permissionRevoked ||
      (state.outcome?.permissionRevoked === false && !state.outcome.retryable) ||
      currentTime() >= until ||
      signal?.aborted
    )
      return;
    const running = startAdapter(name);
    if (!running) return;
    // A timeout stops waiting, never cancels/releases the actual I/O or starts a duplicate.
    const result = await waitFor(
      running,
      Math.min(sessionControlBudget.cleanupAttemptTimeoutMs, until - currentTime()),
      signal,
    );
    if (result !== 'SETTLED' && !state.outcome?.permissionRevoked) state.outcome = failure();
  }

  async function foregroundAdapter(name: Domain) {
    while (!abort.signal.aborted && currentTime() < deadline) {
      const attemptsBefore = states[name].attempts;
      await attempt(name, deadline, abort.signal);
      const state = states[name];
      if (
        state.inFlight ||
        state.outcome?.permissionRevoked ||
        (state.outcome?.permissionRevoked === false && !state.outcome.retryable) ||
        abort.signal.aborted ||
        currentTime() >= deadline
      )
        return;
      if (state.attempts === attemptsBefore) {
        // Bounded polling adds no admission queue and consumes no adapter attempt.
        await pause(Math.min(admissionPollMs, deadline - currentTime()), abort.signal);
        continue;
      }
      const delay = sessionControlBudget.cleanupRetryDelaysMs[state.attempts - 1];
      if (delay === undefined) return;
      const sample = random();
      const jitter = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0.5;
      await pause(Math.min(delay * (0.8 + 0.4 * jitter), deadline - currentTime()), abort.signal);
    }
  }

  function runForeground() {
    if (!foreground)
      foreground = Promise.all(domains.map(foregroundAdapter)).then(() => {
        foregroundFinished = true;
        return inspect();
      });
    return foreground;
  }

  return {
    inspect,
    // Explicit retry keeps the original request and any still-running I/O. The caller
    // must hold the original ownership's gate before retrying synchronous media cleanup.
    retryMediaHeld(held: HeldTransitionContext) {
      held.assertHeld();
      if (committed || retired || !held.isCurrent(request)) return;
      if (
        typeof cleanup.media !== 'function' &&
        !(states.media.outcome?.permissionRevoked && states.media.outcome.pendingInvalidated)
      ) {
        try {
          states.media.outcome = readOutcome(cleanup.media.revoke(structuredClone(request)));
        } catch {
          states.media.outcome = failure();
        }
      }
    },
    async retryCleanup() {
      if (committed || retired) return inspect();
      const until = currentTime() + sessionControlBudget.cleanupAttemptTimeoutMs;
      await Promise.all(
        domains.map(async (name) => {
          const state = states[name];
          if (state.outcome?.permissionRevoked && state.outcome.pendingInvalidated) return;
          if (typeof cleanup[name] !== 'function') return;
          // An explicit retry may recover a previously unavailable provider. Automatic
          // foreground retries still respect retryable:false. Never duplicate pending I/O.
          if (!state.inFlight) state.outcome = null;
          const running = startAdapter(name);
          if (running) await waitFor(running, Math.max(1, until - currentTime()));
        }),
      );
      return inspect();
    },
    // Registry/policy checks all live barriers before grant/read/fanout.
    blocks(audience: TransitionAudience): boolean {
      if (
        committed ||
        retired ||
        audience.sessionId !== request.sessionId ||
        audience.epoch !== request.epoch
      )
        return false;
      const target = request.target;
      if (target.type === 'SCOPE') return sameScope(target.scope, audience.scope);
      if (
        target.participantId !== audience.participantId ||
        !('callGeneration' in request) ||
        request.callGeneration !== audience.callGeneration
      )
        return false;
      // The cleanup target is the old audience, but no new participant scope may grant
      // while its transition is unresolved (including a failed/partial commit).
      return true;
    },
    runForeground,
    reconcile() {
      if (!reconciliation)
        reconciliation = (async () => {
          await runForeground();
          const base = currentTime();
          if (!Number.isFinite(base)) return inspect();
          for (const delay of sessionControlBudget.cleanupReconcileDelaysMs) {
            if (confirmed()) break;
            const wait = Math.max(0, base + delay - currentTime());
            if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
            await Promise.all(
              domains.map((name) =>
                attempt(name, currentTime() + sessionControlBudget.cleanupAttemptTimeoutMs),
              ),
            );
          }
          reconciled = confirmed();
          return inspect();
        })();
      return reconciliation;
    },
    invalidateHeld(held: HeldTransitionContext) {
      held.assertHeld();
      if (committed || retired) return false;
      cancelled = true;
      abort.abort();
      return true;
    },
    commitHeld(held: HeldTransitionContext, commit: () => boolean) {
      held.assertHeld();
      if (committed) return { ok: true as const };
      if (cancelled || inspect().phase !== 'READY')
        return { ok: false as const, errorCode: 'CONFLICT' as const };
      if (!held.isCurrent(request)) {
        cancelled = true;
        abort.abort();
        return { ok: false as const, errorCode: 'CONFLICT' as const };
      }
      try {
        if (commit() !== true) return { ok: false as const, errorCode: 'CONFLICT' as const };
      } catch {
        return { ok: false as const, errorCode: 'INTERNAL_ERROR' as const };
      }
      committed = true;
      return { ok: true as const };
    },
    retireCancelledHeld(held: HeldTransitionContext) {
      held.assertHeld();
      if (!cancelled || !confirmed()) return false;
      retired = true;
      return true;
    },
  };
}
