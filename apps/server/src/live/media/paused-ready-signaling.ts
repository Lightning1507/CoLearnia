import {
  mediaConsumerCreateAckSchema,
  mediaConsumerCreateInputSchema,
  mediaConsumerReadyAckSchema,
  mediaConsumerReadyInputSchema,
  mediaProducerCreateAckSchema,
  mediaProducerCreateInputSchema,
  requestIdSchema,
  sameSessionScope,
  sessionControlBudget,
} from '@colearnia/contracts';
import type { LiveContext, MediaSourceDescriptor } from '@colearnia/contracts';
import { randomUUID } from 'node:crypto';
import type { types as MediaTypes } from 'mediasoup';
import type { z } from 'zod';
import { outsideCoordination } from '../../lib/operation-coordinator.js';
import { canPublishMedia, canReceiveMedia } from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';
import type { createTransportSignaling, ResourceGrant } from './transport-signaling.js';

import type { HeldShareLease, SharePublication } from '../session-manager/share-lease.js';

type ScreenSourceChange = {
  type: 'published' | 'ended';
  source: MediaSourceDescriptor;
  owner: LiveContext;
};
type ScreenPublication = {
  ref: SharePublication;
  video?: MediaTypes.Producer;
  audio?: MediaTypes.Producer;
  stopped: boolean;
  inFlight: number;
};

type Produce = z.infer<typeof mediaProducerCreateInputSchema>;
type Consume = z.infer<typeof mediaConsumerCreateInputSchema>;
type Ready = z.infer<typeof mediaConsumerReadyInputSchema>;
type Binding = Ready['payload'];
type TransportService = Pick<
  ReturnType<typeof createTransportSignaling>,
  'withMediaTransport' | 'pendingMedia' | 'admission' | 'resourceGrants'
>;
type Failure = { errorCode: string };
type Work<T> = { work: Promise<T | Failure> };
type Grant = {
  payload: object;
  transportId: string;
  direction: 'SEND' | 'RECV';
  resource?: ResourceGrant;
  validate(
    current: LiveContext,
    policy: SessionPolicyInput,
    share?: HeldShareLease,
  ): Failure | undefined;
};
type NativeResource = Pick<MediaTypes.Producer, 'closed' | 'close'>;
type Operation = {
  isCancelled(): boolean;
  bindResource(resource: NativeResource): void;
};
type Bindings = readonly [owner: LiveContext, ...dependencies: LiveContext[]];
type CreateIntent = {
  userId: string;
  sessionKey: string;
} & ({ signature: string; result?: Grant } | { expiresAt: number });
type Source = {
  native: MediaTypes.Producer;
  descriptor: MediaSourceDescriptor;
  owner: LiveContext;
  publication?: ScreenPublication;
};
type Receiver = {
  native: MediaTypes.Consumer;
  source: Source;
  owner: LiveContext;
  socketId: string;
  transportId: string;
  capabilities: MediaTypes.RtpCapabilities;
  ready: boolean;
  timer: ReturnType<typeof setTimeout>;
};
type Event = 'media.producer.create' | 'media.consumer.create' | 'media.consumer.ready';
type SocketPort = {
  id: string;
  on(event: Event, listener: (raw: unknown, ack?: (value: unknown) => void) => void): unknown;
};

const fail = (errorCode: string): Failure => ({ errorCode });
const maxActiveResources = 512;
const closedIntentReplayMs = 60_000;

function matchesSource(source: Source, binding: Omit<Binding, 'consumerId'>): boolean {
  const { sourceId, sourceGeneration, sourceRevision } = source.descriptor;
  return (
    !source.native.closed &&
    sourceId === binding.sourceId &&
    sourceGeneration === binding.sourceGeneration &&
    sourceRevision === binding.expectedSourceRevision
  );
}

function mayReceive(policy: SessionPolicyInput, source: Source, share?: HeldShareLease): boolean {
  const { owner, descriptor } = source;
  const publisher = policy.session.participants.get(owner.participantId);
  return (
    !source.native.closed &&
    owner.sessionId === policy.session.sessionId &&
    owner.epoch === policy.session.epoch &&
    publisher?.callGeneration === owner.callGeneration &&
    publisher.auth.authSessionId === owner.auth.authSessionId &&
    publisher.audienceEpoch === owner.audienceEpoch &&
    sameSessionScope(publisher.scope, descriptor.scope) &&
    canReceiveMedia(policy, owner.participantId, descriptor.sourceKind) &&
    (!source.publication ||
      (!source.publication.stopped &&
        !source.publication.video?.closed &&
        share?.leases.canReceiveHeld(
          share.held,
          owner.participantId,
          descriptor.sourceKind,
          source.publication.ref,
        ) === true))
  );
}

