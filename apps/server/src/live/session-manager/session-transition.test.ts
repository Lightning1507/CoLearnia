import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CleanupSessionResources,
  SessionCleanupRequest,
  SessionCleanupResult,
} from '@colearnia/contracts';
import { CleanupAdmission } from './cleanup-admission.js';
import { beginSessionTransition } from './session-transition.js';
import type { HeldTransitionContext, TransitionAudience } from './session-transition.js';

const id = (value: number) => String(value).padStart(24, '0');
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const request: SessionCleanupRequest = {
  operationId: uuid(1),
  sessionId: id(1),
  epoch: uuid(2),
  transitionToken: uuid(3),
  callGeneration: 1,
  reason: 'SCOPE_CHANGED',
  target: {
    type: 'PARTICIPANT_SCOPE',
    participantId: id(2),
    audienceEpoch: 4,
    scope: { type: 'GROUP', groupId: uuid(4) },
  },
};
const audience: TransitionAudience = {
  sessionId: id(1),
  epoch: uuid(2),
  participantId: id(2),
  callGeneration: 1,
  audienceEpoch: 4,
  scope: { type: 'GROUP', groupId: uuid(4) },
};
const confirmed: SessionCleanupResult['outcome'] = {
  permissionRevoked: true,
  pendingInvalidated: true,
  cleanupPending: false,
};
const retryable: SessionCleanupResult['outcome'] = {
  permissionRevoked: false,
  pendingInvalidated: false,
  cleanupPending: true,
  errorCode: 'DEPENDENCY_UNAVAILABLE',
  retryable: true,
};

