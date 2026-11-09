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
import { canPublishMedia, canReceiveMedia } from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';
import { sessionCleanupAdmission } from '../session-manager/cleanup-admission.js';
import type { createTransportSignaling } from './transport-signaling.js';

type Produce = z.infer<typeof mediaProducerCreateInputSchema>;
type Consume = z.infer<typeof mediaConsumerCreateInputSchema>;
type Ready = z.infer<typeof mediaConsumerReadyInputSchema>;
type Binding = Ready['payload'];
type WithTransport = ReturnType<typeof createTransportSignaling>['withMediaTransport'];
type Failure = { errorCode: string };
type Work<T> = { work: Promise<T | Failure> };
type CreateIntent = {
  userId: string;
  sessionKey: string;
} & ({ signature: string; result?: object } | { expiresAt: number });
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

export function createPausedReadySignaling(withTransport: WithTransport) {
  const sources = new Map<string, Source>();
  const receivers = new Map<string, Receiver>();
  const pending = new Set<string>();
  const reservedResources = new Set<string>();
  const createIntents = new Map<string, CreateIntent>();

  function run<T>(
    key: string,
    context: LiveContext,
    task: (isCancelled: () => boolean) => Promise<T | Failure>,
    onTimeout?: () => void,
  ): Work<T> | Failure {
    if (pending.has(key)) return fail('OPERATION_IN_PROGRESS');
    const release = sessionCleanupAdmission.tryAcquire(
      context.auth.userId,
      `${context.sessionId}:${context.epoch}`,
    );
    if (!release) return fail('SERVER_BUSY');
    pending.add(key);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<Failure>((resolve) => {
      timer = setTimeout(() => {
        cancelled = true;
        onTimeout?.();
        resolve(fail('MEDIA_UNAVAILABLE'));
      }, sessionControlBudget.cleanupAttemptTimeoutMs);
    });
    // Keep admission until native I/O settles, even if the client already received a timeout.
    const settled = task(() => cancelled)
      .catch(() => fail('MEDIA_UNAVAILABLE'))
      .finally(() => {
        clearTimeout(timer);
        pending.delete(key);
        release();
      });
    return { work: Promise.race([settled, deadline]) };
  }

  function create(
    key: string,
    owner: LiveContext,
    event: 'producer' | 'consumer',
    input: Produce | Consume,
    task: (
      isCancelled: () => boolean,
      keep: (result: object) => void,
      retire: () => void,
    ) => Promise<object | Failure>,
  ): Work<object> | Failure {
    const { userId } = owner.auth;
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
    const work = run(key, owner, async (isCancelled) => {
      try {
        return await task(
          isCancelled,
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
        return create(key, owner, 'producer', input, async (isCancelled, keep, retire) => {
          if (sources.size + pending.size > maxActiveResources) return fail('SERVER_BUSY');
          const native = await transport.produce({
            kind,
            rtpParameters: rtpParameters as MediaTypes.RtpParameters,
          });
          try {
            return await withTransport(
              socketId,
              input,
              transportId,
              'SEND',
              (current, _, currentPolicy) => {
                if (isCancelled() || native.closed || !sameReceiver(owner, current))
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
                const result = { producerId: native.id, source: descriptor };
                sources.set(native.id, { native, descriptor, owner: current });
                keep(result);
                native.observer.once('close', () => {
                  sources.delete(native.id);
                  retire();
                });
                return result;
              },
            );
          } finally {
            if (!sources.has(native.id)) native.close();
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
        return create(key, owner, 'consumer', input, async (isCancelled, keep, retire) => {
          if (receivers.size + pending.size > maxActiveResources) return fail('SERVER_BUSY');
          const native = await transport.consume({
            producerId,
            rtpCapabilities: capabilities,
            paused: true,
          });
          try {
            return await withTransport(
              socketId,
              input,
              transportId,
              'RECV',
              (current, _, currentPolicy) => {
                if (isCancelled() || native.closed || !sameReceiver(owner, current))
                  return fail('CONFLICT');
                if (!mayReceive(currentPolicy, source)) return fail('NOT_FOUND');
                if (!matchesSource(source, input.payload)) return fail('SOURCE_CHANGED');
                const { sourceId, sourceGeneration, sourceRevision } = source.descriptor;
                const result = {
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
                receivers.set(native.id, {
                  native,
                  source,
                  owner: current,
                  socketId,
                  transportId,
                  capabilities,
                  timer,
                });
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
            if (!receivers.has(native.id)) native.close();
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
    const result = { consumerId, ready: true as const };
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
        return run(
          key,
          current,
          async (isCancelled) => {
            let completed = false;
            try {
              await native.resume();
              return await withTransport(
                socketId,
                input,
                transportId,
                'RECV',
                (latest, latestRouter, latestPolicy) => {
                  if (isCancelled() || native.closed || !sameReceiver(owner, latest))
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
                  completed = true;
                  return result;
                },
              );
            } finally {
              if (!completed) native.close();
            }
          },
          () => native.close(),
        );
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
    visibleSources(policy: SessionPolicyInput) {
      return [...sources.values()]
        .filter((source) => mayReceive(policy, source))
        .map(({ descriptor }) => descriptor);
    },
    attach(socket: SocketPort) {
      function register<T extends { requestId: string }>(
        event: Event,
        input: z.ZodType<T>,
        ackSchema: z.ZodType,
        handle: (socketId: string, input: T) => Promise<object>,
      ) {
        socket.on(event, (raw, ack) => {
          if (typeof ack !== 'function') return;
          const candidate =
            raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
          const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
          const reject = (code: unknown) =>
            ack({ requestId, error: { code, message: 'Không thể xử lý nguồn media.' } });
          if (
            Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8') >
            sessionControlBudget.maxControlBytes
          ) {
            return reject('PAYLOAD_TOO_LARGE');
          }
          const parsed = input.safeParse(raw);
          if (!parsed.success) return reject('VALIDATION_ERROR');
          void handle(socket.id, parsed.data)
            .then((result) => {
              if ('errorCode' in result) return reject(result.errorCode);
              ack(ackSchema.parse({ requestId, data: { status: 'completed', result } }));
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
