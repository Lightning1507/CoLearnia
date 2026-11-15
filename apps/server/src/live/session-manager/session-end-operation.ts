import { performance } from 'node:perf_hooks';
import { sessionEndAckSchema } from '@colearnia/contracts';
import type { SessionCleanupRequest, SessionEndInput } from '@colearnia/contracts';
import { beginSessionTransition, createSessionTransitionTiming } from './session-transition.js';
import type {
  HeldTransitionContext,
  SessionTransitionAdapters,
  SessionTransitionTiming,
} from './session-transition.js';

// The registry installs ENDING and closes its Router before constructing this handle.
// All cleanup/DB waits run after releasing the acceptance gate.
export function createSessionEndOperation(options: {
  input: SessionEndInput;
  context: HeldTransitionContext;
  timing: SessionTransitionTiming;
  targets: { userId: string; request: SessionCleanupRequest }[];
  adapters: SessionTransitionAdapters;
  beginEnding(assertCurrent: () => void): Promise<void>;
  completeEnding(assertCurrent: () => void): Promise<void>;
  finalize(assertCurrent: () => void): Promise<void>;
}) {
  options.context.assertHeld();
  if (!options.targets.length) throw new TypeError('Session end requires captured ownerships');
  const { input, timing } = options;
  const handles = options.targets.map(({ userId, request }) =>
    beginSessionTransition(request, options.context, options.adapters, { userId, timing }),
  );
  let task: Promise<ReturnType<typeof reply>> | undefined;
  let active: Promise<ReturnType<typeof reply>> | undefined;
  let completed: ReturnType<typeof reply> | undefined;
  let begun = false;
  let persisted = false;
  function reply(ended: boolean, cleanupPending = true) {
    return sessionEndAckSchema.parse({
      requestId: input.requestId,
      data: {
        status: ended ? 'completed' : 'pending',
        result: {
          sessionId: input.sessionId,
          epoch: input.epoch,
          state: ended ? 'ENDED' : 'ENDING',
          cleanupPending,
        },
      },
    });
  }
  async function execute(assertCurrent: () => void, recovery: boolean) {
    assertCurrent();
    // Revocation is independent of whether the DB acknowledgement can be confirmed.
    const cleanup = Promise.all(
      handles.map((handle) => (recovery ? handle.reconcile() : handle.runForeground())),
    );
    try {
      if (!begun) await options.beginEnding(assertCurrent);
      assertCurrent();
      begun = true;
    } catch {
      // Keep cleaning within the same budget; a write failure does not restore access.
    }
    const outcomes = await cleanup;
    assertCurrent();
    if (!begun || !outcomes.every((value) => value.permissionRevoked && value.pendingInvalidated))
      return reply(false);
    if (!persisted) await options.completeEnding(assertCurrent);
    assertCurrent();
    persisted = true;
    await options.finalize(assertCurrent);
    completed = reply(
      true,
      outcomes.some((value) => value.cleanupPending),
    );
    return completed;
  }
  function attempt(recovery: boolean) {
    if (completed) return Promise.resolve(completed);
    if (active) return active;
    const deadline = recovery ? createSessionTransitionTiming().deadlineMs : timing.deadlineMs;
    let finished = false;
    const assertCurrent = () => {
      if (
        finished ||
        performance.now() >= deadline ||
        !options.context.isCurrent(options.targets[0]!.request)
      )
        throw new Error('Session end operation is no longer current');
    };
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<ReturnType<typeof reply>>((resolve) => {
      timer = setTimeout(() => resolve(reply(false)), Math.max(0, deadline - performance.now()));
    });
    active = Promise.race([execute(assertCurrent, recovery), timeout])
      .catch(() => reply(false))
      .finally(() => {
        finished = true;
        clearTimeout(timer);
        active = undefined;
      });
    return active;
  }
  return {
    run() {
      return completed ? Promise.resolve(completed) : (task ??= attempt(false));
    },
    // The registry's metadata hooks retain each write intent: subsequent calls
    // read it back rather than issuing the mutation again. Every attempt has its
    // own guard so a timed-out foreground callback cannot revive during recovery.
    reconcile: () => attempt(true),
  };
}
