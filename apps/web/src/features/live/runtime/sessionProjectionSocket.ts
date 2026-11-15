import { sessionProjectionEventNameSchema } from '@colearnia/contracts';
import type { SessionProjectionEventName, SessionResyncInput } from '@colearnia/contracts';
import type { CallControllerOwner } from './callController';
import { SessionProjectionRuntime } from './sessionProjectionRuntime';

type Listener = (packet: unknown) => void;
type Event = SessionProjectionEventName | 'session.snapshot' | 'session.ended' | 'disconnect';
export type SessionProjectionSocket = {
  readonly connected: boolean;
  on(event: Event, listener: Listener): unknown;
  off(event: Event, listener: Listener): unknown;
  emit(event: 'session.resync', input: SessionResyncInput, ack: Listener): unknown;
};

export function bindSessionProjectionSocket(
  runtime: SessionProjectionRuntime,
  socket: SessionProjectionSocket,
  signal: AbortSignal,
) {
  if (signal.aborted) return () => {};
  const listeners = new Map<Event, Listener>();
  let acceptPart: Listener | undefined;
  let unbind = () => {};
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    unbind();
    acceptPart = undefined;
    for (const [name, listener] of listeners) socket.off(name, listener);
    listeners.clear();
  }
  signal.addEventListener('abort', dispose, { once: true });
  for (const name of sessionProjectionEventNameSchema.options) {
    listeners.set(name, (packet) => runtime.acceptEvent(packet));
  }
  listeners.set('session.snapshot', (packet) => acceptPart?.(packet));
  listeners.set('session.ended', (packet) => runtime.acceptEnded(packet));
  // Resume is owned by the authenticated join flow. Never revive the old
  // generation on socket.connect or replay a cached private projection.
  listeners.set('disconnect', () => {
    runtime.close();
    dispose();
  });
  for (const [name, listener] of listeners) socket.on(name, listener);
  unbind = runtime.bindResync((input, receive) => {
    if (!socket.connected) throw new Error('Session signaling socket is disconnected');
    acceptPart = (packet) => {
      if (
        packet &&
        typeof packet === 'object' &&
        'requestId' in packet &&
        packet.requestId === input.requestId
      )
        receive.acceptPart(packet);
    };
    socket.emit('session.resync', input, receive.acceptAck);
  });
  // A synchronous terminal ACK can abort ownership while bindResync is running.
  if (disposed) unbind();
  return dispose;
}

type Initialize = Parameters<CallControllerOwner['acquire']>[1];

// Pass this initializer to owner.acquire only after a successful current join
// or resume ACK. RoomShell and its slots observe the runtime without owning it.
export function createSessionProjectionInitializer({
  owner,
  socket,
  onRuntime,
  initialize,
}: {
  owner: CallControllerOwner;
  socket: SessionProjectionSocket;
  onRuntime: (runtime: SessionProjectionRuntime) => void;
  initialize?: Initialize;
}): Initialize {
  return async (identity, signal, media) => {
    const runtime = new SessionProjectionRuntime(identity, signal, media, () =>
      owner.end(identity),
    );
    const unbind = bindSessionProjectionSocket(runtime, socket, signal);
    try {
      onRuntime(runtime);
      const dispose = await initialize?.(identity, signal, media);
      return () => {
        unbind();
        runtime.close();
        dispose?.();
      };
    } catch (error) {
      unbind();
      runtime.close();
      throw error;
    }
  };
}
