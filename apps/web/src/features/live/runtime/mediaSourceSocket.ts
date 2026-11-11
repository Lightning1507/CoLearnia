import { mediaSourceEventSchemas } from '@colearnia/contracts';
import type { MediaSourceEventName, MediaSourcesResyncInput } from '@colearnia/contracts';
import type { MediaSnapshotRuntime } from './mediaSnapshotRuntime';

type MediaEvent = MediaSourceEventName | 'media.sources.snapshot';
type Listener = (packet: unknown) => void;
type MediaSourceSocket = {
  readonly connected: boolean;
  on(event: MediaEvent, listener: Listener): unknown;
  off(event: MediaEvent, listener: Listener): unknown;
  emit(event: 'media.sources.resync', input: MediaSourcesResyncInput, ack: Listener): unknown;
};

// Bind to the authenticated socket owned by the current call adapter. The session
// flow supplies the accepted M4 cursor separately through runtime.updateContext.
export function bindMediaSourceSocket(
  runtime: MediaSnapshotRuntime,
  socket: MediaSourceSocket,
  signal: AbortSignal,
) {
  if (signal.aborted) return () => {};
  const listeners = new Map<MediaEvent, Listener>();
  for (const name of Object.keys(mediaSourceEventSchemas) as MediaSourceEventName[]) {
    listeners.set(name, (packet) => runtime.acceptEvent(name, packet));
  }
  let acceptPart: Listener | undefined;
  listeners.set('media.sources.snapshot', (packet) => acceptPart?.(packet));
  for (const [name, listener] of listeners) socket.on(name, listener);
  const unbind = runtime.bindResync((input, receive) => {
    if (!socket.connected) throw new Error('Media signaling socket is disconnected');
    acceptPart = (packet) => {
      if (
        packet &&
        typeof packet === 'object' &&
        'requestId' in packet &&
        packet.requestId === input.requestId
      )
        receive.acceptPart(packet);
    };
    socket.emit('media.sources.resync', input, receive.acceptAck);
  });
  const dispose = () => {
    signal.removeEventListener('abort', dispose);
    unbind();
    acceptPart = undefined;
    for (const [name, listener] of listeners) socket.off(name, listener);
    listeners.clear();
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
