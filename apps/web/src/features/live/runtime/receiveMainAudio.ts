import {
  mediaConsumerCloseAckSchema,
  mediaConsumerCreateAckSchema,
  mediaConsumerReadyAckSchema,
} from '@colearnia/contracts';
import type { MediaSourceDescriptor } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup-client';
import type { MediaSnapshot } from './mediaSnapshot';
import type { MediaSnapshotRuntime } from './mediaSnapshotRuntime';

// The authenticated signaling adapter enforces a finite ACK deadline per send.
type Command = (
  event: 'media.consumer.create' | 'media.consumer.ready' | 'media.consumer.close',
  envelope: {
    requestId: string;
    sessionId: string;
    epoch: string;
    callGeneration: number;
    expectedPolicyRevision: number;
    payload: object;
  },
) => Promise<unknown>;

// The MAIN call adapter supplies its authenticated signaling port and current RECV transport.
export async function receiveMainAudio({
  media,
  snapshot,
  source,
  transport,
  rtpCapabilities,
  command,
  signal,
}: {
  media: MediaSnapshotRuntime;
  snapshot: MediaSnapshot;
  source: MediaSourceDescriptor;
  transport: Pick<MediaTypes.Transport, 'id' | 'consume'>;
  rtpCapabilities: MediaTypes.RtpCapabilities;
  command: Command;
  signal: AbortSignal;
}) {
  signal.throwIfAborted();
  if (
    source.scope.type !== 'MAIN' ||
    (source.sourceKind !== 'MIC' && source.sourceKind !== 'SCREEN_AUDIO') ||
    snapshot.payload.ownProducers.some(({ source: own }) => own.producerId === source.producerId)
  ) {
    throw new Error('Expected a remote MAIN audio source');
  }
  const { sourceId, sourceGeneration, sourceRevision, producerId } = source;
  const sourceVersion = { sourceId, sourceGeneration, expectedSourceRevision: sourceRevision };
  const send = (event: Parameters<Command>[0], requestId: string, payload: object) =>
    command(event, {
      requestId,
      sessionId: snapshot.sessionId,
      epoch: snapshot.epoch,
      callGeneration: snapshot.callGeneration,
      expectedPolicyRevision: snapshot.policyRevision,
      payload,
    });

  const createId = crypto.randomUUID();
  const created = mediaConsumerCreateAckSchema.parse(
    await send('media.consumer.create', createId, {
      ...sourceVersion,
      producerId,
      transportId: transport.id,
      rtpCapabilities,
    }),
  );
  if (created.requestId !== createId || 'error' in created) {
    throw new Error('MAIN audio Consumer creation failed');
  }
  const result = created.data.result;
  if (
    result.kind !== 'audio' ||
    result.producerId !== producerId ||
    result.sourceId !== sourceId ||
    result.sourceGeneration !== sourceGeneration ||
    result.sourceRevision !== sourceRevision
  ) {
    throw new Error('MAIN audio Consumer binding changed');
  }
  const closeRemote = async () => {
    const requestId = crypto.randomUUID();
    const sendClose = () =>
      send('media.consumer.close', requestId, {
        consumerId: result.consumerId,
        sourceId,
        sourceGeneration,
        transportId: transport.id,
      });
    const closed = mediaConsumerCloseAckSchema.parse(await sendClose().catch(() => sendClose()));
    if (
      closed.requestId !== requestId ||
      'error' in closed ||
      closed.data.result.consumerId !== result.consumerId
    ) {
      throw new Error('MAIN audio Consumer cleanup was not confirmed');
    }
  };
  if (signal.aborted) {
    await closeRemote();
    signal.throwIfAborted();
  }
  const consumer = await transport
    .consume({
      id: result.consumerId,
      producerId,
      kind: 'audio',
      rtpParameters: result.rtpParameters as MediaTypes.RtpParameters,
    })
    .catch(async (error: unknown) => {
      await closeRemote();
      throw error;
    });
  const binding = {
    sourceId,
    sourceGeneration,
    sourceRevision,
    producerId,
    consumerId: consumer.id,
    paused: true,
    ready: false,
  };
  const detach = () => media.detachConsumer(binding, handle);
  const handle = {
    audioTrack: consumer.track,
    attach: () => {
      consumer.observer.once('close', detach);
      signal.addEventListener('abort', detach, { once: true });
    },
    close: () => {
      signal.removeEventListener('abort', detach);
      consumer.observer.off('close', detach);
      consumer.close();
    },
  };
  try {
    signal.throwIfAborted();
    if (!media.attachConsumer(snapshot, binding, handle)) throw new Error('Stale audio Consumer');
    const readyId = crypto.randomUUID();
    const sendReady = () =>
      send('media.consumer.ready', readyId, { ...sourceVersion, consumerId: consumer.id });
    let ready = mediaConsumerReadyAckSchema.safeParse(await sendReady().catch(() => undefined));
    if (
      !ready.success ||
      ready.data.requestId !== readyId ||
      ('error' in ready.data && ready.data.error.code === 'OPERATION_IN_PROGRESS')
    ) {
      signal.throwIfAborted();
      if (consumer.closed) throw new Error('MAIN audio Consumer already closed');
      ready = mediaConsumerReadyAckSchema.safeParse(await sendReady());
    }
    signal.throwIfAborted();
    if (
      !ready.success ||
      ready.data.requestId !== readyId ||
      'error' in ready.data ||
      ready.data.data.result.consumerId !== consumer.id ||
      consumer.closed ||
      !media.confirmConsumerReady(snapshot, binding, handle)
    ) {
      throw new Error('MAIN audio Consumer is no longer current');
    }
    return consumer;
  } catch (error) {
    detach();
    if (!consumer.closed) handle.close();
    try {
      await closeRemote();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'MAIN audio Consumer cleanup unconfirmed');
    }
    throw error;
  }
}
