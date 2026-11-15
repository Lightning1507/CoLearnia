import { afterEach, expect, it, vi } from 'vitest';
import { createSessionConnections } from './session-connections.js';

afterEach(() => vi.useRealTimers());

it('closes all connections for the expired session and calls cleanup once', async () => {
  vi.useFakeTimers();
  const expire = vi.fn(async () => true);
  const connections = createSessionConnections(expire);
  const first = {
    userId: 'user',
    authSessionId: 'first',
    expiresAt: new Date(Date.now() + 1000).toISOString(),
  };
  const closeA = vi.fn();
  const closeB = vi.fn();
  const closeOther = vi.fn();
  connections.track(first, closeA);
  connections.track(first, closeB);
  const untrack = connections.track(
    {
      ...first,
      authSessionId: 'second',
      expiresAt: new Date(Date.now() + 2000).toISOString(),
    },
    closeOther,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(closeA).toHaveBeenCalledOnce();
  expect(closeB).toHaveBeenCalledOnce();
  expect(closeOther).not.toHaveBeenCalled();
  expect(expire).toHaveBeenCalledExactlyOnceWith(first);
  untrack();
  await vi.advanceTimersByTimeAsync(1000);
  expect(expire).toHaveBeenCalledOnce();
});

it('retries cleanup after closing the last connection and stops after confirmation', async () => {
  vi.useFakeTimers();
  const expire = vi
    .fn<() => Promise<boolean>>()
    .mockRejectedValueOnce(new Error('Coordinator busy'))
    .mockResolvedValueOnce(false)
    .mockResolvedValue(true);
  const unconfirmed = vi.fn();
  const connections = createSessionConnections(expire, unconfirmed);
  const auth = {
    userId: 'user',
    authSessionId: 'first',
    expiresAt: new Date(Date.now() + 100).toISOString(),
  };
  const disconnect = vi.fn();
  connections.track(auth, disconnect);
  await vi.advanceTimersByTimeAsync(3100);
  expect(disconnect).toHaveBeenCalledOnce();
  expect(expire.mock.calls).toEqual([[auth], [auth], [auth]]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(expire).toHaveBeenCalledTimes(3);
  expect(unconfirmed).not.toHaveBeenCalled();
});
