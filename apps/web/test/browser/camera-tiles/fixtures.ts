import type {
  MediaSourceDescriptor,
  MediaSourcesSnapshot,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { MediaSnapshotRuntime } from '../../../src/features/live/runtime/mediaSnapshotRuntime';
import type { ConsumerBinding } from '../../../src/features/live/runtime/mediaSnapshot';

export const context: SessionProjectionCursor = {
  sessionId: '1'.repeat(24),
  epoch: '10000000-0000-4000-8000-000000000001',
  participantId: '2'.repeat(24),
  callGeneration: 1,
  audienceEpoch: 0,
  policyRevision: 0,
  projectionSequence: 1,
  scope: { type: 'MAIN' },
};
export const camera: MediaSourceDescriptor = {
  sourceId: 'camera',
  producerId: 'producer',
  sourceGeneration: 1,
  sourceRevision: 1,
  ownerParticipantId: '3'.repeat(24),
  sourceKind: 'CAMERA',
  kind: 'video',
  scope: { type: 'MAIN' },
  publicationState: 'PUBLISHING',
};
export const binding = {
  sourceId: camera.sourceId,
  producerId: camera.producerId,
  sourceGeneration: 1,
  sourceRevision: 1,
  consumerId: 'consumer',
  ready: false,
  paused: true,
};
export const watermark = {
  mediaStreamId: '10000000-0000-4000-8000-000000000002',
  mediaSequence: 0,
  snapshotId: '10000000-0000-4000-8000-000000000003',
  audienceEpoch: 0,
  policyRevision: 0,
  partCount: 1,
};
export function event(payload: object, mediaSequence: number) {
  return {
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    audienceEpoch: 0,
    policyRevision: 0,
    mediaStreamId: watermark.mediaStreamId,
    mediaSequence,
    payload,
  };
}
export function provideSnapshot(
  requestId: string,
  receive: Pick<NonNullable<ReturnType<MediaSnapshotRuntime['begin']>>, 'acceptAck' | 'acceptPart'>,
  sources = [camera],
  own = false,
  mediaSequence = 0,
  ownConsumers: ConsumerBinding[] = [],
) {
  const snapshot: MediaSourcesSnapshot = {
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    requestId,
    ...watermark,
    mediaSequence,
    partIndex: 0,
    payload: {
      sources,
      ownProducers: own ? sources.map((source) => ({ source, replacement: null })) : [],
      ownConsumers,
      ownTransports: [],
    },
  };
  receive.acceptAck({
    requestId,
    data: { status: 'completed', result: { ...watermark, mediaSequence } },
  });
  receive.acceptPart(snapshot);
}

export async function applySnapshot(
  media: MediaSnapshotRuntime,
  sources = [camera],
  own = false,
  mediaSequence = 0,
  ownConsumers: ConsumerBinding[] = [],
) {
  const requestId = crypto.randomUUID();
  const request = media.begin(requestId);
  if (!request) throw new Error('Missing fixture context');
  provideSnapshot(requestId, request, sources, own, mediaSequence, ownConsumers);
  const result = await request.result;
  if (result.status !== 'applied') throw new Error(`Fixture snapshot: ${result.status}`);
  return result.snapshot;
}
