import { describe, expect, it, vi } from 'vitest';
import { createPasswordWorkGate, PasswordWorkBusyError } from './password-hash.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('password work gate', () => {
  it('keeps one native slot and refuses work beyond the two waiting slots', async () => {
    const run = createPasswordWorkGate();
    const active = deferred();
    const signal = new AbortController().signal;
    const order: number[] = [];
    const first = run(() => active.promise, signal);
    const second = run(async () => order.push(2), signal);
    const third = run(async () => order.push(3), signal);
    await expect(run(async () => order.push(4), signal)).rejects.toBeInstanceOf(
      PasswordWorkBusyError,
    );
    expect(order).toEqual([]);
    active.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([2, 3]);
  });

  it('expires waiters, cancels disconnected waiters and keeps a running slot until settlement', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const run = createPasswordWorkGate();
      const active = deferred();
      const running = new AbortController();
      const waiting = new AbortController();
      const next = vi.fn(async () => 'next');
      const work = vi.fn(() => active.promise);
      const first = run(work, running.signal);
      const cancelled = run(next, waiting.signal);
      const timedOut = run(next, new AbortController().signal);
      const disconnect = new Error('test client disconnected');
      const cancelledCheck = expect(cancelled).rejects.toBe(disconnect);
      // Attach the assertions before time or cancellation can reject either promise.
      const expiredCheck = expect(timedOut).rejects.toBeInstanceOf(PasswordWorkBusyError);
      await Promise.resolve();
      expect(work).toHaveBeenCalledOnce();
      running.abort();
      waiting.abort(disconnect);
      await cancelledCheck;
      await vi.advanceTimersByTimeAsync(250);
      await expiredCheck;
      const followUp = run(next, new AbortController().signal);
      expect(next).not.toHaveBeenCalled();
      active.resolve();
      await first;
      await expect(followUp).resolves.toBe('next');
      expect(next).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
