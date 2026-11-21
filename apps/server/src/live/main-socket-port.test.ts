import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { createMainSocketPort } from './main-socket-port.js';
function setup() {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const transport = Object.assign(new EventEmitter(), { writable: true });
  const raw = {
    connected: true,
    conn: { transport },
    volatile: { emit: vi.fn() },
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => unknown) =>
      listeners.set(event, listener),
    once: (event: string, listener: (...args: unknown[]) => unknown) =>
      listeners.set(event, listener),
  };
  let allowed = true;
  const dispatch = vi.fn(async (_event: string, _input: unknown, send: () => void) => {
    if (!allowed) return false;
    send();
    return true;
  });
  const port = createMainSocketPort(raw as unknown as Socket, dispatch);
  return {
    raw,
    port,
    listeners,
    transport,
    dispatch,
    revoke: () => {
      allowed = false;
    },
  };
}
afterEach(() => vi.useRealTimers());
it('keeps private packets out of Engine.IO and revalidates them after drain', async () => {
  const f = setup();
  f.transport.writable = false;
  f.port.emit('session.snapshot', { fragment: 'private' });
  expect(f.raw.emit).not.toHaveBeenCalled();
  expect(f.raw.volatile.emit).not.toHaveBeenCalled();
  f.revoke();
  f.transport.writable = true;
  f.transport.emit('drain');
  await vi.waitFor(() => expect(f.raw.disconnect).toHaveBeenCalledWith(true));
  expect(f.raw.volatile.emit).not.toHaveBeenCalled();
});
it('sends a pending ACK after drain only through the authority callback', async () => {
  const f = setup();
  let finish: ((value: unknown) => void) | undefined;
  f.port.on('session.join', (_input, ack) => {
    finish = ack;
  });
  const ack = vi.fn();
  f.listeners.get('session.join')!({}, ack);
  f.transport.writable = false;
  finish!({ data: { grant: 'private' } });
  expect(ack).not.toHaveBeenCalled();
  f.transport.writable = true;
  f.transport.emit('drain');
  await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
  expect(f.dispatch).toHaveBeenCalledOnce();
});
it('disconnects a transport that does not drain within its bounded wait', async () => {
  vi.useFakeTimers();
  const f = setup();
  f.transport.writable = false;
  f.port.emit('session.snapshot', { fragment: 'private' });
  await vi.advanceTimersByTimeAsync(2001);
  expect(f.raw.disconnect).toHaveBeenCalledWith(true);
  expect(f.transport.listenerCount('drain')).toBe(0);
  expect(f.raw.volatile.emit).not.toHaveBeenCalled();
});
