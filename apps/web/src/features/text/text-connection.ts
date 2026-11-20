import type { Socket } from 'socket.io-client';

type Controller = { reconcile(): Promise<void>; stop(): void };

// Own one socket's connection/retry lifetime, including the time before its first ACK.
export function createTextConnection(
  socket: Socket,
  controller: Controller,
  handlers: { connected(): void; unavailable(): void; accessLost(): void },
) {
  let disposed = false;
  let denied = false;
  function disconnect() {
    denied = true;
    socket.disconnect();
  }
  function connected() {
    if (disposed || denied) return;
    handlers.connected();
    void controller.reconcile();
  }
  function failed(failure: unknown) {
    if (disposed || denied) return;
    const data = failure && typeof failure === 'object' && 'data' in failure ? failure.data : null;
    const code = data && typeof data === 'object' && 'code' in data ? String(data.code) : '';
    if (code === 'AUTH_REQUIRED' || code === 'CSRF_INVALID') {
      // Stop automatic reconnect and invalidate any controller resources before notifying UI.
      disconnect();
      controller.stop();
      handlers.accessLost();
    } else handlers.unavailable();
  }
  socket.on('connect', connected);
  socket.on('connect_error', failed);
  return {
    retry() {
      if (disposed || denied) return;
      if (socket.connected) void controller.reconcile();
      else socket.connect();
    },
    disconnect,
    dispose() {
      if (disposed) return;
      disposed = true;
      socket.off('connect', connected);
      socket.off('connect_error', failed);
      controller.stop();
      socket.disconnect();
    },
  };
}
