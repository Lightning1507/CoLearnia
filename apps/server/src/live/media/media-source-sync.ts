import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  mediaSourceEventSchemas,
  mediaSourcesResyncInputSchema,
  mediaSourcesSnapshotSchema,
  requestIdSchema,
  sameSessionScope,
  sessionControlBudget,
} from '@colearnia/contracts';
import type {
  LiveContext,
  MediaSourceEvent,
  MediaSourceEventName,
  MediaSourcesResyncInput,
  MediaSourcesSnapshot,
} from '@colearnia/contracts';
import { MainJoinError } from '../session-manager/main-join-registry.js';
import type { createMainJoinRegistry } from '../session-manager/main-join-registry.js';
import type { createPausedReadySignaling } from './paused-ready-signaling.js';
import type { createTransportSignaling, ResourceGrant } from './transport-signaling.js';

type Payload = MediaSourcesSnapshot['payload'];
type Socket = {
  id: string;
  connected: boolean;
  on(
    event: 'media.sources.resync',
    listener: (raw: unknown, ack?: (raw: unknown) => void) => void,
  ): unknown;
  once(event: 'disconnect', listener: () => void): unknown;
  emit(event: MediaSourceEventName | 'media.sources.snapshot', packet: unknown): unknown;
};
type SnapshotHeader = Omit<MediaSourcesSnapshot, 'partIndex' | 'partCount' | 'payload'>;
type Delta = {
  [Name in MediaSourceEventName]: { name: Name; packet: MediaSourceEvent<Name> };
}[MediaSourceEventName];
type Stream = {
  context: LiveContext;
  id: string;
  sequence: number;
  visible: Payload;
  acknowledged: Set<string>;
  requiresSnapshot: boolean;
};
const empty = (): Payload => ({
  sources: [],
  ownTransports: [],
  ownProducers: [],
  ownConsumers: [],
});
const bytes = (packet: unknown) => Buffer.byteLength(JSON.stringify(packet) ?? '', 'utf8');
const { maxControlBytes, maxSnapshotPartBytes, maxSnapshotBytes, maxSnapshotParts } =
  sessionControlBudget;
// Bound concurrent snapshot copies, independently of the per-recipient latch.
const maxResyncsInFlight = 64;
// Bound retained ACK identities when close publication falls behind.
const maxAcknowledgedResources = 1024;

function sameAudience(left: LiveContext, right: LiveContext) {
  return (
    left.sessionId === right.sessionId &&
    left.epoch === right.epoch &&
    left.participantId === right.participantId &&
    left.callGeneration === right.callGeneration &&
    left.audienceEpoch === right.audienceEpoch &&
    left.auth.userId === right.auth.userId &&
    left.auth.authSessionId === right.auth.authSessionId &&
    sameSessionScope(left.scope, right.scope)
  );
}

function grantKey(resource: ResourceGrant) {
  return 'consumerId' in resource
    ? JSON.stringify([
        'consumer',
        resource.consumerId,
        resource.sourceId,
        resource.sourceGeneration,
      ])
    : JSON.stringify(['transport', resource.transportId]);
}

function pack(header: SnapshotHeader, projection: Payload) {
  const payloads = [empty()];
  let current = payloads[0]!;
  function add<Key extends keyof Payload>(key: Key, rows: Payload[Key]) {
    // Budget for the largest legal part counters so final parts never grow past the cap.
    const fits = () =>
      bytes({
        ...header,
        partIndex: maxSnapshotParts - 1,
        partCount: maxSnapshotParts,
        payload: current,
      }) <= maxSnapshotPartBytes;
    for (const item of rows) {
      const next = [...current[key], item] as Payload[Key];
      current[key] = next;
      if (fits()) continue;
      next.pop();
      if (payloads.length >= maxSnapshotParts) return false;
      current = empty();
      current[key] = [item] as Payload[Key];
      if (!fits()) return false;
      payloads.push(current);
    }
    return true;
  }
  for (const key of Object.keys(projection) as (keyof Payload)[]) {
    if (!add(key, projection[key])) return;
  }
  const parts = payloads.map((payload, partIndex) =>
    mediaSourcesSnapshotSchema.parse({ ...header, partCount: payloads.length, partIndex, payload }),
  );
  if (parts.reduce((sum, part) => sum + bytes(part), 0) <= maxSnapshotBytes) return parts;
}

