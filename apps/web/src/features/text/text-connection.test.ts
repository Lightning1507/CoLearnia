import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { createTextConnection } from './text-connection';

function fixture() {
  class TestSocket extends EventEmitter {
    connected = false;
    connect = vi.fn();
    disconnect = vi.fn(() => {
      this.connected = false;
    });
  }
  const socket = new TestSocket();
  const controller = { reconcile: vi.fn(async () => {}), stop: vi.fn() };
  const handlers = { connected: vi.fn(), unavailable: vi.fn(), accessLost: vi.fn() };
  const connection = createTextConnection(socket as unknown as Socket, controller, handlers);
  return { socket, controller, handlers, connection };
}

it('can retry before the first connect and reconciles only after connection succeeds', () => {
  const f = fixture();
  f.socket.emit('connect_error', { data: { code: 'DEPENDENCY_UNAVAILABLE' } });
  expect(f.handlers.unavailable).toHaveBeenCalledOnce();
  f.connection.retry();
  expect(f.socket.connect).toHaveBeenCalledOnce();
  expect(f.controller.reconcile).not.toHaveBeenCalled();
  f.socket.connected = true;
  f.socket.emit('connect');
  expect(f.handlers.connected).toHaveBeenCalledOnce();
  expect(f.controller.reconcile).toHaveBeenCalledOnce();
  f.connection.retry();
  expect(f.socket.connect).toHaveBeenCalledOnce();
  expect(f.controller.reconcile).toHaveBeenCalledTimes(2);
  expect(f.socket.listenerCount('connect')).toBe(1);
  expect(f.socket.listenerCount('connect_error')).toBe(1);
  f.connection.dispose();
});

it.each(['AUTH_REQUIRED', 'CSRF_INVALID'])(
  'never retries terminal %s or late connect callbacks',
  (code) => {
    const f = fixture();
    f.socket.emit('connect_error', { data: { code } });
    expect(f.handlers.accessLost).toHaveBeenCalledOnce();
    expect(f.controller.stop).toHaveBeenCalledOnce();
    f.connection.retry();
    f.socket.emit('connect');
    f.socket.emit('connect_error', { data: { code: 'DEPENDENCY_UNAVAILABLE' } });
    expect(f.socket.connect).not.toHaveBeenCalled();
    expect(f.controller.reconcile).not.toHaveBeenCalled();
    expect(f.handlers.connected).not.toHaveBeenCalled();
    expect(f.handlers.unavailable).not.toHaveBeenCalled();
    f.connection.dispose();
  },
);

it('disposal on scope change cancels retry and removes only its own listeners', () => {
  const f = fixture();
  const unrelated = vi.fn();
  f.socket.on('connect', unrelated);
  f.connection.retry();
  f.connection.dispose();
  f.connection.dispose();
  f.connection.retry();
  f.socket.emit('connect');
  f.socket.emit('connect_error', { data: { code: 'AUTH_REQUIRED' } });
  expect(f.socket.connect).toHaveBeenCalledOnce();
  expect(f.socket.disconnect).toHaveBeenCalledOnce();
  expect(f.controller.stop).toHaveBeenCalledOnce();
  expect(f.handlers.connected).not.toHaveBeenCalled();
  expect(f.handlers.accessLost).not.toHaveBeenCalled();
  expect(f.socket.listeners('connect')).toEqual([unrelated]);
  expect(f.socket.listenerCount('connect_error')).toBe(0);
});

it('does not reconnect after the projection has been revoked or blocked', () => {
  const f = fixture();
  f.connection.disconnect();
  f.connection.retry();
  f.socket.emit('connect');
  expect(f.socket.connect).not.toHaveBeenCalled();
  expect(f.controller.reconcile).not.toHaveBeenCalled();
  f.connection.dispose();
});