function sameReceiver(left: LiveContext, right: LiveContext): boolean {
  return (
    left.participantId === right.participantId &&
    left.auth.userId === right.auth.userId &&
    left.auth.authSessionId === right.auth.authSessionId &&
    left.sessionId === right.sessionId &&
    left.epoch === right.epoch &&
    left.callGeneration === right.callGeneration &&
    left.audienceEpoch === right.audienceEpoch &&
    sameSessionScope(left.scope, right.scope)
  );
}

export function createPausedReadySignaling({
  withMediaTransport: withTransport,
  pendingMedia,
  admission,
  resourceGrants,
  onScreenSource,
}: TransportService & {
  onScreenSource?(change: ScreenSourceChange): void;
}) {
  const sources = new Map<string, Source>();
  const publications = new Map<string, ScreenPublication>();
  function notifyScreen(change: ScreenSourceChange) {
    if (!onScreenSource) return;
    // A notification consumer can re-enter a recipient gate once this mutation yields.
    queueMicrotask(() => outsideCoordination(() => onScreenSource(change)));
  }
  const receivers = new Map<string, Receiver>();
  const pending = new Set<string>();
  const reservedResources = new Set<string>();
  const createIntents = new Map<string, CreateIntent>();

  function receiverGrant(receiver: Receiver, input: Consume | Ready, payload: object): Grant {
    const { native, source, owner, transportId } = receiver;
    const ready = 'consumerId' in input.payload;
    return {
      payload,
      transportId,
      direction: 'RECV',
      resource: {
        consumerId: native.id,
        sourceId: source.descriptor.sourceId,
        sourceGeneration: source.descriptor.sourceGeneration,
      },
      validate(current, policy, share) {
        if (native.closed || receivers.get(native.id) !== receiver || !sameReceiver(owner, current))
          return fail('CONFLICT');
        if (!mayReceive(policy, source, share)) {
          native.close();
          return fail(ready ? 'FORBIDDEN' : 'NOT_FOUND');
        }
        if (!matchesSource(source, input.payload)) return fail('SOURCE_CHANGED');
        if (ready && native.paused) return fail('CONFLICT');
        return undefined;
      },
    };
  }

  function run<T>(
    key: string,
    bindings: Bindings,
    task: (operation: Operation) => Promise<T | Failure>,
  ): Work<T> | Failure {
    if (pending.has(key)) return fail('OPERATION_IN_PROGRESS');
    const [context] = bindings;
    const release = admission.tryAcquire(
      context.auth.userId,
      `${context.sessionId}:${context.epoch}`,
    );
    if (!release) return fail('SERVER_BUSY');
    pending.add(key);
    let cancelled = false;
    let resource: NativeResource | undefined;
    const closeResource = () => {
      if (resource && !resource.closed) resource.close();
    };
    let rejectWork!: (result: Failure) => void;
    const cancellation = new Promise<Failure>((resolve) => {
      rejectWork = resolve;
    });
    function cancel(errorCode: string) {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      closeResource();
      rejectWork(fail(errorCode));
    }
    const untrack = pendingMedia.track(bindings, () => cancel('CONFLICT'));
    const timer = setTimeout(
      () => cancel('MEDIA_UNAVAILABLE'),
      sessionControlBudget.cleanupAttemptTimeoutMs,
    );
    // Keep admission until native I/O settles, even if the client already received a timeout.
    const settled = task({
      isCancelled: () => cancelled,
      bindResource(native) {
        resource = native;
        if (cancelled) closeResource();
      },
    })
      .catch(() => fail('MEDIA_UNAVAILABLE'))
      .finally(() => {
        clearTimeout(timer);
        pending.delete(key);
        untrack();
        release();
      });
    return { work: Promise.race([settled, cancellation]) };
  }

  function create(
    key: string,
    bindings: Bindings,
    event: 'producer' | 'consumer',
    input: Produce | Consume,
    task: (
      operation: Operation,
      keep: (result: Grant) => void,
      retire: () => void,
    ) => Promise<Grant | Failure>,
  ): Work<Grant> | Failure {
    const { userId } = bindings[0].auth;
    const sessionKey = `${input.sessionId}:${input.epoch}`;
    const intentKey = JSON.stringify([event, userId, sessionKey, input.requestId]);
    const signature = JSON.stringify([key, input.payload]);
    const now = Date.now();
    let userIntents = 0;
    let sessionIntents = 0;
    for (const [id, intent] of createIntents) {
      if ('expiresAt' in intent && intent.expiresAt <= now) {
        createIntents.delete(id);
        continue;
      }
      if (intent.userId === userId) userIntents++;
      if (intent.sessionKey === sessionKey) sessionIntents++;
    }
    const previous = createIntents.get(intentKey);
    if (previous) {
      if ('expiresAt' in previous || previous.signature !== signature) return fail('CONFLICT');
      return previous.result
        ? { work: Promise.resolve(previous.result) }
        : fail('OPERATION_IN_PROGRESS');
    }
    if (reservedResources.has(key)) return fail('CONFLICT');
    if (userIntents >= 64 || sessionIntents >= 1024 || createIntents.size >= 4096) {
      return fail('SERVER_BUSY');
    }
    const intent: CreateIntent = { userId, sessionKey, signature };
    const retire = () => {
      if (createIntents.get(intentKey) !== intent) return;
      // Keep only the closed intent's identity, with no source or transport metadata to replay.
      createIntents.set(intentKey, {
        userId,
        sessionKey,
        expiresAt: Date.now() + closedIntentReplayMs,
      });
      reservedResources.delete(key);
    };
    const work = run(key, bindings, async (operation) => {
      try {
        return await task(
          operation,
          (result) => {
            intent.result = result;
          },
          retire,
        );
      } finally {
        if (!intent.result && createIntents.get(intentKey) === intent) {
          createIntents.delete(intentKey);
          reservedResources.delete(key);
        }
      }
    });
    if ('work' in work) {
      createIntents.set(intentKey, intent);
      reservedResources.add(key);
    }
    return work;
  }

  async function produce(socketId: string, input: Produce) {
    const { transportId, sourceKind, rtpParameters, lease } = input.payload;
    const screen = sourceKind === 'SCREEN' || sourceKind === 'SCREEN_AUDIO';
    const kind = sourceKind === 'MIC' || sourceKind === 'SCREEN_AUDIO' ? 'audio' : 'video';
    const key = JSON.stringify([
      input.sessionId,
      input.epoch,
      transportId,
      sourceKind,
      ...(lease ? [lease.leaseId, lease.leaseGeneration] : []),
    ]);
    const prepared = await withTransport(
      socketId,
      input,
      transportId,
      'SEND',
      (owner, _, policy, transport, share) => {
        if (!canPublishMedia(policy, sourceKind) || (screen && (!lease || !share)))
          return fail('FORBIDDEN');
        if (
          (!screen && lease) ||
          !rtpParameters.codecs.every(({ mimeType }) =>
            mimeType.toLowerCase().startsWith(`${kind}/`),
          )
        ) {
          return fail('VALIDATION_ERROR');
        }
        return create(key, [owner], 'producer', input, async (operation, keep, retire) => {
          if (sources.size + pending.size > maxActiveResources) return fail('SERVER_BUSY');
          const publicationKey =
            lease &&
            JSON.stringify([input.sessionId, input.epoch, lease.leaseId, lease.leaseGeneration]);
          let publication = publicationKey ? publications.get(publicationKey) : undefined;
          if (sourceKind === 'SCREEN' && share && lease && publicationKey) {
            const ref = { ...lease, publicationId: input.requestId };
            const reserved = share.leases.reservePublishHeld(share.held, ref, ref.publicationId);
            if (!reserved.ok) return fail(reserved.errorCode);
            if (!share.leases.canPublishHeld(share.held, sourceKind, 'CREATE', ref))
              return fail('FORBIDDEN');
            const entry: ScreenPublication = { ref, stopped: false, inFlight: 0 };
            if (
              !share.leases.bindPublicationHeld(share.held, ref, {
                isStopped: () => entry.stopped,
                close() {
                  entry.stopped = true;
                  entry.video?.close();
                  entry.audio?.close();
                  if (entry.inFlight) return false;
                  publications.delete(publicationKey);
                  return true;
                },
              })
            )
              return fail('CONFLICT');
            publication = entry;
            publications.set(publicationKey, entry);
          } else if (
            screen &&
            (!publication ||
              publication.stopped ||
              !publication.video ||
              publication.video.closed ||
              !share?.leases.canPublishHeld(share.held, sourceKind, 'CREATE', publication.ref))
          ) {
            return fail('FORBIDDEN');
          }
          const retireScreen = () => {
            if (!publication || !share) return;
            void share.retire(publication.ref).catch(() => {});
          };
          if (publication) publication.inFlight++;
          let native: MediaTypes.Producer | undefined;
          let published = false;
          try {
            const producer = await transport.produce({
              kind,
              rtpParameters: rtpParameters as MediaTypes.RtpParameters,
              ...(screen && { paused: true }),
            });
            native = producer;
            operation.bindResource(producer);
            if (operation.isCancelled() || publication?.stopped) return fail('CONFLICT');
            if (publication) {
              if (sourceKind === 'SCREEN') publication.video = producer;
              else publication.audio = producer;
            }
            const authorizePublish = (
              current: LiveContext,
              policyNow: SessionPolicyInput,
              gate?: HeldShareLease,
            ) =>
              !operation.isCancelled() &&
              !producer.closed &&
              !publication?.stopped &&
              sameReceiver(owner, current) &&
              canPublishMedia(policyNow, sourceKind) &&
              (!publication ||
                gate?.leases.canPublishHeld(gate.held, sourceKind, 'READY', publication.ref) ===
                  true);
            if (publication) {
              const prepared = await withTransport(
                socketId,
                input,
                transportId,
                'SEND',
                (current, _, currentPolicy, _transport, gate) => {
                  if (
                    !gate ||
                    operation.isCancelled() ||
                    producer.closed ||
                    publication.stopped ||
                    !sameReceiver(owner, current)
                  )
                    return fail('CONFLICT');
                  if (sourceKind === 'SCREEN') {
                    const committed = gate.leases.commitHeld(gate.held, publication.ref);
                    if (!committed.ok) return fail(committed.errorCode);
                  }
                  if (!authorizePublish(current, currentPolicy, gate)) return fail('FORBIDDEN');
                  return { resumed: producer.resume() };
                },
              );
              if ('errorCode' in prepared) return prepared;
              await prepared.resumed;
            }
            return await withTransport(
              socketId,
              input,
              transportId,
              'SEND',
              (current, _, currentPolicy, _transport, gate) => {
                if (operation.isCancelled() || producer.closed || !sameReceiver(owner, current))
                  return fail('CONFLICT');
                if (!authorizePublish(current, currentPolicy, gate)) return fail('FORBIDDEN');
                const native = producer;
                const descriptor: MediaSourceDescriptor = {
                  producerId: native.id,
                  sourceId: randomUUID(),
                  sourceGeneration: 1,
                  sourceRevision: 0,
                  ownerParticipantId: current.participantId,
                  scope:
                    current.scope.type === 'MAIN'
                      ? { type: 'MAIN' }
                      : { type: 'GROUP', groupId: current.scope.groupId },
                  sourceKind,
                  kind,
                  publicationState: 'PUBLISHING',
                };
                const source = {
                  native,
                  descriptor,
                  owner: current,
                  ...(publication && { publication }),
                };
                const result: Grant = {
                  payload: { producerId: native.id, source: descriptor },
                  transportId,
                  direction: 'SEND',
                  validate(latest, policy, gate) {
                    if (
                      native.closed ||
                      sources.get(native.id) !== source ||
                      !sameReceiver(source.owner, latest)
                    )
                      return fail('CONFLICT');
                    if (!authorizePublish(latest, policy, gate)) {
                      native.close();
                      return fail('FORBIDDEN');
                    }
                    return undefined;
                  },
                };
                sources.set(native.id, source);
                published = true;
                keep(result);
                if (publication)
                  notifyScreen({
                    type: 'published',
                    source: { ...descriptor },
                    owner: current,
                  });
                native.observer.once('close', () => {
                  sources.delete(native.id);
                  retire();
                  if (publication)
                    notifyScreen({
                      type: 'ended',
                      source: { ...descriptor, sourceRevision: descriptor.sourceRevision + 1 },
                      owner: current,
                    });
                  if (sourceKind === 'SCREEN' && publication && !publication.stopped) {
                    publication.stopped = true;
                    publication.audio?.close();
                    retireScreen();
                  }
                });
                return result;
              },
            );
          } finally {
            if (!published && native && !native.closed) native.close();
            if (publication) {
              publication.inFlight--;
              if (!published && sourceKind === 'SCREEN') publication.stopped = true;
              if (publication.stopped) retireScreen();
            }
          }
        });
      },
    );
    return 'work' in prepared ? prepared.work : prepared;
  }

  async function consume(socketId: string, input: Consume) {
    const { transportId, producerId } = input.payload;
    const capabilities = input.payload.rtpCapabilities as MediaTypes.RtpCapabilities;
    const key = JSON.stringify([transportId, producerId]);
    const prepared = await withTransport(
      socketId,
      input,
      transportId,
      'RECV',
      (owner, router, policy, transport, share) => {
        const source = sources.get(producerId);
        if (!source || !mayReceive(policy, source, share)) return fail('NOT_FOUND');
        if (!matchesSource(source, input.payload)) return fail('SOURCE_CHANGED');
        if (!router.canConsume({ producerId, rtpCapabilities: capabilities }))
          return fail('MEDIA_UNAVAILABLE');
        const bindings = [owner, source.owner] as const;
        return create(key, bindings, 'consumer', input, async (operation, keep, retire) => {
          if (receivers.size + pending.size > maxActiveResources) return fail('SERVER_BUSY');
          const native = await transport.consume({
            producerId,
            rtpCapabilities: capabilities,
            paused: true,
          });
          try {
            operation.bindResource(native);
            if (operation.isCancelled()) return fail('CONFLICT');
            return await withTransport(
              socketId,
              input,
              transportId,
              'RECV',
              (current, _, currentPolicy, _transport, share) => {
                if (operation.isCancelled() || native.closed || !sameReceiver(owner, current))
                  return fail('CONFLICT');
                if (!mayReceive(currentPolicy, source, share)) return fail('NOT_FOUND');
                if (!matchesSource(source, input.payload)) return fail('SOURCE_CHANGED');
                const { sourceId, sourceGeneration, sourceRevision } = source.descriptor;
                const payload = {
                  consumerId: native.id,
                  producerId,
                  kind: native.kind,
                  rtpParameters: native.rtpParameters,
                  sourceId,
                  sourceGeneration,
                  sourceRevision,
                };
                const timer = setTimeout(
                  () => native.close(),
                  sessionControlBudget.foregroundTransitionTimeoutMs,
                );
                timer.unref();
                const receiver: Receiver = {
                  native,
                  source,
                  owner: current,
                  socketId,
                  transportId,
                  capabilities,
                  ready: false,
                  timer,
                };
                const result = receiverGrant(receiver, input, payload);
                receivers.set(native.id, receiver);
                keep(result);
                native.observer.once('close', () => {
                  clearTimeout(timer);
                  receivers.delete(native.id);
                  retire();
                });
                return result;
              },
            );
          } finally {
            if (!native.closed && !receivers.has(native.id)) native.close();
          }
        });
      },
    );
    return 'work' in prepared ? prepared.work : prepared;
  }

  async function ready(socketId: string, input: Ready) {
    const { consumerId } = input.payload;
    const receiver = receivers.get(consumerId);
    if (!receiver || receiver.socketId !== socketId) return fail('NOT_FOUND');
    const { native, source, transportId, owner, capabilities } = receiver;
    if (
      owner.sessionId !== input.sessionId ||
      owner.epoch !== input.epoch ||
      owner.callGeneration !== input.callGeneration
    ) {
      return fail('CONFLICT');
    }
    const result = receiverGrant(receiver, input, { consumerId, ready: true });
    const prepared = await withTransport(
      socketId,
      input,
      transportId,
      'RECV',
      (current, router, policy, _transport, share) => {
        if (native.closed || !sameReceiver(owner, current)) return fail('CONFLICT');
        if (!mayReceive(policy, source, share)) {
          native.close();
          return fail('FORBIDDEN');
        }
        if (!matchesSource(source, input.payload)) {
          if (native.paused) native.close();
          return fail('SOURCE_CHANGED');
        }
        if (!router.canConsume({ producerId: source.native.id, rtpCapabilities: capabilities })) {
          native.close();
          return fail('MEDIA_UNAVAILABLE');
        }
        const key = JSON.stringify(['ready', consumerId]);
        if (pending.has(key)) return fail('OPERATION_IN_PROGRESS');
        if (!native.paused) return { work: Promise.resolve(result) };
        return run(key, [current, source.owner], async (operation) => {
          operation.bindResource(native);
          let completed = false;
          try {
            await native.resume();
            if (operation.isCancelled()) return fail('CONFLICT');
            return await withTransport(
              socketId,
              input,
              transportId,
              'RECV',
              (latest, latestRouter, latestPolicy, _transport, share) => {
                if (operation.isCancelled() || native.closed || !sameReceiver(owner, latest))
                  return fail('CONFLICT');
                if (!mayReceive(latestPolicy, source, share)) return fail('FORBIDDEN');
                if (!matchesSource(source, input.payload)) return fail('SOURCE_CHANGED');
                if (
                  !latestRouter.canConsume({
                    producerId: source.native.id,
                    rtpCapabilities: capabilities,
                  })
                ) {
                  return fail('MEDIA_UNAVAILABLE');
                }
                clearTimeout(receiver.timer);
                receiver.ready = true;
                completed = true;
                return result;
              },
            );
          } finally {
            if (!completed && !native.closed) native.close();
          }
        });
      },
    );
    if ('work' in prepared) return prepared.work;
    if (
      !native.closed &&
      (prepared.errorCode === 'AUTH_REQUIRED' || prepared.errorCode === 'FORBIDDEN')
    ) {
      native.close();
    }
    return prepared;
  }

  return {
    visibleSources(policy: SessionPolicyInput, share?: HeldShareLease) {
      return [...sources.values()]
        .filter((source) => mayReceive(policy, source, share))
        .map(({ descriptor }) => descriptor);
    },
    readOwnSources(context: LiveContext, policy: SessionPolicyInput, share?: HeldShareLease) {
      return {
        ownProducers: [...sources.values()]
          .filter(
            (source) =>
              !source.native.closed &&
              sameReceiver(source.owner, context) &&
              canPublishMedia(policy, source.descriptor.sourceKind) &&
              (!source.publication ||
                (!source.publication.stopped &&
                  share?.leases.canPublishHeld(
                    share.held,
                    source.descriptor.sourceKind,
                    'READY',
                    source.publication.ref,
                  ) === true)),
          )
          .map(({ descriptor: source }) => ({ source, replacement: null })),
        ownConsumers: [...receivers.values()]
          .filter(
            (receiver) =>
              !receiver.native.closed &&
              sameReceiver(receiver.owner, context) &&
              mayReceive(policy, receiver.source, share),
          )
          .map(({ native, ready, source: { descriptor } }) => ({
            sourceId: descriptor.sourceId,
            sourceGeneration: descriptor.sourceGeneration,
            sourceRevision: descriptor.sourceRevision,
            consumerId: native.id,
            producerId: descriptor.producerId,
            ready,
            paused: !ready || native.paused,
          })),
      };
    },
    attach(socket: SocketPort) {
      function register<T extends Produce | Consume | Ready>(
        event: Event,
        input: z.ZodType<T>,
        ackSchema: z.ZodType,
        handle: (socketId: string, input: T) => Promise<Grant | Failure>,
      ) {
        socket.on(event, (raw, ack) => {
          if (typeof ack !== 'function') return;
          const candidate =
            raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
          const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
          let responded = false;
          const reply = (value: unknown) => {
            if (responded) return;
            responded = true;
            ack(value);
          };
          const reject = (code: string) =>
            reply({ requestId, error: { code, message: 'Không thể xử lý nguồn media.' } });
          if (
            Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8') >
            sessionControlBudget.maxControlBytes
          ) {
            return reject('PAYLOAD_TOO_LARGE');
          }
          const parsed = input.safeParse(raw);
          if (!parsed.success) return reject('VALIDATION_ERROR');
          void handle(socket.id, parsed.data)
            .then(async (result) => {
              if ('errorCode' in result) return reject(result.errorCode);
              // Release native admission on settle. Re-enter the gate to order success ACKs
              // against revoke, including when replaying a previously committed create.
              const error = await withTransport(
                socket.id,
                parsed.data,
                result.transportId,
                result.direction,
                (current, _, policy, _transport, share) => {
                  const failure = result.validate(current, policy, share);
                  if (failure) return reject(failure.errorCode);
                  const response = ackSchema.parse({
                    requestId,
                    data: { status: 'completed', result: result.payload },
                  });
                  if (result.resource)
                    resourceGrants.acknowledge(socket.id, current, result.resource);
                  reply(response);
                },
              );
              if (error) reject(error.errorCode);
            })
            .catch(() => reject('DEPENDENCY_UNAVAILABLE'));
        });
      }
      register(
        'media.producer.create',
        mediaProducerCreateInputSchema,
        mediaProducerCreateAckSchema,
        produce,
      );
      register(
        'media.consumer.create',
        mediaConsumerCreateInputSchema,
        mediaConsumerCreateAckSchema,
        consume,
      );
      register(
        'media.consumer.ready',
        mediaConsumerReadyInputSchema,
        mediaConsumerReadyAckSchema,
        ready,
      );
    },
  };
}