function ack(value: SessionCleanupRequest, outcome = confirmed): SessionCleanupResult {
  const base = {
    operationId: value.operationId,
    sessionId: value.sessionId,
    epoch: value.epoch,
    transitionToken: value.transitionToken,
    outcome,
  };
  return 'callGeneration' in value
    ? { ...base, callGeneration: value.callGeneration, target: value.target }
    : { ...base, target: value.target };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  let held = false;
  let current = true;
  const context: HeldTransitionContext = {
    assertHeld: vi.fn(() => {
      if (!held) throw new Error('Gate not held');
    }),
    isCurrent: vi.fn(() => current),
  };
  function inGate<T>(work: () => T): T {
    if (held) throw new Error('Reentrant outer gate');
    held = true;
    try {
      return work();
    } finally {
      held = false;
    }
  }
  async function holdGate<T>(work: () => Promise<T>): Promise<T> {
    if (held) throw new Error('Reentrant outer gate');
    held = true;
    try {
      return await work();
    } finally {
      held = false;
    }
  }
  const adapters = {
    media: vi.fn<CleanupSessionResources>(async (value) => ack(value)),
    messaging: vi.fn<CleanupSessionResources>(async (value) => ack(value)),
    board: vi.fn<CleanupSessionResources>(async (value) => ack(value)),
  };
  const admission = new CleanupAdmission();
  const begin = (value = request) =>
    inGate(() =>
      beginSessionTransition(value, context, adapters, {
        userId: id(9),
        admission,
        now: () => Date.now(),
        random: () => 0.5,
      }),
    );
  return {
    context,
    adapters,
    admission,
    inGate,
    holdGate,
    begin,
    stale: () => {
      current = false;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('session transition barrier and commit', () => {
  it('installs deny immediately for old and new participant scopes, keeping other ownerships untouched', () => {
    const f = fixture();
    const transition = f.begin();
    expect(transition.blocks(audience)).toBe(true);
    expect(transition.blocks({ ...audience, audienceEpoch: 5, scope: { type: 'MAIN' } })).toBe(
      true,
    );
    for (const update of [
      { participantId: id(3) },
      { callGeneration: 2 },
      { epoch: uuid(8) },
      { sessionId: id(3) },
    ]) {
      expect(transition.blocks({ ...audience, ...update })).toBe(false);
    }
    expect(f.adapters.media).not.toHaveBeenCalled();
    expect(f.inGate(() => transition.commitHeld(f.context, () => true))).toEqual({
      ok: false,
      errorCode: 'CONFLICT',
    });
  });

  it('cleans all domains before an explicit revalidated, idempotent commit', async () => {
    const f = fixture();
    f.adapters.board.mockImplementation(async (value) =>
      ack(value, { ...confirmed, cleanupPending: true }),
    );
    const transition = f.begin();
    const pending = transition.runForeground();
    expect(transition.runForeground()).toBe(pending);
    await vi.runAllTimersAsync();
    expect((await pending).phase).toBe('READY');
    expect(transition.inspect().cleanupPending).toBe(true);
    expect(transition.blocks(audience)).toBe(true);
    const commit = vi.fn(() => true);
    expect(f.inGate(() => transition.commitHeld(f.context, commit))).toEqual({ ok: true });
    expect(f.inGate(() => transition.commitHeld(f.context, commit))).toEqual({ ok: true });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(transition.blocks(audience)).toBe(false);
    expect(f.admission.stats().active).toBe(0);
  });

  it('uses a caller-held outer gate without trying to acquire it again', async () => {
    const f = fixture();
    const result = f.holdGate(async () => {
      const transition = beginSessionTransition(request, f.context, f.adapters, {
        userId: id(9),
        admission: f.admission,
        now: () => Date.now(),
      });
      await transition.runForeground();
      return transition.commitHeld(f.context, () => true);
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(f.context.isCurrent).toHaveBeenCalledTimes(2);
  });

  it('rejects missing gates and rechecks authority after adapter I/O', async () => {
    const f = fixture();
    expect(() => beginSessionTransition(request, f.context, f.adapters, { userId: id(9) })).toThrow(
      'Gate not held',
    );
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    await pending;
    const commit = vi.fn(() => true);
    expect(() => transition.commitHeld(f.context, commit)).toThrow('Gate not held');
    f.stale();
    expect(f.inGate(() => transition.commitHeld(f.context, commit))).toEqual({
      ok: false,
      errorCode: 'CONFLICT',
    });
    expect(commit).not.toHaveBeenCalled();
    expect(transition.blocks(audience)).toBe(true);
  });

  it('retains deny on a commit exception, including a partially changed destination', async () => {
    const f = fixture();
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    await pending;
    expect(
      f.inGate(() =>
        transition.commitHeld(f.context, () => {
          throw new Error('raw DB error');
        }),
      ),
    ).toEqual({ ok: false, errorCode: 'INTERNAL_ERROR' });
    expect(transition.blocks({ ...audience, audienceEpoch: 5, scope: { type: 'MAIN' } })).toBe(
      true,
    );
  });

  it('limits SCOPE barriers to that scope, without a participant generation', () => {
    const f = fixture();
    const transition = f.begin({
      operationId: uuid(1),
      sessionId: id(1),
      epoch: uuid(2),
      transitionToken: uuid(3),
      reason: 'SCOPE_CLOSED',
      target: { type: 'SCOPE', scope: audience.scope },
    });
    expect(transition.blocks({ ...audience, callGeneration: 99, participantId: id(99) })).toBe(
      true,
    );
    expect(transition.blocks({ ...audience, scope: { type: 'MAIN' } })).toBe(false);
  });
});

describe('cleanup acknowledgements and retries', () => {
  it.each(['operationId', 'sessionId', 'epoch', 'transitionToken', 'callGeneration', 'target'])(
    'rejects an acknowledgement with a mismatching %s',
    async (field) => {
      const f = fixture();
      f.adapters.media.mockImplementation(
        async (value) =>
          ({
            ...ack(value),
            [field]:
              field === 'callGeneration'
                ? 2
                : field === 'target'
                  ? { type: 'PARTICIPANT', participantId: id(7) }
                  : field === 'sessionId'
                    ? id(7)
                    : uuid(7),
          }) as SessionCleanupResult,
      );
      const transition = f.begin();
      const pending = transition.runForeground();
      await vi.runAllTimersAsync();
      await pending;
      expect(transition.inspect().phase).toBe('DEGRADED');
      expect(f.adapters.media).toHaveBeenCalledTimes(1);
      expect(transition.blocks(audience)).toBe(true);
      expect(f.inGate(() => transition.commitHeld(f.context, () => true)).ok).toBe(false);
    },
  );

  it('retries a settled retryable failure with the same operation and token, at most twice', async () => {
    const f = fixture();
    f.adapters.media
      .mockImplementationOnce(async (value) => ack(value, retryable))
      .mockImplementationOnce(async (value) => ack(value, retryable));
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    expect((await pending).phase).toBe('READY');
    expect(f.adapters.media).toHaveBeenCalledTimes(3);
    expect(f.adapters.media.mock.calls.map(([value]) => value)).toEqual([
      request,
      request,
      request,
    ]);
  });

  it('retains deny for nonretryable or invalid acknowledgement flags', async () => {
    const f = fixture();
    f.adapters.media.mockImplementation(async (value) =>
      ack(value, { ...retryable, retryable: false }),
    );
    f.adapters.messaging.mockImplementation(async (value) =>
      ack(value, {
        permissionRevoked: true,
        pendingInvalidated: false,
        cleanupPending: false,
      } as unknown as SessionCleanupResult['outcome']),
    );
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    await pending;
    expect(f.adapters.media).toHaveBeenCalledTimes(1);
    expect(f.adapters.messaging).toHaveBeenCalledTimes(1);
    expect(transition.inspect().permissionRevoked).toBe(false);
    expect(transition.blocks(audience)).toBe(true);
  });

  it('sanitizes adapter exceptions and stops foreground retries', async () => {
    const f = fixture();
    f.adapters.media.mockRejectedValue(new Error('private-storage-path'));
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    await pending;
    expect(f.adapters.media).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(transition.inspect())).not.toContain('private-storage-path');
    expect(transition.blocks(audience)).toBe(true);
  });

  it('does not let caller or adapter mutations change the admitted request', async () => {
    const f = fixture();
    const mutable = structuredClone(request);
    const transition = f.begin(mutable);
    mutable.operationId = uuid(8);
    f.adapters.media.mockImplementation(async (value) => {
      const result = ack(value);
      value.operationId = uuid(9);
      return result;
    });
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    expect((await pending).phase).toBe('READY');
    expect(f.context.isCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: uuid(1) }),
    );
  });
});

describe('late I/O, invalidation and reconciliation', () => {
  it('keeps timed-out I/O in admission, never overlaps it, and has bounded reconciliation', async () => {
    const f = fixture();
    const late = deferred<SessionCleanupResult>();
    f.adapters.media.mockImplementation(() => late.promise);
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.runAllTimersAsync();
    expect((await pending).phase).toBe('DEGRADED');
    expect(f.admission.stats().active).toBe(1);
    const reconcile = transition.reconcile();
    expect(transition.reconcile()).toBe(reconcile);
    await vi.runAllTimersAsync();
    await reconcile;
    expect(f.adapters.media).toHaveBeenCalledTimes(1);
    expect(f.admission.stats().active).toBe(1);
    late.resolve(ack(request));
    await vi.runAllTimersAsync();
    expect(f.admission.stats().active).toBe(0);
    expect(transition.inspect().phase).toBe('DEGRADED');
    expect(f.inGate(() => transition.commitHeld(f.context, () => true)).ok).toBe(false);
  });

  it('invalidates immediately during I/O and late success never commits a superseded transition', async () => {
    const f = fixture();
    const late = deferred<SessionCleanupResult>();
    f.adapters.media.mockImplementation(() => late.promise);
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.advanceTimersByTimeAsync(300);
    expect(f.inGate(() => transition.invalidateHeld(f.context))).toBe(true);
    expect((await pending).phase).toBe('CANCELLED');
    expect(transition.blocks(audience)).toBe(true);
    expect(f.inGate(() => transition.retireCancelledHeld(f.context))).toBe(false);
    late.resolve(ack(request));
    await vi.runAllTimersAsync();
    const commit = vi.fn(() => true);
    expect(f.inGate(() => transition.commitHeld(f.context, commit)).ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(f.inGate(() => transition.retireCancelledHeld(f.context))).toBe(true);
    expect(transition.inspect().barrierActive).toBe(false);
    expect(transition.blocks(audience)).toBe(false);
  });

  it('revalidates a late completion instead of automatically granting authority', async () => {
    const f = fixture();
    const late = deferred<SessionCleanupResult>();
    f.adapters.media.mockImplementation(() => late.promise);
    const transition = f.begin();
    const pending = transition.runForeground();
    await vi.advanceTimersByTimeAsync(2100);
    await pending;
    f.stale();
    late.resolve(ack(request));
    await vi.advanceTimersByTimeAsync(0);
    const commit = vi.fn(() => true);
    expect(f.inGate(() => transition.commitHeld(f.context, commit)).ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(transition.blocks(audience)).toBe(true);
  });

  it('can reconcile a settled foreground failure and still requires an explicit commit', async () => {
    const f = fixture();
    let calls = 0;
    f.adapters.media.mockImplementation(async (value) =>
      ack(value, ++calls <= 3 ? retryable : confirmed),
    );
    const transition = f.begin();
    const reconcile = transition.reconcile();
    await vi.runAllTimersAsync();
    expect((await reconcile).phase).toBe('READY');
    expect(calls).toBe(4);
    expect(transition.blocks(audience)).toBe(true);
    expect(f.inGate(() => transition.commitHeld(f.context, () => true))).toEqual({ ok: true });
  });

  it('does not start foreground I/O after the accepted operation deadline', async () => {
    const f = fixture();
    const transition = f.begin();
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await transition.runForeground()).phase).toBe('DEGRADED');
    expect(f.adapters.media).not.toHaveBeenCalled();
    expect(transition.blocks(audience)).toBe(true);
  });

  it('keeps an exhausted background plan bounded and preserves deny', async () => {
    const f = fixture();
    f.adapters.media.mockImplementation(async (value) => ack(value, retryable));
    const transition = f.begin();
    const pending = transition.reconcile();
    await vi.runAllTimersAsync();
    expect((await pending).phase).toBe('DEGRADED');
    expect(f.adapters.media).toHaveBeenCalledTimes(6);
    expect(f.admission.stats().active).toBe(0);
    expect(transition.reconcile()).toBe(pending);
    expect(transition.blocks(audience)).toBe(true);
  });

  it('fails closed when an injected clock goes backwards', async () => {
    const f = fixture();
    let time = 0;
    const transition = f.inGate(() =>
      beginSessionTransition(request, f.context, f.adapters, {
        userId: id(9),
        admission: f.admission,
        now: () => time,
      }),
    );
    time = -1;
    expect(transition.inspect().phase).toBe('DEGRADED');
    expect((await transition.reconcile()).phase).toBe('DEGRADED');
    expect(f.adapters.media).not.toHaveBeenCalled();
    expect(transition.blocks(audience)).toBe(true);
  });
});

describe('shared cleanup admission', () => {
  it('bounds user/session/process concurrency and releases slots idempotently', () => {
    const admission = new CleanupAdmission({ perUser: 1, perSession: 2, process: 3 });
    const first = admission.tryAcquire('a', 'one')!;
    expect(admission.tryAcquire('a', 'two')).toBeNull();
    const second = admission.tryAcquire('b', 'one')!;
    expect(admission.tryAcquire('c', 'one')).toBeNull();
    const third = admission.tryAcquire('c', 'two')!;
    expect(admission.tryAcquire('d', 'three')).toBeNull();
    first();
    first();
    second();
    third();
    expect(admission.stats()).toEqual({ active: 0, users: 0, sessions: 0 });
  });

  it('allows deny/invalidation even when all I/O admission slots are full', () => {
    const f = fixture();
    const releases = [
      f.admission.tryAcquire(id(9), `${id(1)}:${uuid(2)}`)!,
      f.admission.tryAcquire(id(9), `${id(1)}:${uuid(2)}`)!,
    ];
    const transition = f.begin({ ...request, reason: 'ACCESS_REVOKED' });
    expect(transition.blocks(audience)).toBe(true);
    expect(f.inGate(() => transition.invalidateHeld(f.context))).toBe(true);
    releases.forEach((release) => release());
  });
});
