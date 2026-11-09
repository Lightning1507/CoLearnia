import { randomUUID } from 'node:crypto';
import { mediaProducerCreateAckSchema } from '@colearnia/contracts';
import type { LiveContext } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import { describe, expect, it, vi } from 'vitest';
import type { PolicyParticipant, SessionPolicyInput } from '../policy/session-policy.js';
import { createPausedReadySignaling } from './paused-ready-signaling.js';

type SocketPort = Parameters<ReturnType<typeof createPausedReadySignaling>['attach']>[0];
type Event = Parameters<SocketPort['on']>[0];

function fixture() {
  const sessionId = '1'.repeat(24);
  const epoch = randomUUID();
  const access = {
    workspaceId: '2'.repeat(24),
    channelId: '3'.repeat(24),
    channelType: 'LIVE' as const,
    membershipId: '4'.repeat(24),
    membershipIncarnation: 1,
    membershipRevision: 0,
    channelRevision: 0,
    canReadContent: true as const,
    canManageChannel: false,
  };
  const participants = new Map<string, PolicyParticipant>();
  const contexts = new Map<string, LiveContext>();
  for (const id of ['a', 'b']) {
    const participantId = id.repeat(24);
    const auth = {
      userId: participantId,
      authSessionId: 'f' + id.repeat(23),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const scope = { type: 'MAIN' as const };
    participants.set(participantId, {
      participantId,
      displayName: id,
      auth,
      access,
      currentAccess: access,
      scope,
      callGeneration: 1,
      audienceEpoch: 0,
      connected: true,
      blocked: false,
    });
    contexts.set(id, {
      sessionId,
      epoch,
      participantId,
      auth,
      access,
      scope,
      host: null,
      role: 'MEMBER',
      callGeneration: 1,
      audienceEpoch: 0,
      policyRevision: 0,
    });
  }
  const rtpParameters = {
    codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000 }],
  };
  let closeProducer: (() => void) | undefined;
  const produce = vi.fn(async () => {
    const producer = {
      id: randomUUID(),
      closed: false,
      close: () => {
        producer.closed = true;
        onClose?.();
      },
      observer: {
        once: (_event: string, close: () => void) => {
          onClose = close;
        },
      },
    };
    let onClose: (() => void) | undefined;
    closeProducer = producer.close;
    return producer;
  });
  let closeObserver: (() => void) | undefined;
  const native = {
    id: 'consumer',
    closed: false,
    paused: true,
    kind: 'audio',
    rtpParameters,
    close: vi.fn(() => {
      native.closed = true;
      closeObserver?.();
    }),
    resume: vi.fn(async () => {
      native.paused = false;
    }),
    observer: {
      once: (_event: string, close: () => void) => {
        closeObserver = close;
      },
    },
  };
  const consume = vi.fn(async (_options: MediaTypes.ConsumerOptions) => native);
  const canConsume = vi.fn(() => true);
  const service = createPausedReadySignaling(async (socket, input, transport, direction, use) => {
    const context = contexts.get(socket);
    if (!context || transport !== direction || input.callGeneration !== context.callGeneration) {
      return { errorCode: 'CONFLICT' };
    }
    const policy: SessionPolicyInput = {
      request: { auth: context.auth, sessionId, epoch, callGeneration: 1 },
      access,
      nowMs: Date.now(),
      session: {
        sessionId,
        epoch,
        workspaceId: access.workspaceId,
        channelId: access.channelId,
        state: 'ACTIVE',
        phase: 'GUIDANCE',
        policyRevision: 0,
        hostParticipantId: null,
        helpingGroupId: null,
        round: null,
        groups: new Map(),
        participants,
      },
    };
    return use(context, { canConsume } as unknown as MediaTypes.Router, policy, {
      id: transport,
      produce: produce as unknown as MediaTypes.WebRtcTransport['produce'],
      consume: consume as unknown as MediaTypes.WebRtcTransport['consume'],
    });
  });
  function attach(id: string) {
    const handlers = new Map<Event, Parameters<SocketPort['on']>[1]>();
    service.attach({ id, on: (event, listener) => handlers.set(event, listener) });
    return (event: Event, payload: object, requestId: string = randomUUID()) =>
      new Promise<Record<string, unknown>>((ack) => {
        const listener = handlers.get(event);
        if (!listener) throw new Error('Missing handler');
        listener(
          {
            requestId,
            sessionId,
            epoch,
            callGeneration: 1,
            expectedPolicyRevision: 0,
            payload,
          },
          (value) => {
            ack(value as Record<string, unknown>);
          },
        );
      });
  }
  const send = attach('a');
  const receive = attach('b');
  const publish = (requestId?: string) =>
    send(
      'media.producer.create',
      { transportId: 'SEND', sourceKind: 'MIC', rtpParameters },
      requestId,
    );
  async function consumerPayload() {
    const ack = mediaProducerCreateAckSchema.parse(await publish());
    if ('error' in ack) throw new Error(ack.error.code);
    const { producerId, source } = ack.data.result;
    return {
      sourceId: source.sourceId,
      sourceGeneration: source.sourceGeneration,
      expectedSourceRevision: source.sourceRevision,
      producerId,
      transportId: 'RECV',
      rtpCapabilities: {
        codecs: [
          { kind: 'audio', mimeType: 'audio/opus', preferredPayloadType: 111, clockRate: 48000 },
        ],
        headerExtensions: [],
      },
    };
  }
  async function createPaused() {
    const payload = await consumerPayload();
    const created = await receive('media.consumer.create', payload);
    expect(created).toMatchObject({ data: { result: { consumerId: native.id } } });
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
    expect(native.resume).not.toHaveBeenCalled();
    return {
      sourceId: payload.sourceId,
      sourceGeneration: payload.sourceGeneration,
      expectedSourceRevision: payload.expectedSourceRevision,
      consumerId: native.id,
    };
  }
  return {
    createPaused,
    receive,
    native,
    canConsume,
    publish,
    produce,
    closeProducer: () => closeProducer?.(),
    consumerPayload,
    consume,
    blockPublisher: () => {
      const publisher = participants.get('a'.repeat(24));
      if (publisher) publisher.blocked = true;
    },
  };
}