function isVisible(delta: Delta, current: Payload, { visible: sent, acknowledged }: Stream) {
  switch (delta.name) {
    case 'media.source.changed':
      return current.sources.some((source) =>
        isDeepStrictEqual(source, delta.packet.payload.source),
      );
    case 'media.source.ended': {
      const { sourceId, sourceGeneration, sourceRevision } = delta.packet.payload;
      return sent.sources.some(
        (source) =>
          source.sourceId === sourceId &&
          source.sourceGeneration === sourceGeneration &&
          source.sourceRevision <= sourceRevision,
      );
    }
    case 'media.producer.stateChanged': {
      const { sourceId, sourceGeneration, sourceRevision, producerId, state } =
        delta.packet.payload;
      const sources = state === 'CLOSED' ? sent.ownProducers : current.ownProducers;
      return sources.some(
        ({ source }) =>
          source.sourceId === sourceId &&
          source.sourceGeneration === sourceGeneration &&
          source.producerId === producerId &&
          (state === 'CLOSED'
            ? source.sourceRevision <= sourceRevision
            : source.sourceRevision === sourceRevision && source.publicationState === state),
      );
    }
    case 'media.consumer.closed': {
      const { consumerId, sourceId, sourceGeneration } = delta.packet.payload;
      return (
        acknowledged.has(grantKey(delta.packet.payload)) ||
        sent.ownConsumers.some(
          (consumer) =>
            consumer.consumerId === consumerId &&
            consumer.sourceId === sourceId &&
            consumer.sourceGeneration === sourceGeneration,
        )
      );
    }
    case 'media.transport.closed':
      return (
        acknowledged.has(grantKey(delta.packet.payload)) ||
        sent.ownTransports.some(
          (transport) => transport.transportId === delta.packet.payload.transportId,
        )
      );
  }
}

function recordDelta(delta: Delta, current: Payload, sent: Payload) {
  switch (delta.name) {
    case 'media.source.changed': {
      const { source } = delta.packet.payload;
      sent.sources = [
        ...sent.sources.filter((value) => value.sourceId !== source.sourceId),
        source,
      ];
      break;
    }
    case 'media.source.ended': {
      const { sourceId, sourceGeneration } = delta.packet.payload;
      sent.sources = sent.sources.filter(
        (source) => source.sourceId !== sourceId || source.sourceGeneration !== sourceGeneration,
      );
      break;
    }
    case 'media.producer.stateChanged': {
      const { producerId, sourceGeneration, state } = delta.packet.payload;
      sent.ownProducers = sent.ownProducers.filter(
        ({ source }) =>
          source.producerId !== producerId || source.sourceGeneration !== sourceGeneration,
      );
      if (state !== 'CLOSED') {
        const producer = current.ownProducers.find(
          ({ source }) => source.producerId === producerId,
        );
        if (producer) sent.ownProducers.push(producer);
      }
      break;
    }
    case 'media.consumer.closed':
      sent.ownConsumers = sent.ownConsumers.filter(
        (consumer) => consumer.consumerId !== delta.packet.payload.consumerId,
      );
      break;
    case 'media.transport.closed':
      sent.ownTransports = sent.ownTransports.filter(
        (transport) => transport.transportId !== delta.packet.payload.transportId,
      );
  }
}

