import { performance } from 'node:perf_hooks';
import { sessionEndAckSchema } from '@colearnia/contracts';
import type { SessionCleanupRequest, SessionEndInput } from '@colearnia/contracts';
import { beginSessionTransition } from './session-transition.js';
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
  let finished = false;
  let task: Promise<ReturnType<typeof reply>> | undefined;
  function assertCurrent() {
    if (
      finished ||
      performance.now() >= timing.deadlineMs ||
      !options.context.isCurrent(options.targets[0]!.request)
    )
      throw new Error('Session end operation is no longer current');
  }
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
  async function execute() {
    assertCurrent();
    await options.beginEnding(assertCurrent);
    assertCurrent();
    const outcomes = await Promise.all(handles.map((handle) => handle.runForeground()));
    assertCurrent();
    if (!outcomes.every((value) => value.permissionRevoked && value.pendingInvalidated))
      return reply(false);
    await options.completeEnding(assertCurrent);
    assertCurrent();
    await options.finalize(assertCurrent);
    return reply(
      true,
      outcomes.some((value) => value.cleanupPending),
    );
  }
  return {
    run() {
      if (!task) {
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<ReturnType<typeof reply>>((resolve) => {
          timer = setTimeout(
            () => resolve(reply(false)),
            Math.max(0, timing.deadlineMs - performance.now()),
          );
        });
        task = Promise.race([execute(), timeout])
          .catch(() => reply(false))
          .finally(() => {
            finished = true;
            clearTimeout(timer);
          });
      }
      return task;
    },
  };
}
