import {
  mediaProducerCreateAckSchema,
  mediaProducerCreateInputSchema,
  screenAcquireAckSchema,
  screenReleaseAckSchema,
} from '@colearnia/contracts';
import type {
  ScreenAcquireInput,
  ScreenReleaseInput,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup-client';
import type { Socket } from 'socket.io-client';
import type { CallIdentity } from './callController';
import { ScreenSharePicker } from './screenSharePicker';

type ProduceListener = (
  parameters: {
    appData: MediaTypes.AppData;
    rtpParameters: MediaTypes.RtpParameters;
    kind: MediaTypes.MediaKind;
  },
  callback: (result: { id: string }) => void,
  errback: (error: Error) => void,
) => void;

export function bindScreenShareSocket(
  identity: CallIdentity,
  socket: Pick<Socket, 'connected' | 'timeout' | 'on' | 'off'>,
  signal: AbortSignal,
  send: Pick<MediaTypes.Transport, 'id' | 'produce' | 'on' | 'off'>,
  publishOther: ProduceListener,
) {
  const envelope = (context: SessionProjectionCursor) => ({
    requestId: crypto.randomUUID(),
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    expectedPolicyRevision: context.policyRevision,
  });
  const produce: ProduceListener = (parameters, callback, errback) => {
    const { appData, rtpParameters } = parameters;
    const share = appData.screenShare as
      | {
          attempt: AbortSignal;
          input: ReturnType<typeof envelope>;
          sourceKind: 'SCREEN' | 'SCREEN_AUDIO';
          lease: Pick<ScreenReleaseInput['payload'], 'leaseId' | 'leaseGeneration'>;
        }
      | undefined;
    if (!share) return publishOther(parameters, callback, errback);
    void (async () => {
      share.attempt.throwIfAborted();
      if (!socket.connected) throw new Error('Screen share socket disconnected');
      const input = mediaProducerCreateInputSchema.parse({
        ...share.input,
        payload: {
          transportId: send.id,
          sourceKind: share.sourceKind,
          lease: share.lease,
          rtpParameters,
        },
      });
      const ack = mediaProducerCreateAckSchema.parse(
        await socket.timeout(5_000).emitWithAck('media.producer.create', input),
      );
      if (
        ack.requestId !== input.requestId ||
        'error' in ack ||
        ack.data.result.source.sourceKind !== share.sourceKind
      )
        throw new Error('Screen producer was not confirmed');
      callback({ id: ack.data.result.producerId });
    })().catch(errback);
  };
  const picker = new ScreenSharePicker(identity, {
    async acquire(context) {
      if (!socket.connected) throw new Error('Screen share socket disconnected');
      const input: ScreenAcquireInput = {
        ...envelope(context),
        payload: { scope: context.scope },
      };
      const ack = screenAcquireAckSchema.parse(
        await socket.timeout(5_000).emitWithAck('screen.acquire', input),
      );
      if (ack.requestId !== input.requestId) throw new Error('Unexpected screen acquire ACK');
      if ('error' in ack) throw new Error(ack.error.code);
      return ack.data.result;
    },
    async release(context, { leaseId, leaseGeneration }) {
      if (!socket.connected) throw new Error('Screen share socket disconnected');
      const input: ScreenReleaseInput = {
        ...envelope(context),
        payload: { leaseId, leaseGeneration },
      };
      for (let attempt = 0; attempt < 2 && socket.connected; attempt++) {
        try {
          const ack = screenReleaseAckSchema.parse(
            await socket.timeout(5_000).emitWithAck('screen.release', input),
          );
          if (ack.requestId === input.requestId && 'data' in ack) return;
        } catch {
          // The same lease can safely be released again while this call is connected.
        }
      }
      throw new Error('Screen release not confirmed');
    },
    async publish(context, { leaseId, leaseGeneration }, stream, attempt) {
      const producers: MediaTypes.Producer[] = [];
      const close = () => {
        for (const producer of producers) producer.close();
      };
      attempt.addEventListener('abort', close, { once: true });
      const tracks = [stream.getVideoTracks()[0], stream.getAudioTracks()[0]];
      for (const track of tracks) {
        if (!track || (track.kind === 'audio' && track.readyState !== 'live')) continue;
        attempt.throwIfAborted();
        const producer = await send.produce({
          track,
          stopTracks: false,
          appData: {
            screenShare: {
              input: envelope(context),
              attempt,
              sourceKind: track.kind === 'video' ? 'SCREEN' : 'SCREEN_AUDIO',
              lease: { leaseId, leaseGeneration },
            },
          },
        });
        if (attempt.aborted) producer.close();
        attempt.throwIfAborted();
        producers.push(producer);
        producer.on('transportclose', () => {
          if (!attempt.aborted) picker.cancel();
        });
      }
    },
    capture: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
  });
  const disconnect = () => picker.updateContext(null);
  const dispose = () => {
    send.off('produce', produce);
    socket.off('disconnect', disconnect);
    signal.removeEventListener('abort', dispose);
    picker.dispose();
  };
  if (signal.aborted) picker.dispose();
  else {
    send.on('produce', produce);
    socket.on('disconnect', disconnect);
    signal.addEventListener('abort', dispose, { once: true });
  }
  return picker;
}