export function createMediaSourceSync({
  withContext,
  transports,
  media,
}: {
  withContext: ReturnType<typeof createMainJoinRegistry>['withContext'];
  transports: Pick<
    ReturnType<typeof createTransportSignaling>,
    'readOwnTransports' | 'resourceGrants'
  >;
  media: Pick<ReturnType<typeof createPausedReadySignaling>, 'readOwnSources' | 'visibleSources'>;
}) {
  let resyncsInFlight = 0;
  return {
    attach(socket: Socket) {
      let stream: Stream | undefined;
      let snapshotInFlight = false;
      let snapshotDirty = false;

      const readProjection = (
        context: LiveContext,
        policy: Parameters<typeof media.visibleSources>[0],
        share?: Parameters<typeof media.visibleSources>[1],
      ): Payload => ({
        sources: media.visibleSources(policy, share),
        ownTransports: transports.readOwnTransports(socket.id, context),
        ...media.readOwnSources(context, policy, share),
      });

      function read(
        input: Pick<MediaSourcesResyncInput, 'sessionId' | 'epoch' | 'callGeneration'>,
      ) {
        return withContext(socket.id, input, (resolved, _router, policy, share) => {
          if (!resolved.ok) throw new MainJoinError(resolved.errorCode);
          if (!policy || !socket.connected) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
          const { context } = resolved;
          const projection = structuredClone(readProjection(context, policy, share));
          if (!stream || !sameAudience(stream.context, context)) {
            stream = {
              context,
              id: randomUUID(),
              sequence: 0,
              visible: empty(),
              acknowledged: new Set(),
              requiresSnapshot: true,
            };
          }
          return { context, projection, stream, sequence: stream.sequence };
        });
      }

      const unsubscribe = transports.resourceGrants.subscribe(socket.id, (context, grant) => {
        if (!stream || stream.requiresSnapshot || !sameAudience(stream.context, context)) return;
        const key = grantKey(grant);
        if (stream.acknowledged.size >= maxAcknowledgedResources && !stream.acknowledged.has(key)) {
          stream.requiresSnapshot = true;
          return;
        }
        stream.acknowledged.add(key);
      });
      socket.once('disconnect', () => {
        unsubscribe();
        stream = undefined;
      });
      socket.on('media.sources.resync', (raw, ack) => {
        if (typeof ack !== 'function') return;
        const candidate =
          raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
        const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
        let replied = false;
        const reply = (packet: unknown) => {
          if (replied) return;
          replied = true;
          ack(packet);
        };
        const deny = (code: string) =>
          reply({ requestId, error: { code, message: 'Không thể đồng bộ nguồn media.' } });
        const parsed = mediaSourcesResyncInputSchema.safeParse(raw);
        if (!parsed.success) return deny('VALIDATION_ERROR');
        if (bytes(raw) > maxControlBytes) return deny('PAYLOAD_TOO_LARGE');
        if (snapshotInFlight || resyncsInFlight >= maxResyncsInFlight) return deny('SERVER_BUSY');
        snapshotInFlight = true;
        resyncsInFlight++;
        snapshotDirty = false;
        const input = parsed.data;
        const deadline = performance.now() + sessionControlBudget.snapshotTimeoutMs;
        void (async () => {
          try {
            const captured = await read(input);
            const { context, sequence, projection } = captured;
            const header = {
              sessionId: context.sessionId,
              epoch: context.epoch,
              callGeneration: context.callGeneration,
              requestId,
              snapshotId: randomUUID(),
              mediaStreamId: captured.stream.id,
              mediaSequence: sequence,
              audienceEpoch: context.audienceEpoch,
              policyRevision: context.policyRevision,
            };
            const parts = pack(header, projection);
            if (!parts) return deny('SERVER_BUSY');

            await withContext(socket.id, input, (resolved, _router, policy, share) => {
              if (!resolved.ok) throw new MainJoinError(resolved.errorCode);
              if (!policy || !socket.connected || performance.now() >= deadline)
                throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
              if (
                stream !== captured.stream ||
                !sameAudience(context, resolved.context) ||
                context.policyRevision !== resolved.context.policyRevision
              )
                throw new MainJoinError('CONFLICT');
              if (
                snapshotDirty ||
                !isDeepStrictEqual(projection, readProjection(resolved.context, policy, share))
              )
                throw new MainJoinError('SERVER_BUSY');

              stream.visible = projection;
              if (stream.requiresSnapshot) stream.acknowledged.clear();
              stream.requiresSnapshot = false;
              const { snapshotId, mediaStreamId, mediaSequence, audienceEpoch, policyRevision } =
                header;
              reply({
                requestId,
                data: {
                  status: 'completed',
                  result: {
                    snapshotId,
                    mediaStreamId,
                    mediaSequence,
                    audienceEpoch,
                    policyRevision,
                    partCount: parts.length,
                  },
                },
              });
              for (const part of parts) socket.emit('media.sources.snapshot', part);
            });
          } catch (error) {
            deny(error instanceof MainJoinError ? error.code : 'DEPENDENCY_UNAVAILABLE');
          } finally {
            snapshotInFlight = false;
            resyncsInFlight--;
          }
        })();
      });

      // Invoke after the resource mutation has committed. Re-enter the recipient gate
      // before allocating a sequence and enqueueing the recipient's packet.
      return {
        async publish<Name extends MediaSourceEventName>(
          name: Name,
          payload: MediaSourceEvent<Name>['payload'],
        ) {
          if (snapshotInFlight) {
            snapshotDirty = true;
            return false;
          }
          const previous = stream;
          if (!previous || previous.requiresSnapshot) return false;
          return withContext(socket.id, previous.context, (resolved, _router, policy, share) => {
            if (snapshotInFlight) {
              snapshotDirty = true;
              return false;
            }
            if (
              stream !== previous ||
              !resolved.ok ||
              !policy ||
              !socket.connected ||
              !sameAudience(previous.context, resolved.context)
            ) {
              if (stream === previous) previous.requiresSnapshot = true;
              return false;
            }
            const { context } = resolved;
            const projection = readProjection(context, policy, share);
            const result = mediaSourceEventSchemas[name].safeParse({
              sessionId: context.sessionId,
              epoch: context.epoch,
              callGeneration: context.callGeneration,
              audienceEpoch: context.audienceEpoch,
              policyRevision: context.policyRevision,
              mediaStreamId: previous.id,
              mediaSequence: previous.sequence + 1,
              payload,
            });
            if (!result.success) return false;
            const delta = { name, packet: result.data } as Delta;
            if (!isVisible(delta, projection, previous)) return false;
            if (bytes(result.data) > maxControlBytes) {
              previous.requiresSnapshot = true;
              return false;
            }
            previous.sequence++;
            recordDelta(delta, projection, previous.visible);
            if (delta.name === 'media.consumer.closed' || delta.name === 'media.transport.closed')
              previous.acknowledged.delete(grantKey(delta.packet.payload));
            socket.emit(name, result.data);
            return true;
          });
        },
      };
    },
  };
}