describe('paused-ready media signaling', () => {
  it('returns the same error for a hidden source and an unknown Producer ID', async () => {
    const { consumerPayload, receive, blockPublisher, canConsume, consume } = fixture();
    const payload = await consumerPayload();
    expect(
      await receive('media.consumer.create', { ...payload, expectedSourceRevision: 1 }),
    ).toMatchObject({ error: { code: 'SOURCE_CHANGED' } });
    blockPublisher();
    const hidden = await receive('media.consumer.create', payload);
    const unknown = await receive('media.consumer.create', { ...payload, producerId: 'unknown' });
    expect(hidden.error).toEqual(unknown.error);
    expect(hidden).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(canConsume).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('replays a live Producer but rejects the same intent after close', async () => {
    const { publish, produce, closeProducer } = fixture();
    const requestId = randomUUID();
    const created = await publish(requestId);
    expect(created).toHaveProperty('data');
    expect(await publish(requestId)).toEqual(created);
    closeProducer();
    expect(await publish(requestId)).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(produce).toHaveBeenCalledOnce();
    expect(await publish()).toHaveProperty('data');
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it('does not recreate a Consumer when the same create intent arrives after close', async () => {
    const { consumerPayload, receive, native, consume } = fixture();
    const payload = await consumerPayload();
    const requestId = randomUUID();
    expect(await receive('media.consumer.create', payload, requestId)).toHaveProperty('data');
    native.close();
    expect(await receive('media.consumer.create', payload, requestId)).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(consume).toHaveBeenCalledOnce();
  });

  it('expires the closed intent after the replay window', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const { publish, produce, closeProducer } = fixture();
      const requestId = randomUUID();
      expect(await publish(requestId)).toHaveProperty('data');
      closeProducer();
      clock.mockReturnValue(now + 59_999);
      expect(await publish(requestId)).toMatchObject({ error: { code: 'CONFLICT' } });
      clock.mockReturnValue(now + 60_000);
      expect(await publish(requestId)).toHaveProperty('data');
      expect(produce).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('checks the codec at create and ready and only resumes after ready', async () => {
    const { createPaused, receive, native, canConsume } = fixture();
    const binding = await createPaused();
    const result = await receive('media.consumer.ready', binding);
    expect(result).toMatchObject({ data: { result: { consumerId: native.id, ready: true } } });
    expect(canConsume).toHaveBeenCalledTimes(3);
    expect(native.resume).toHaveBeenCalledTimes(1);
  });

  it('closes the paused Consumer without resuming if the publisher loses permission', async () => {
    const { createPaused, receive, native, blockPublisher } = fixture();
    const binding = await createPaused();
    blockPublisher();
    expect(await receive('media.consumer.ready', binding)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(native.close).toHaveBeenCalledOnce();
    expect(native.resume).not.toHaveBeenCalled();
  });

  it('closes a pending Consumer when its requested source revision is stale', async () => {
    const { createPaused, receive, native } = fixture();
    const binding = await createPaused();
    expect(
      await receive('media.consumer.ready', { ...binding, expectedSourceRevision: 1 }),
    ).toMatchObject({ error: { code: 'SOURCE_CHANGED' } });
    expect(native.close).toHaveBeenCalledOnce();
    expect(native.resume).not.toHaveBeenCalled();
  });

  it('does not resume a Consumer if RTP capabilities fail the ready check', async () => {
    const { createPaused, receive, native, canConsume } = fixture();
    const binding = await createPaused();
    canConsume.mockReturnValue(false);
    expect(await receive('media.consumer.ready', binding)).toMatchObject({
      error: { code: 'MEDIA_UNAVAILABLE' },
    });
    expect(native.close).toHaveBeenCalledOnce();
    expect(native.resume).not.toHaveBeenCalled();
  });

  it('closes the Consumer and rejects the ack if permission changes during native resume', async () => {
    const { createPaused, receive, native, blockPublisher } = fixture();
    const binding = await createPaused();
    native.resume.mockImplementationOnce(async () => {
      blockPublisher();
    });
    expect(await receive('media.consumer.ready', binding)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(native.close).toHaveBeenCalledOnce();
  });
});
