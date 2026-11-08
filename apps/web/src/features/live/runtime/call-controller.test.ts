import { describe, expect, it, vi } from 'vitest';
import { CallControllerOwner } from './call-controller';
import type { CallIdentity } from './call-controller';

const identity: CallIdentity = {
  sessionId: '111111111111111111111111',
  epoch: '10000000-0000-4000-8000-000000000003',
  participantId: '222222222222222222222222',
  callGeneration: 2,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('CallControllerOwner', () => {
  it('shares the same pending and active controller for concurrent acquires', async () => {
    const owner = new CallControllerOwner();
    const pending = deferred<() => void>();
    const dispose = vi.fn();
    const initialize = vi.fn(() => pending.promise);

    const first = owner.acquire(identity, initialize);
    const second = owner.acquire({ ...identity }, initialize);
    expect(second).toBe(first);
    expect(owner.getSnapshot()).toEqual({ status: 'starting', identity });
    pending.resolve(dispose);
    const controller = await first;
    expect(await owner.acquire(identity, initialize)).toBe(controller);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot()).toEqual({ status: 'active', identity });

    owner.end({ ...identity });
    owner.end(identity);
    owner.shutdown();
    expect(owner.getSnapshot()).toEqual({ status: 'idle' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each<CallIdentity>([
    { ...identity, sessionId: '333333333333333333333333' },
    { ...identity, epoch: '10000000-0000-4000-8000-000000000004' },
    { ...identity, participantId: '444444444444444444444444' },
    { ...identity, callGeneration: 3 },
  ])(
    'requires the full identity to end or reuse ownership ($sessionId/$epoch/$participantId/$callGeneration)',
    async (next) => {
      const owner = new CallControllerOwner();
      const dispose = vi.fn();
      const initialize = vi.fn(() => dispose);
      const old = await owner.acquire(identity, initialize);

      await expect(owner.acquire(next, initialize)).rejects.toThrow('End the current call');
      owner.end(next);
      expect(dispose).not.toHaveBeenCalled();
      expect(initialize).toHaveBeenCalledTimes(1);

      owner.end(identity);
      const replacement = await owner.acquire(next, initialize);
      owner.end(identity);
      expect(replacement).not.toBe(old);
      expect(owner.getSnapshot()).toEqual({ status: 'active', identity: next });
      expect(dispose).toHaveBeenCalledTimes(1);
      owner.shutdown();
      expect(dispose).toHaveBeenCalledTimes(2);
    },
  );

  it('allows retry after a failed initialization for the same identity', async () => {
    const owner = new CallControllerOwner();
    const error = new Error('Bootstrap failed');
    const dispose = vi.fn();
    const initialize = vi.fn<() => (() => void) | Promise<() => void>>();
    initialize.mockRejectedValueOnce(error).mockReturnValueOnce(dispose);

    const failed = owner.acquire(identity, initialize);
    expect(owner.acquire(identity, initialize)).toBe(failed);
    await expect(failed).rejects.toBe(error);
    expect(owner.getSnapshot()).toEqual({ status: 'idle' });
    await expect(owner.acquire(identity, initialize)).resolves.toMatchObject({ identity });
    expect(initialize).toHaveBeenCalledTimes(2);
    owner.end(identity);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes resources returned after end without publishing stale state or closing the replacement', async () => {
    const owner = new CallControllerOwner();
    const pending = deferred<() => void>();
    const started = deferred<AbortSignal>();
    const lateDisposed = deferred<void>();
    const disposeLate = vi.fn(() => lateDisposed.resolve());
    const disposeNext = vi.fn();
    const old = owner.acquire(identity, (_identity, signal) => {
      started.resolve(signal);
      return pending.promise;
    });
    const signal = await started.promise;
    const aborted = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    owner.end(identity);
    await aborted;
    expect(signal.aborted).toBe(true);

    const next = { ...identity, callGeneration: 3 };
    await owner.acquire(next, () => disposeNext);
    const updated = vi.fn();
    const unsubscribe = owner.subscribe(updated);
    pending.resolve(disposeLate);
    await lateDisposed.promise;

    expect(owner.getSnapshot()).toEqual({ status: 'active', identity: next });
    expect(disposeLate).toHaveBeenCalledTimes(1);
    expect(disposeNext).not.toHaveBeenCalled();
    expect(updated).not.toHaveBeenCalled();
    unsubscribe();
    owner.shutdown();
  });

  it('cancels pending startup on shutdown before allocating runtime resources', async () => {
    const owner = new CallControllerOwner();
    const initialize = vi.fn(() => vi.fn());
    const pending = owner.acquire(identity, initialize);
    const aborted = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    owner.shutdown();
    owner.shutdown();

    await aborted;
    expect(initialize).not.toHaveBeenCalled();
    expect(owner.getSnapshot()).toEqual({ status: 'idle' });
    await expect(owner.acquire(identity, initialize)).rejects.toThrow('owner is closed');
  });
});
