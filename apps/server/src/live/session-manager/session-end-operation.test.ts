import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  SessionCleanupRequest,
  SessionCleanupResult,
  SessionEndInput,
} from '@colearnia/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionEndOperation } from './session-end-operation.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function setup() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const input: SessionEndInput = {
    requestId: randomUUID(),
    sessionId: '100000000000000000000001',
    epoch: randomUUID(),
    callGeneration: 1,
    expectedPolicyRevision: 1,
    action: 'END',
  };
  const request: SessionCleanupRequest = {
    operationId: input.requestId,
    sessionId: input.sessionId,
    epoch: input.epoch,
    transitionToken: randomUUID(),
    callGeneration: 1,
    target: { type: 'PARTICIPANT', participantId: '100000000000000000000002' },
    reason: 'SESSION_ENDED',
  };
  const cleanupResult = (value: SessionCleanupRequest): SessionCleanupResult => ({
    operationId: value.operationId,
    sessionId: value.sessionId,
    epoch: value.epoch,
    transitionToken: value.transitionToken,
    callGeneration: 1,
    target: { type: 'PARTICIPANT', participantId: '100000000000000000000002' },
    outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending: false },
  });
  const cleanup = vi.fn(async (value: SessionCleanupRequest) => cleanupResult(value));
  const beginEnding = vi.fn(async (guard: () => void) => {
    guard();
  });
  const completeEnding = vi.fn(async (guard: () => void) => {
    guard();
  });
  const finalize = vi.fn(async (guard: () => void) => {
    guard();
  });
  let current = true;
  const operation = createSessionEndOperation({
    input,
    context: { assertHeld: () => {}, isCurrent: () => current },
    timing: { acceptedAtMs: 0, deadlineMs: 100 },
    targets: [{ userId: '100000000000000000000003', request }],
    adapters: { media: { revoke: cleanupResult }, messaging: cleanup, board: cleanup },
    beginEnding,
    completeEnding,
    finalize,
  });
  return {
    operation,
    beginEnding,
    completeEnding,
    finalize,
    cleanup,
    invalidate: () => {
      current = false;
    },
    expire: async () => {
      time = 101;
      await vi.advanceTimersByTimeAsync(101);
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('session end deadline and late callbacks', () => {
  it('does not start completion when beginEnding returns after the total deadline', async () => {
    const f = setup();
    const wait = deferred();
    f.beginEnding.mockImplementation(async () => wait.promise);
    const task = f.operation.run();
    await f.expire();
    expect(await task).toMatchObject({ data: { status: 'pending' } });
    wait.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.completeEnding).not.toHaveBeenCalled();
    expect(f.finalize).not.toHaveBeenCalled();
    expect(await f.operation.run()).toEqual(await task);
    expect(f.beginEnding).toHaveBeenCalledTimes(1);
  });
  it('does not finalize or report ENDED when an already-sent completion returns late', async () => {
    const f = setup();
    const wait = deferred();
    f.completeEnding.mockImplementation(async () => wait.promise);
    const task = f.operation.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.completeEnding).toHaveBeenCalledTimes(1);
    await f.expire();
    expect(await task).toMatchObject({ data: { status: 'pending' } });
    wait.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.finalize).not.toHaveBeenCalled();
  });
  it('does not commit a callback from a closed or replaced runtime', async () => {
    const f = setup();
    const wait = deferred();
    f.beginEnding.mockImplementation(async () => wait.promise);
    const task = f.operation.run();
    f.invalidate();
    wait.resolve();
    expect(await task).toMatchObject({ data: { status: 'pending' } });
    expect(f.completeEnding).not.toHaveBeenCalled();
  });
});
