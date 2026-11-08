import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import { createOperationCoordinator, type CoordinationContext } from './operation-coordinator.js';

const userId = 'a'.repeat(24);
const workspaceId = 'b'.repeat(24);
const other = 'c'.repeat(24);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared User/Workspace coordination', () => {
  it('serializes two domains on one Workspace in FIFO order; independent Workspace proceeds', async () => {
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    const events: string[] = [];
    const m1 = coordinator.run({ workspaceId }, async () => {
      events.push('m1');
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const m2 = coordinator.run({ workspaceId }, () => {
      events.push('m2');
    });
    const m4 = coordinator.run({ workspaceId }, () => {
      events.push('m4');
    });
    await coordinator.run({ workspaceId: other }, () => {
      events.push('independent');
    });
    expect(events).toEqual(['m1', 'independent']);
    held.resolve();
    await Promise.all([m1, m2, m4]);
    expect(events).toEqual(['m1', 'independent', 'm2', 'm4']);
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });

  it('acquires User before Workspace, shares ownership with auth consumers and normalizes IDs', async () => {
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    const workspace = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const combined = coordinator.run({ userId, workspaceId }, (context) => {
      context.assertHeld({ userId });
      context.assertHeld({ workspaceId });
    });
    await flush();
    const login = vi.fn();
    const auth = coordinator.run({ userId: userId.toUpperCase() }, login);
    await flush();
    expect(login).not.toHaveBeenCalled();
    held.resolve();
    await Promise.all([workspace, combined, auth]);
    expect(login).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    'releases both locks on callback failure (async: %s)',
    async (asyncFailure) => {
      const coordinator = createOperationCoordinator();
      const failure = new Error('consumer failed');
      await expect(
        coordinator.run({ userId, workspaceId }, () => {
          if (asyncFailure) return Promise.reject(failure);
          throw failure;
        }),
      ).rejects.toBe(failure);
      await expect(coordinator.run({ userId, workspaceId }, () => 'next')).resolves.toBe('next');
      expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
    },
  );

  it('rejects nested acquisition including reverse order and another instance; reuses context instead', async () => {
    const coordinator = createOperationCoordinator();
    const second = createOperationCoordinator();
    await coordinator.run({ workspaceId }, async (context) => {
      context.assertHeld({ workspaceId });
      expect(() => context.assertHeld({ userId })).toThrow('INVALID_CONTEXT');
      await expect(coordinator.run({ userId }, () => undefined)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
      await expect(second.run({ workspaceId }, () => undefined)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
    });
  });

  it('invalidates context after callback and outside its async execution', async () => {
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    let saved!: CoordinationContext;
    const running = coordinator.run({ workspaceId }, async (context) => {
      saved = context;
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    expect(() => saved.assertHeld({ workspaceId })).toThrow('INVALID_CONTEXT');
    held.resolve();
    await running;
    expect(() => saved.assertHeld({ workspaceId })).toThrow('INVALID_CONTEXT');
  });

  it('removes canceled waiters and releases partial User ownership without running work', async () => {
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    const running = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const abort = new AbortController();
    const callback = vi.fn();
    const waiting = coordinator.run({ userId, workspaceId }, callback, { signal: abort.signal });
    const rejected = expect(waiting).rejects.toMatchObject({ code: 'ABORTED' });
    await flush();
    abort.abort();
    await rejected;
    expect(callback).not.toHaveBeenCalled();
    await coordinator.run({ userId }, () => undefined);
    expect(coordinator.stats()).toMatchObject({ pending: 0, keys: 1 });
    held.resolve();
    await running;
  });

  it('uses one acquisition deadline across keys and never force-releases running callbacks', async () => {
    vi.useFakeTimers();
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    const running = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const callback = vi.fn();
    const waiting = coordinator.run({ userId, workspaceId }, callback, { waitTimeoutMs: 10 });
    const rejected = expect(waiting).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(11);
    await rejected;
    expect(callback).not.toHaveBeenCalled();
    expect(coordinator.stats()).toMatchObject({ operations: 1, keys: 1 });
    held.resolve();
    await running;
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });

  it('does not restart the wait budget after acquiring User', async () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const coordinator = createOperationCoordinator();
    const userHeld = deferred();
    const workspaceHeld = deferred();
    const userEntered = deferred();
    const workspaceEntered = deferred();
    const first = coordinator.run({ userId }, async () => {
      userEntered.resolve();
      await userHeld.promise;
    });
    const second = coordinator.run({ workspaceId }, async () => {
      workspaceEntered.resolve();
      await workspaceHeld.promise;
    });
    await Promise.all([userEntered.promise, workspaceEntered.promise]);
    const callback = vi.fn();
    const waiting = coordinator.run({ userId, workspaceId }, callback, { waitTimeoutMs: 10 });
    const rejected = expect(waiting).rejects.toMatchObject({ code: 'TIMEOUT' });
    elapsed = 6;
    await vi.advanceTimersByTimeAsync(6);
    userHeld.resolve();
    await first;
    await flush();
    elapsed = 11;
    await vi.advanceTimersByTimeAsync(5);
    await rejected;
    expect(callback).not.toHaveBeenCalled();
    await coordinator.run({ userId }, () => undefined);
    workspaceHeld.resolve();
    await second;
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });

  it('releases a granted lock if cancellation wins before callback entry', async () => {
    const coordinator = createOperationCoordinator();
    const abort = new AbortController();
    const held = deferred();
    const entered = deferred();
    const first = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const callback = vi.fn();
    const waiting = coordinator.run({ workspaceId }, callback, { signal: abort.signal });
    const rejected = expect(waiting).rejects.toMatchObject({ code: 'ABORTED' });
    const afterHandoff = first.then(() => {
      // release() has shifted the waiter out of the queue, but run() has not
      // entered its callback yet. This is distinct from aborting a queued waiter.
      expect(coordinator.stats().pending).toBe(0);
      expect(callback).not.toHaveBeenCalled();
      abort.abort();
    });
    held.resolve();
    await Promise.all([afterHandoff, rejected]);
    expect(callback).not.toHaveBeenCalled();
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });

  it('visits multiple Workspaces sequentially while retaining User ownership', async () => {
    const coordinator = createOperationCoordinator();
    const held = deferred();
    const entered = deferred();
    const login = vi.fn();
    const events: string[] = [];
    let stale!: CoordinationContext;
    const revoke = coordinator.run({ userId }, async (userContext) => {
      await userContext.withWorkspace(workspaceId, async (context) => {
        context.assertHeld({ userId, workspaceId });
        stale = context;
        events.push('first');
        entered.resolve();
        await held.promise;
      });
      userContext.assertHeld({ userId });
      expect(() => stale.assertHeld({ workspaceId })).toThrow('INVALID_CONTEXT');
      await userContext.withWorkspace(other, (context) => {
        context.assertHeld({ userId, workspaceId: other });
        events.push('second');
      });
      expect(login).not.toHaveBeenCalled();
    });
    await entered.promise;
    const competingLogin = coordinator.run({ userId }, login);
    const m2 = coordinator.run({ workspaceId }, () => {
      events.push('m2');
    });
    await flush();
    expect(events).toEqual(['first']);
    held.resolve();
    await Promise.all([revoke, competingLogin, m2]);
    expect(events).toEqual(['first', 'm2', 'second']);
    expect(login).toHaveBeenCalledOnce();
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, workspaceVisits: 2 });
  });

  it('releases a failing Workspace visit while User stays held for recovery', async () => {
    const coordinator = createOperationCoordinator();
    const failure = new Error('cleanup failed');
    const login = vi.fn();
    const entered = deferred();
    const held = deferred();
    const parent = coordinator.run({ userId }, async (context) => {
      await expect(
        context.withWorkspace(workspaceId, () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      entered.resolve();
      await held.promise;
      await context.withWorkspace(workspaceId, (child) =>
        child.assertHeld({ userId, workspaceId }),
      );
    });
    await entered.promise;
    await coordinator.run({ workspaceId }, () => undefined);
    const competingLogin = coordinator.run({ userId }, login);
    await flush();
    expect(login).not.toHaveBeenCalled();
    held.resolve();
    await Promise.all([parent, competingLogin]);
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });

  it.each(['ABORTED', 'TIMEOUT'] as const)(
    'rejects a waiting child with %s without releasing User early',
    async (code) => {
      vi.useFakeTimers();
      const coordinator = createOperationCoordinator();
      const held = deferred();
      const entered = deferred();
      const blocker = coordinator.run({ workspaceId }, async () => {
        entered.resolve();
        await held.promise;
      });
      await entered.promise;
      const abort = new AbortController();
      const callback = vi.fn();
      await coordinator.run({ userId }, async (context) => {
        const child = context.withWorkspace(workspaceId, callback, {
          waitTimeoutMs: 10,
          signal: abort.signal,
        });
        const rejected = expect(child).rejects.toMatchObject({ code });
        if (code === 'ABORTED') abort.abort();
        else await vi.advanceTimersByTimeAsync(11);
        await rejected;
        context.assertHeld({ userId });
        expect(coordinator.stats().operations).toBe(2);
      });
      expect(callback).not.toHaveBeenCalled();
      held.resolve();
      await blocker;
      expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
    },
  );

  it('rejects overlapping visits, cross-Workspace nesting, reverse acquisition and stale contexts', async () => {
    const coordinator = createOperationCoordinator();
    let stale!: CoordinationContext;
    const held = deferred();
    const entered = deferred();
    await coordinator.run({ userId }, async (context) => {
      stale = context;
      const child = context.withWorkspace(workspaceId, async (inner) => {
        await expect(inner.withWorkspace(other, () => undefined)).rejects.toMatchObject({
          code: 'INVALID_CONTEXT',
        });
        await expect(coordinator.run({ userId }, () => undefined)).rejects.toMatchObject({
          code: 'INVALID_CONTEXT',
        });
        entered.resolve();
        await held.promise;
      });
      await entered.promise;
      await expect(context.withWorkspace(other, () => undefined)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
      held.resolve();
      await child;
    });
    await expect(stale.withWorkspace(workspaceId, () => undefined)).rejects.toMatchObject({
      code: 'INVALID_CONTEXT',
    });
    await coordinator.run({ workspaceId }, async (context) => {
      await expect(context.withWorkspace(other, () => undefined)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
    });
  });

  it.each([true, false])(
    'drains an outstanding child before releasing User when parent fails: %s',
    async (fails) => {
      const coordinator = createOperationCoordinator();
      const held = deferred();
      const entered = deferred();
      const failure = new Error('parent failed');
      const login = vi.fn();
      const parent = coordinator.run({ userId }, async (context) => {
        // Misuse defense: even if a caller forgets to await, User cannot escape the child.
        void context.withWorkspace(workspaceId, async () => {
          entered.resolve();
          await held.promise;
        });
        await entered.promise;
        if (fails) throw failure;
      });
      const outcome = fails
        ? expect(parent).rejects.toBe(failure)
        : expect(parent).resolves.toBeUndefined();
      await entered.promise;
      const competingLogin = coordinator.run({ userId }, login);
      await flush();
      expect(login).not.toHaveBeenCalled();
      expect(coordinator.stats().keys).toBe(2);
      held.resolve();
      await Promise.all([outcome, competingLogin]);
      expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
    },
  );

  it('inherits parent cancellation while waiting for Workspace and keeps admission bounded', async () => {
    const coordinator = createOperationCoordinator({
      maxPendingPerKey: 1,
      maxOperations: 2,
      waitTimeoutMs: 5000,
    });
    const held = deferred();
    const entered = deferred();
    const blocker = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const abort = new AbortController();
    const parent = coordinator.run(
      { userId },
      async (context) => {
        const callback = vi.fn();
        const child = context.withWorkspace(workspaceId, callback, {
          signal: new AbortController().signal,
        });
        const rejected = expect(child).rejects.toMatchObject({ code: 'ABORTED' });
        await flush();
        expect(coordinator.stats()).toMatchObject({ operations: 2, pending: 1 });
        abort.abort();
        await rejected;
        expect(callback).not.toHaveBeenCalled();
        context.assertHeld({ userId });
        await expect(context.withWorkspace(other, callback)).rejects.toMatchObject({
          code: 'ABORTED',
        });
      },
      { signal: abort.signal },
    );
    await parent;
    held.resolve();
    await blocker;
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });

  it('keeps User ownership after a child queue rejects overload', async () => {
    const coordinator = createOperationCoordinator({
      maxPendingPerKey: 1,
      maxOperations: 3,
      waitTimeoutMs: 5000,
    });
    const held = deferred();
    const entered = deferred();
    const blocker = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const waiting = coordinator.run({ workspaceId }, () => undefined);
    await flush();
    await coordinator.run({ userId }, async (context) => {
      const callback = vi.fn();
      await expect(context.withWorkspace(workspaceId, callback)).rejects.toMatchObject({
        code: 'BUSY',
      });
      expect(callback).not.toHaveBeenCalled();
      context.assertHeld({ userId });
      await context.withWorkspace(other, (child) =>
        child.assertHeld({ userId, workspaceId: other }),
      );
    });
    held.resolve();
    await Promise.all([blocker, waiting]);
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });

  it('does not release either scope on cancellation during a running Workspace callback', async () => {
    const coordinator = createOperationCoordinator();
    const abort = new AbortController();
    const held = deferred();
    const entered = deferred();
    const parent = coordinator.run({ userId }, async (context) => {
      await context.withWorkspace(
        workspaceId,
        async () => {
          entered.resolve();
          await held.promise;
        },
        { signal: abort.signal },
      );
    });
    await entered.promise;
    abort.abort();
    const login = vi.fn();
    const m2 = vi.fn();
    const pending = [coordinator.run({ userId }, login), coordinator.run({ workspaceId }, m2)];
    await flush();
    expect(login).not.toHaveBeenCalled();
    expect(m2).not.toHaveBeenCalled();
    held.resolve();
    await Promise.all([parent, ...pending]);
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });

  it.each([
    'COORDINATOR_MAX_PENDING_PER_KEY',
    'COORDINATOR_MAX_OPERATIONS',
    'COORDINATOR_WAIT_TIMEOUT_MS',
  ])('validates configuration for %s', (name) => {
    for (const value of ['0', '-1', '1.5', 'Infinity', 'invalid']) {
      expect(() => loadConfig({ [name]: value })).toThrow();
    }
    expect(loadConfig({ [name]: '1' })[name as keyof ReturnType<typeof loadConfig>]).toBe(1);
  });

  it('keeps a running callback locked after its abort signal fires', async () => {
    const coordinator = createOperationCoordinator();
    const abort = new AbortController();
    const held = deferred();
    const entered = deferred();
    const running = coordinator.run(
      { userId },
      async () => {
        entered.resolve();
        await held.promise;
      },
      { signal: abort.signal },
    );
    await entered.promise;
    abort.abort();
    const next = vi.fn();
    const waiting = coordinator.run({ userId }, next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    held.resolve();
    await Promise.all([running, waiting]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('bounds each queue and global admitted operations including partial acquisitions', async () => {
    const coordinator = createOperationCoordinator({
      maxPendingPerKey: 1,
      maxOperations: 3,
      waitTimeoutMs: 5000,
    });
    const held = deferred();
    const entered = deferred();
    const running = coordinator.run({ workspaceId }, async () => {
      entered.resolve();
      await held.promise;
    });
    await entered.promise;
    const waiting = coordinator.run({ workspaceId }, () => undefined);
    await flush();
    await expect(coordinator.run({ workspaceId }, () => undefined)).rejects.toMatchObject({
      code: 'BUSY',
    });
    const third = coordinator.run({ userId, workspaceId }, () => undefined);
    // This also fails per-key and releases the partially acquired User gate.
    await expect(third).rejects.toMatchObject({ code: 'BUSY' });
    held.resolve();
    await Promise.all([running, waiting]);
    const single = createOperationCoordinator({
      maxPendingPerKey: 1,
      maxOperations: 1,
      waitTimeoutMs: 5000,
    });
    const barrier = deferred();
    const active = single.run({ userId }, () => barrier.promise);
    await expect(single.run({ workspaceId }, () => undefined)).rejects.toMatchObject({
      code: 'BUSY',
    });
    barrier.resolve();
    await active;
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });

  it('rejects invalid scopes, limits, budgets and pre-aborted operations', async () => {
    expect(() =>
      createOperationCoordinator({ maxPendingPerKey: 0, maxOperations: 1, waitTimeoutMs: 1 }),
    ).toThrow();
    const coordinator = createOperationCoordinator();
    for (const scope of [{}, { userId: 'invalid' }]) {
      await expect(coordinator.run(scope, () => undefined)).rejects.toThrow();
    }
    await expect(
      coordinator.run({ userId }, () => undefined, { waitTimeoutMs: 5001 }),
    ).rejects.toThrow();
    const callback = vi.fn();
    await expect(
      coordinator.run({ userId }, callback, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(callback).not.toHaveBeenCalled();
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0 });
  });
});
