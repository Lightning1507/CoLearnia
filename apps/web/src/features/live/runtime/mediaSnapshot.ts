import { sameSessionScope } from '@colearnia/contracts';
import type { MediaSourceDescriptor, MediaSourcesSnapshot } from '@colearnia/contracts';

export type MediaSnapshotPayload = MediaSourcesSnapshot['payload'];
export type ConsumerBinding = MediaSnapshotPayload['ownConsumers'][number];
export type MediaSnapshot = Readonly<Omit<MediaSourcesSnapshot, 'partIndex'>>;

export function sameSourceBinding(
  left: Pick<ConsumerBinding, 'sourceId' | 'sourceGeneration' | 'producerId'>,
  right: Pick<ConsumerBinding, 'sourceId' | 'sourceGeneration' | 'producerId'>,
) {
  return (
    left.sourceId === right.sourceId &&
    left.sourceGeneration === right.sourceGeneration &&
    left.producerId === right.producerId
  );
}

export function sameSourceDescriptor(left: MediaSourceDescriptor, right: MediaSourceDescriptor) {
  return (
    sameSourceBinding(left, right) &&
    left.sourceRevision === right.sourceRevision &&
    left.ownerParticipantId === right.ownerParticipantId &&
    left.sourceKind === right.sourceKind &&
    left.publicationState === right.publicationState &&
    sameSessionScope(left.scope, right.scope)
  );
}

export function joinMediaSnapshot(
  parts: readonly MediaSourcesSnapshot[],
  participantId: string,
): MediaSnapshot | undefined {
  const first = parts[0];
  if (!first) return;
  const sources = new Map<string, MediaSourceDescriptor>();
  const ownSourceIds = new Set<string>();
  const producerSources = new Map<string, string>();
  const transportIds = new Set<string>();
  const consumerIds = new Set<string>();
  const consumedSources = new Set<string>();
  const payload: MediaSnapshotPayload = {
    sources: [],
    ownTransports: [],
    ownProducers: [],
    ownConsumers: [],
  };

  for (const part of parts) {
    for (const source of part.payload.sources) {
      if (sources.has(source.sourceId) || producerSources.has(source.producerId)) return;
      sources.set(source.sourceId, source);
      producerSources.set(source.producerId, source.sourceId);
      payload.sources.push(source);
    }
  }

  for (const part of parts) {
    for (const transport of part.payload.ownTransports) {
      if (transportIds.has(transport.transportId)) return;
      transportIds.add(transport.transportId);
      payload.ownTransports.push(transport);
    }
    for (const producer of part.payload.ownProducers) {
      const { source } = producer;
      const visible = sources.get(source.sourceId);
      const producerSource = producerSources.get(source.producerId);
      if (
        source.ownerParticipantId !== participantId ||
        ownSourceIds.has(source.sourceId) ||
        (producerSource !== undefined && (!visible || producerSource !== source.sourceId)) ||
        (visible && !sameSourceDescriptor(visible, source))
      )
        return;
      ownSourceIds.add(source.sourceId);
      producerSources.set(source.producerId, source.sourceId);
      payload.ownProducers.push(producer);
    }
    for (const consumer of part.payload.ownConsumers) {
      const source = sources.get(consumer.sourceId);
      if (
        consumerIds.has(consumer.consumerId) ||
        consumedSources.has(consumer.sourceId) ||
        !source ||
        !sameSourceBinding(source, consumer) ||
        source.sourceRevision !== consumer.sourceRevision
      )
        return;
      consumerIds.add(consumer.consumerId);
      consumedSources.add(consumer.sourceId);
      payload.ownConsumers.push(consumer);
    }
  }
  if (
    payload.sources.some(
      (source) => source.ownerParticipantId === participantId && !ownSourceIds.has(source.sourceId),
    )
  )
    return;

  const {
    sessionId,
    epoch,
    callGeneration,
    requestId,
    snapshotId,
    mediaStreamId,
    mediaSequence,
    audienceEpoch,
    policyRevision,
    partCount,
  } = first;
  return {
    sessionId,
    epoch,
    callGeneration,
    requestId,
    snapshotId,
    mediaStreamId,
    mediaSequence,
    audienceEpoch,
    policyRevision,
    partCount,
    payload,
  };
}
