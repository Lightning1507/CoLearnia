import { mediaSourceEventSchemas, sameSessionScope } from '@colearnia/contracts';
import type { MediaSourceEvent, MediaSourceEventName } from '@colearnia/contracts';
import { sameSourceBinding, sameSourceDescriptor } from './mediaSnapshot';
import type { MediaSnapshotPayload } from './mediaSnapshot';

type NamedEvent<Name extends MediaSourceEventName> = {
  name: Name;
  packet: MediaSourceEvent<Name>;
};

export type MediaDelta = {
  [Name in MediaSourceEventName]: NamedEvent<Name>;
}[MediaSourceEventName];

export function parseMediaDelta(name: MediaSourceEventName, raw: unknown): MediaDelta | undefined {
  const result = mediaSourceEventSchemas[name].safeParse(raw);
  // The key that selects the schema also discriminates its validated result.
  if (result.success) return { name, packet: result.data } as MediaDelta;
}

type Source = MediaSnapshotPayload['sources'][number];
type Version = Pick<Source, 'sourceId' | 'sourceGeneration' | 'sourceRevision'>;
type OwnProducer = MediaSnapshotPayload['ownProducers'][number];

function replacementFor(source: Source, own?: OwnProducer) {
  if (source.publicationState !== 'SWITCHING') return null;
  if (
    own?.replacement?.sourceRevision === source.sourceRevision &&
    sameSourceBinding(own.source, source) &&
    own.source.ownerParticipantId === source.ownerParticipantId &&
    own.source.sourceKind === source.sourceKind &&
    sameSessionScope(own.source.scope, source.scope)
  )
    return own.replacement;
  // The public delta omits the owner-only token. A snapshot must reconcile it.
  return undefined;
}

function matchesVersion(source: Version, version: Version) {
  return (
    source.sourceId === version.sourceId &&
    source.sourceGeneration === version.sourceGeneration &&
    source.sourceRevision <= version.sourceRevision
  );
}

export function applyMediaDelta(
  current: MediaSnapshotPayload,
  delta: MediaDelta,
  participantId: string,
): MediaSnapshotPayload | undefined {
  switch (delta.name) {
    case 'media.source.changed': {
      const { source } = delta.packet.payload;
      const previous = current.sources.find((value) => value.sourceId === source.sourceId);
      if (
        previous &&
        (previous.sourceGeneration > source.sourceGeneration ||
          (previous.sourceGeneration === source.sourceGeneration &&
            previous.sourceRevision > source.sourceRevision))
      )
        return current;

      if (
        (previous?.sourceGeneration === source.sourceGeneration &&
          (!sameSourceBinding(previous, source) ||
            previous.ownerParticipantId !== source.ownerParticipantId ||
            previous.sourceKind !== source.sourceKind ||
            !sameSessionScope(previous.scope, source.scope))) ||
        current.sources.some(
          (value) => value.producerId === source.producerId && value.sourceId !== source.sourceId,
        )
      )
        return;
      if (
        previous &&
        previous.sourceGeneration === source.sourceGeneration &&
        previous.sourceRevision === source.sourceRevision &&
        !sameSourceDescriptor(previous, source)
      )
        return;
      const own = current.ownProducers.find((value) => value.source.sourceId === source.sourceId);
      let ownProducers = current.ownProducers.filter(
        (value) => value !== own || value.source.sourceGeneration >= source.sourceGeneration,
      );
      if (
        source.ownerParticipantId === participantId &&
        (!own ||
          matchesVersion(own.source, source) ||
          own.source.sourceGeneration < source.sourceGeneration)
      ) {
        const replacement = replacementFor(source, own);
        if (replacement === undefined) return;
        ownProducers = [...ownProducers.filter((value) => value !== own), { source, replacement }];
      }
      return {
        ...current,
        sources: [...current.sources.filter((value) => value.sourceId !== source.sourceId), source],
        ownProducers,
        ownConsumers: current.ownConsumers.flatMap((value) => {
          if (value.sourceId !== source.sourceId) return [value];
          if (!sameSourceBinding(value, source)) return [];
          if (!value.ready && value.sourceRevision !== source.sourceRevision) return [];
          return [{ ...value, sourceRevision: source.sourceRevision }];
        }),
      };
    }
    case 'media.source.ended': {
      const version = delta.packet.payload;
      return {
        ...current,
        sources: current.sources.filter((source) => !matchesVersion(source, version)),
        ownConsumers: current.ownConsumers.filter((binding) => !matchesVersion(binding, version)),
      };
    }
    case 'media.producer.stateChanged': {
      const update = delta.packet.payload;
      const own = current.ownProducers.find(
        ({ source }) => source.producerId === update.producerId,
      );
      if (!own) {
        if (update.state === 'CLOSED') return current;
        // The delta omits the source descriptor and replacement token.
        return;
      }
      if (!matchesVersion(own.source, update)) return current;
      if (own.source.ownerParticipantId !== participantId) return;
      if (update.state === 'CLOSED') {
        return {
          ...current,
          ownProducers: current.ownProducers.filter((value) => value !== own),
          sources: current.sources.filter(
            (source) => source.producerId !== update.producerId || !matchesVersion(source, update),
          ),
          ownConsumers: current.ownConsumers.filter(
            (binding) =>
              binding.producerId !== update.producerId || !matchesVersion(binding, update),
          ),
        };
      }
      const source = {
        ...own.source,
        publicationState: update.state,
        sourceRevision: update.sourceRevision,
      };
      const replacement = replacementFor(source, own);
      if (replacement === undefined) return;
      return {
        ...current,
        ownProducers: current.ownProducers.map((value) =>
          value === own ? { source, replacement } : value,
        ),
      };
    }
    case 'media.consumer.closed': {
      const { consumerId, sourceId, sourceGeneration } = delta.packet.payload;
      return {
        ...current,
        ownConsumers: current.ownConsumers.filter(
          (value) =>
            value.consumerId !== consumerId ||
            value.sourceId !== sourceId ||
            value.sourceGeneration !== sourceGeneration,
        ),
      };
    }
    case 'media.transport.closed': {
      const { transportId } = delta.packet.payload;
      const closed = current.ownTransports.find((value) => value.transportId === transportId);
      if (!closed) return current;
      // The current binding has one transport per direction.
      const closesSend = closed.direction === 'SEND';
      return {
        ...current,
        ownTransports: current.ownTransports.filter((value) => value.transportId !== transportId),
        ownProducers: closesSend ? [] : current.ownProducers,
        ownConsumers: closesSend ? current.ownConsumers : [],
        sources: closesSend
          ? current.sources.filter((value) => value.ownerParticipantId !== participantId)
          : current.sources,
      };
    }
  }
}
