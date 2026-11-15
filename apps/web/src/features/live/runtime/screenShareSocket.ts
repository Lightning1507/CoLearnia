import { screenAcquireAckSchema, screenReleaseAckSchema } from '@colearnia/contracts';
import type {
  ScreenAcquireInput,
  ScreenReleaseInput,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { Socket } from 'socket.io-client';
import type { CallIdentity } from './callController';
import { ScreenSharePicker } from './screenSharePicker';

export function bindScreenShareSocket(
  identity: CallIdentity,
  socket: Pick<Socket, 'connected' | 'volatile' | 'on' | 'off'>,
  signal: AbortSignal,
) {
  const envelope = (context: SessionProjectionCursor) => ({
    requestId: crypto.randomUUID(),
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    expectedPolicyRevision: context.policyRevision,
  });
  const picker = new ScreenSharePicker(identity, {
    async acquire(context) {
      if (!socket.connected) throw new Error('Screen share socket disconnected');
      const input: ScreenAcquireInput = {
        ...envelope(context),
        payload: { scope: context.scope },
      };
      const ack = screenAcquireAckSchema.parse(
        await socket.volatile.timeout(5_000).emitWithAck('screen.acquire', input),
      );
      if (ack.requestId !== input.requestId) throw new Error('Unexpected screen acquire ACK');
      if ('error' in ack) throw new Error(ack.error.code);
      return ack.data.result;
    },
    async release(context, { leaseId, leaseGeneration }) {
      if (!socket.connected) return;
      const input: ScreenReleaseInput = {
        ...envelope(context),
        payload: { leaseId, leaseGeneration },
      };
      const ack = screenReleaseAckSchema.parse(
        await socket.volatile.timeout(5_000).emitWithAck('screen.release', input),
      );
      if (ack.requestId !== input.requestId || 'error' in ack)
        throw new Error('Screen release not confirmed');
    },
    capture: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
  });
  const disconnect = () => picker.updateContext(null);
  const dispose = () => {
    socket.off('disconnect', disconnect);
    signal.removeEventListener('abort', dispose);
    picker.dispose();
  };
  if (signal.aborted) picker.dispose();
  else {
    socket.on('disconnect', disconnect);
    signal.addEventListener('abort', dispose, { once: true });
  }
  return picker;
}
