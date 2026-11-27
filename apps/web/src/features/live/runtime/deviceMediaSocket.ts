import {
  mediaDeviceProducerCloseAckSchema,
  mediaDeviceProducerCloseInputSchema,
  mediaProducerCreateAckSchema,
  mediaProducerCreateInputSchema,
} from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup-client';
import type { Socket } from 'socket.io-client';
import { DeviceCleanupUnconfirmedError, DeviceMedia, sameDeviceBinding } from './deviceMedia';
import type { DeviceMediaContext } from './deviceMedia';
import type { LobbyDevicePreferences } from '../lobby/LobbyDeviceCheck';
import type { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import type { MediaSourceDescriptor } from '@colearnia/contracts';

type PublishIntent = {
  context: DeviceMediaContext;
  signal: AbortSignal;
  source?: MediaSourceDescriptor;
};
type CloseTarget = { producerId: string } | { createRequestId: string };
type PendingClose = { context: DeviceMediaContext; target: CloseTarget };

function envelope(context: DeviceMediaContext) {
  return {
    requestId: crypto.randomUUID(),
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    expectedPolicyRevision: context.policyRevision,
  };
}

export function createDeviceMediaSocket(
  socket: Pick<Socket, 'connected' | 'volatile' | 'on' | 'off'>,
  send: Pick<MediaTypes.Transport, 'id' | 'produce'>,
  lifetime: AbortSignal,
  preferences?: LobbyDevicePreferences,
  media?: Pick<MediaSnapshotRuntime, 'bindCameraPreview'>,
) {
  const intents = new Map<string, PublishIntent>();
  const pendingClose = new Map<string, PendingClose>();
  async function emit(event: string, input: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!socket.connected) throw new Error('Media signaling unavailable');
    // Replay the same request after an ambiguous acknowledgement.
    try {
      return await socket.volatile.timeout(5000).emitWithAck(event, input);
    } catch {
      signal?.throwIfAborted();
      if (!socket.connected) throw new Error('Media signaling unavailable');
      return socket.volatile.timeout(5000).emitWithAck(event, input);
    }
  }

  async function close(kind: string, pending: PendingClose, context = pending.context) {
    const { target } = pending;
    const input = mediaDeviceProducerCloseInputSchema.parse({
      ...envelope(context),
      payload: { transportId: send.id, target },
    });
    try {
      const ack = mediaDeviceProducerCloseAckSchema.parse(
        await emit('media.producer.close', input),
      );
      if (
        ack.requestId !== input.requestId ||
        'error' in ack ||
        JSON.stringify(ack.data.result.target) !== JSON.stringify(target)
      ) {
        throw new Error('Unexpected device close acknowledgement');
      }
    } catch (error) {
      throw new DeviceCleanupUnconfirmedError(error);
    }
    if (pendingClose.get(kind) === pending) pendingClose.delete(kind);
  }

  const devices = new DeviceMedia(
    (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    async (track, context, signal) => {
      const previous = pendingClose.get(track.kind);
      if (previous) {
        if (sameDeviceBinding(previous.context, context)) await close(track.kind, previous);
        else pendingClose.delete(track.kind);
      }
      signal.throwIfAborted();
      const key = crypto.randomUUID();
      intents.set(key, { context, signal });
      try {
        const producer = await send.produce({
          track,
          stopTracks: false,
          appData: { deviceIntent: key },
        });
        pendingClose.delete(track.kind);
        producer.on('transportclose', () => devices.updateContext(null));
        const source = intents.get(key)?.source;
        const detachPreview =
          source && track.kind === 'video' ? media?.bindCameraPreview(source, track) : undefined;
        return {
          async close() {
            detachPreview?.();
            producer.close();
            const pending = { context, target: { producerId: producer.id } };
            pendingClose.set(track.kind, pending);
            await close(track.kind, pending);
          },
        };
      } catch (error) {
        track.stop();
        const unresolved = pendingClose.get(track.kind);
        if (unresolved) await close(track.kind, unresolved);
        throw error;
      } finally {
        intents.delete(key);
      }
    },
    {
      microphone: preferences?.microphone.deviceId ?? '',
      camera: preferences?.camera.deviceId ?? '',
    },
    async (device, context) => {
      const kind = device === 'microphone' ? 'audio' : 'video';
      const pending = pendingClose.get(kind);
      if (!pending) return;
      if (!sameDeviceBinding(pending.context, context)) {
        // This warning belongs to the previous binding. Never replay its close here.
        pendingClose.delete(kind);
        return;
      }
      await close(kind, pending, context);
    },
  );

  // Pass as publishOther to bindScreenShareSocket when sharing uses the same SEND transport.
  const produce = (
    {
      kind,
      rtpParameters,
      appData,
    }: {
      kind: MediaTypes.MediaKind;
      rtpParameters: MediaTypes.RtpParameters;
      appData: MediaTypes.AppData;
    },
    callback: (result: { id: string }) => void,
    errback: (error: Error) => void,
  ) => {
    const intent = typeof appData.deviceIntent === 'string' && intents.get(appData.deviceIntent);
    if (!intent) return errback(new Error('Missing device publish intent'));
    void (async () => {
      intent.signal.throwIfAborted();
      const sourceKind = kind === 'audio' ? 'MIC' : 'CAMERA';
      const input = mediaProducerCreateInputSchema.parse({
        ...envelope(intent.context),
        payload: { transportId: send.id, sourceKind, rtpParameters },
      });
      pendingClose.set(kind, {
        context: intent.context,
        target: { createRequestId: input.requestId },
      });
      const ack = mediaProducerCreateAckSchema.parse(
        await emit('media.producer.create', input, intent.signal),
      );
      if (
        ack.requestId !== input.requestId ||
        'error' in ack ||
        ack.data.result.source.sourceKind !== sourceKind
      ) {
        throw new Error('Device producer was not confirmed');
      }
      const { producerId } = ack.data.result;
      intent.source = ack.data.result.source;
      intent.signal.throwIfAborted();
      callback({ id: producerId });
    })().catch(errback);
  };

  const disconnect = () => devices.updateContext(null);
  const dispose = () => {
    socket.off('disconnect', disconnect);
    devices.dispose();
  };
  if (lifetime.aborted) dispose();
  else {
    socket.on('disconnect', disconnect);
    lifetime.addEventListener('abort', dispose, { once: true });
  }
  return { devices, produce };
}
