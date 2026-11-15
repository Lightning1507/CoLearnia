import {
  mediaConsumerCloseAckSchema,
  mediaConsumerCloseInputSchema,
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
import { canPublishMedia, canReceiveMedia } from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';
import type { createTransportSignaling, ResourceGrant } from './transport-signaling.js';

type Produce = z.infer<typeof mediaProducerCreateInputSchema>;
type Consume = z.infer<typeof mediaConsumerCreateInputSchema>;
type Ready = z.infer<typeof mediaConsumerReadyInputSchema>;
type Close = z.infer<typeof mediaConsumerCloseInputSchema>;
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
  validate(current: LiveContext, policy: SessionPolicyInput): Failure | undefined;
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
type Event =
  | 'media.producer.create'
  | 'media.consumer.create'
  | 'media.consumer.ready'
  | 'media.consumer.close';
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

function mayReceive(policy: SessionPolicyInput, source: Source): boolean {
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
    canReceiveMedia(policy, owner.participantId, descriptor.sourceKind)
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
}: TransportService) {
  const sources = new Map<string, Source>();
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
      validate(current, policy) {
        if (native.closed || receivers.get(native.id) !== receiver || !sameReceiver(owner, current))
          return fail('CONFLICT');
        if (!mayReceive(policy, source)) {
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
    const kind = sourceKind === 'MIC' ? 'audio' : 'video';
    const key = JSON.stringify([input.sessionId, input.epoch, transportId, sourceKind]);
    const prepared = await withTransport(
      socketId,
      input,
      transportId,
      'SEND',
      (owner, _, policy, transport) => {
        // Screen sources require M4's authoritative share lease (SCRUM-73).
        if (
          (sourceKind !== 'MIC' && sourceKind !== 'CAMERA') ||
          !canPublishMedia(policy, sourceKind)
        ) {
          return fail('FORBIDDEN');
        }
        if (
          lease ||
          !rtpParameters.codecs.every(({ mimeType }) =>
            mimeType.toLowerCase().startsWith(`${kind}/`),
          )
        ) {
          return fail('VALIDATION_ERROR');
        }
        return create(key, [owner], 'producer', input, async (operation, keep, retire) => {
          if (sources.size + pending.size > maxActiveResources) return fail('SERVER_BUSY');
          const native = await transport.produce({
            kind,
            rtpParameters: rtpParameters as MediaTypes.RtpParameters,
          });
          try {
            operation.bindResource(native);
            if (operation.isCancelled()) return fail('CONFLICT');
            return await withTransport(
              socketId,
              input,
              transportId,
              'SEND',
              (current, _, currentPolicy) => {
                if (operation.isCancelled() || native.closed || !sameReceiver(owner, current))
                  return fail('CONFLICT');
                if (!canPublishMedia(currentPolicy, sourceKind)) return fail('FORBIDDEN');
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
                const source = { native, descriptor, owner: current };
                const result: Grant = {
                  payload: { producerId: native.id, source: descriptor },
                  transportId,
                  direction: 'SEND',
                  validate(latest, policy) {
                    if (
                      native.closed ||
                      sources.get(native.id) !== source ||
                      !sameReceiver(source.owner, latest)
                    )
                      return fail('CONFLICT');
                    if (!canPublishMedia(policy, sourceKind)) {
                      native.close();
                      return fail('FORBIDDEN');
                    }
                    return undefined;
                  },
                };
                sources.set(native.id, source);
                keep(result);
                native.observer.once('close', () => {
                  sources.delete(native.id);
                  retire();
                });
                return result;
              },
            );
          } finally {
            if (!native.closed && !sources.has(native.id)) native.close();
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
      (owner, router, policy, transport) => {
        const source = sources.get(producerId);
        if (!source || !mayReceive(policy, source)) return fail('NOT_FOUND');
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
              (current, _, currentPolicy) => {
                if (operation.isCancelled() || native.closed || !sameReceiver(owner, current))
                  return fail('CONFLICT');
                if (!mayReceive(currentPolicy, source)) return fail('NOT_FOUND');
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
      (current, router, policy) => {
        if (native.closed || !sameReceiver(owner, current)) return fail('CONFLICT');
        if (!mayReceive(policy, source)) {
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
              (latest, latestRouter, latestPolicy) => {
                if (operation.isCancelled() || native.closed || !sameReceiver(owner, latest))
                  return fail('CONFLICT');
                if (!mayReceive(latestPolicy, source)) return fail('FORBIDDEN');
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

  async function closeConsumer(socketId: string, input: Close) {
    const { transportId, consumerId, sourceId, sourceGeneration } = input.payload;
    return withTransport(
      socketId,
      input,
      transportId,
      'RECV',
      (current) => {
        const receiver = receivers.get(consumerId);
        if (receiver) {
          if (
            receiver.socketId !== socketId ||
            receiver.transportId !== transportId ||
            !sameReceiver(receiver.owner, current) ||
            receiver.source.descriptor.sourceId !== sourceId ||
            receiver.source.descriptor.sourceGeneration !== sourceGeneration
          ) {
            return fail('NOT_FOUND');
          }
          receiver.native.close();
        }
        return {
          payload: { consumerId, closed: true },
          transportId,
          direction: 'RECV',
          validate: () => undefined,
        } satisfies Grant;
      },
      'cleanup',
    );
  }

  return {
    visibleSources(policy: SessionPolicyInput) {
      return [...sources.values()]
        .filter((source) => mayReceive(policy, source))
        .map(({ descriptor }) => descriptor);
    },
    readOwnSources(context: LiveContext, policy: SessionPolicyInput) {
      return {
        ownProducers: [...sources.values()]
          .filter(
            (source) =>
              !source.native.closed &&
              sameReceiver(source.owner, context) &&
              canPublishMedia(policy, source.descriptor.sourceKind),
          )
          .map(({ descriptor: source }) => ({ source, replacement: null })),
        ownConsumers: [...receivers.values()]
          .filter(
            (receiver) =>
              !receiver.native.closed &&
              sameReceiver(receiver.owner, context) &&
              mayReceive(policy, receiver.source),
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
      function register<T extends Produce | Consume | Ready | Close>(
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
                (current, _, policy) => {
                  const failure = result.validate(current, policy);
                  if (failure) return reject(failure.errorCode);
                  const response = ackSchema.parse({
                    requestId,
                    data: { status: 'completed', result: result.payload },
                  });
                  if (result.resource)
                    resourceGrants.acknowledge(socket.id, current, result.resource);
                  reply(response);
                },
                event === 'media.consumer.close' ? 'cleanup' : 'mutation',
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
      register(
        'media.consumer.close',
        mediaConsumerCloseInputSchema,
        mediaConsumerCloseAckSchema,
        closeConsumer,
      );
    },
  };
}
