import { randomUUID } from 'node:crypto';
import { mediaProducerCreateAckSchema, mediaSourcesResyncAckSchema } from '@colearnia/contracts';
import type { LiveContext, SessionCleanupRequest } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import { describe, expect, it, vi } from 'vitest';
import type { PolicyParticipant, SessionPolicyInput } from '../policy/session-policy.js';
import { resolveSessionPolicyContext } from '../policy/session-policy.js';
import { CleanupAdmission } from '../session-manager/cleanup-admission.js';
import { createPausedReadySignaling } from './paused-ready-signaling.js';
import { createTransportSignaling } from './transport-signaling.js';
import { createMediaSourceSync } from './media-source-sync.js';

type SocketPort = Parameters<ReturnType<typeof createPausedReadySignaling>['attach']>[0];
type Event = Parameters<SocketPort['on']>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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
  function makeProducer() {
    let onClose: (() => void) | undefined;
    const producer = {
      id: randomUUID(),
      closed: false,
      close: vi.fn(() => {
        producer.closed = true;
        onClose?.();
      }),
      observer: {
        once: (_event: string, close: () => void) => {
          onClose = close;
        },
      },
    };
    closeProducer = producer.close;
    return producer;
  }
  const produce = vi.fn(async () => makeProducer());
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
  const admission = new CleanupAdmission();
  const transportService = createTransportSignaling({
    admission,
    async withContext() {
      throw new Error('Fixture supplies its own media context');
    },
    async createTransport() {
      throw new Error('Fixture supplies its own media transport');
    },
  });
  function policyFor(context: LiveContext): SessionPolicyInput {
    return {
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
        policyRevision: context.policyRevision,
        hostParticipantId: null,
        helpingGroupId: null,
        round: null,
        groups: new Map(),
        participants,
      },
    };
  }
  let nextGate: Promise<void> | undefined;
  let afterSettle: (() => void) | undefined;
  const service = createPausedReadySignaling({
    ...transportService,
    pendingMedia: {
      ...transportService.pendingMedia,
      track(...args) {
        const untrack = transportService.pendingMedia.track(...args);
        return () => {
          untrack();
          const callback = afterSettle;
          afterSettle = undefined;
          if (callback) queueMicrotask(callback);
        };
      },
    },
    async withMediaTransport(socket, input, transport, direction, use) {
      const gate = nextGate;
      nextGate = undefined;
      if (gate) await gate;
      const context = contexts.get(socket);
      if (
        !context ||
        ![direction, `${direction}-new`].includes(transport) ||
        input.callGeneration !== context.callGeneration
      ) {
        return { errorCode: 'CONFLICT' };
      }
      const policy = policyFor(context);
      return use(context, { canConsume } as unknown as MediaTypes.Router, policy, {
        id: transport,
        produce: produce as unknown as MediaTypes.WebRtcTransport['produce'],
        consume: consume as unknown as MediaTypes.WebRtcTransport['consume'],
      });
    },
  });
  function cleanup(user: 'a' | 'b', callGeneration = 1, audienceEpoch?: number) {
    const participantId = user.repeat(24);
    const request: SessionCleanupRequest = {
      operationId: randomUUID(),
      transitionToken: randomUUID(),
      sessionId,
      epoch,
      callGeneration,
      target:
        audienceEpoch === undefined
          ? { type: 'PARTICIPANT', participantId }
          : { type: 'PARTICIPANT_SCOPE', participantId, audienceEpoch, scope: { type: 'MAIN' } },
      reason: 'ACCESS_REVOKED',
    };
    return transportService.cleanup(request).outcome;
  }
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
  const publish = (requestId?: string, transportId = 'SEND') =>
    send('media.producer.create', { transportId, sourceKind: 'MIC', rtpParameters }, requestId);
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
  let afterNextSyncContext: (() => void) | undefined;
  const sync = createMediaSourceSync({
    transports: transportService,
    media: service,
    async withContext(socketId, request, use) {
      const context = contexts.get(socketId);
      if (
        !context ||
        context.sessionId !== request.sessionId ||
        context.epoch !== request.epoch ||
        context.callGeneration !== request.callGeneration
      )
        return use({ ok: false, errorCode: 'CONFLICT' });
      const policy = policyFor(context);
      const result = use(resolveSessionPolicyContext(policy), undefined, policy);
      const after = afterNextSyncContext;
      afterNextSyncContext = undefined;
      after?.();
      return result;
    },
  });
  function attachSync(id: string) {
    type Socket = Parameters<typeof sync.attach>[0];
    let listener: Parameters<Socket['on']>[1] | undefined;
    const emit = vi.fn<Socket['emit']>();
    const bound = sync.attach({
      id,
      connected: true,
      on: (_event, receive) => {
        listener = receive;
      },
      once: vi.fn(),
      emit,
    });
    const resync = async (generation = 1) => {
      if (!listener) throw new Error('Missing resync handler');
      const ack = await new Promise((resolve) => {
        listener?.(
          {
            requestId: randomUUID(),
            sessionId,
            epoch,
            callGeneration: generation,
            payload: {},
          },
          resolve,
        );
      });
      return mediaSourcesResyncAckSchema.parse(ack);
    };
    return { ...bound, resync, emit };
  }
  return {
    createPaused,
    receive,
    native,
    canConsume,
    publish,
    produce,
    makeProducer,
    cleanup,
    admission,
    advanceAudience() {
      const context = contexts.get('a');
      const participant = participants.get('a'.repeat(24));
      if (!context || !participant) throw new Error('Missing fixture publisher');
      contexts.set('a', { ...context, audienceEpoch: 1 });
      participant.audienceEpoch = 1;
    },
    holdNextGate: (gate: Promise<void>) => {
      nextGate = gate;
    },
    afterNextSettle(callback: () => void) {
      afterSettle = callback;
    },
    closeProducer: () => closeProducer?.(),
    consumerPayload,
    consume,
    attachSync,
    afterNextSyncContext: (run: () => void) => {
      afterNextSyncContext = run;
    },
    blockRecipient: () => {
      const recipient = participants.get('b'.repeat(24));
      if (recipient) recipient.blocked = true;
    },
    blockPublisher: () => {
      const publisher = participants.get('a'.repeat(24));
      if (publisher) publisher.blocked = true;
    },
  };
}

describe('paused-ready media signaling', () => {
  it('takes a filtered media snapshot with a distinct stream and watermark for each recipient', async () => {
    const f = fixture();
    const publisher = f.attachSync('a');
    const recipient = f.attachSync('b');
    const beforeA = await publisher.resync();
    const beforeB = await recipient.resync();
    if ('error' in beforeA || 'error' in beforeB) throw new Error('Resync failed');
    expect(beforeA.data.result.mediaStreamId).not.toBe(beforeB.data.result.mediaStreamId);
    expect(beforeB.data.result.mediaSequence).toBe(0);
    const produced = mediaProducerCreateAckSchema.parse(await f.publish());
    if ('error' in produced) throw new Error('Produce failed');
    const { source } = produced.data.result;
    expect(await recipient.publish('media.source.changed', { source })).toBe(true);
    expect(recipient.emit).toHaveBeenLastCalledWith('media.source.changed', {
      sessionId: expect.any(String),
      epoch: expect.any(String),
      callGeneration: 1,
      audienceEpoch: 0,
      policyRevision: 0,
      mediaStreamId: beforeB.data.result.mediaStreamId,
      mediaSequence: 1,
      payload: { source },
    });
    await expect(publisher.resync()).resolves.toMatchObject({
      data: { result: { mediaStreamId: beforeA.data.result.mediaStreamId, mediaSequence: 0 } },
    });
    expect(publisher.emit).toHaveBeenLastCalledWith(
      'media.sources.snapshot',
      expect.objectContaining({
        payload: expect.objectContaining({ ownProducers: [{ source, replacement: null }] }),
      }),
    );
    f.blockPublisher();
    expect(await recipient.publish('media.source.changed', { source })).toBe(false);
    await expect(recipient.resync()).resolves.toMatchObject({
      data: { result: { mediaStreamId: beforeB.data.result.mediaStreamId, mediaSequence: 1 } },
    });
    expect(recipient.emit).toHaveBeenLastCalledWith(
      'media.sources.snapshot',
      expect.objectContaining({
        payload: expect.objectContaining({ sources: [], ownProducers: [] }),
      }),
    );
  });

  it('rechecks recipient access immediately before sending snapshot parts', async () => {
    const f = fixture();
    const recipient = f.attachSync('b');
    await f.publish();
    f.afterNextSyncContext(f.blockRecipient);
    await expect(recipient.resync()).resolves.toMatchObject({
      error: { code: expect.any(String) },
    });
    expect(recipient.emit).not.toHaveBeenCalled();
  });

  it('discards a captured snapshot if the publisher loses access before send', async () => {
    const f = fixture();
    const recipient = f.attachSync('b');
    await f.publish();
    f.afterNextSyncContext(f.blockPublisher);
    await expect(recipient.resync()).resolves.toMatchObject({ error: { code: 'SERVER_BUSY' } });
    expect(recipient.emit).not.toHaveBeenCalled();
    await expect(recipient.resync()).resolves.toMatchObject({ data: { status: 'completed' } });
    expect(recipient.emit).toHaveBeenLastCalledWith(
      'media.sources.snapshot',
      expect.objectContaining({ payload: expect.objectContaining({ sources: [] }) }),
    );
  });

  it('rejects a Producer ACK if its owner loses access after native settlement', async () => {
    const f = fixture();
    const producer = f.makeProducer();
    f.produce.mockResolvedValueOnce(producer);
    let revoked: ReturnType<typeof f.cleanup> | undefined;
    f.afterNextSettle(() => {
      f.blockPublisher();
      revoked = f.cleanup('a');
    });
    expect(await f.publish()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(revoked).toMatchObject({ pendingInvalidated: true, cleanupPending: false });
    expect(f.admission.stats().active).toBe(0);
    expect(producer.close).toHaveBeenCalledOnce();
  });

  it.each(['create', 'ready'] as const)(
    'rejects a Consumer %s ACK if the source is revoked after native settlement',
    async (stage) => {
      const f = fixture();
      const payload = stage === 'create' ? await f.consumerPayload() : await f.createPaused();
      let revoked: ReturnType<typeof f.cleanup> | undefined;
      f.afterNextSettle(() => {
        f.blockPublisher();
        revoked = f.cleanup('a');
      });
      expect(await f.receive(`media.consumer.${stage}`, payload)).toMatchObject({
        error: { code: stage === 'create' ? 'NOT_FOUND' : 'FORBIDDEN' },
      });
      expect(revoked).toMatchObject({ pendingInvalidated: true, cleanupPending: false });
      expect(f.admission.stats().active).toBe(0);
      expect(f.native.close).toHaveBeenCalledOnce();
    },
  );

  it('invalidates a pending Producer at revoke and closes its late result before releasing admission', async () => {
    const f = fixture();
    const late = deferred<ReturnType<typeof f.makeProducer>>();
    const producer = f.makeProducer();
    f.produce.mockReturnValueOnce(late.promise);
    const ack = f.publish();
    expect(f.produce).toHaveBeenCalledOnce();
    expect(f.cleanup('a', 2).cleanupPending).toBe(false);
    expect(f.cleanup('a', 1, 0)).toEqual({
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: true,
    });
    expect(await ack).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.admission.stats().active).toBe(1);
    f.advanceAudience();
    const current = f.makeProducer();
    f.produce.mockResolvedValueOnce(current);
    expect(await f.publish(undefined, 'SEND-new')).toMatchObject({
      data: { result: { producerId: current.id } },
    });
    expect(f.cleanup('a', 1, 0).cleanupPending).toBe(true);
    late.resolve(producer);
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
    expect(producer.close).toHaveBeenCalledOnce();
    expect(f.cleanup('a', 1, 0).cleanupPending).toBe(false);
    expect(current.close).not.toHaveBeenCalled();
    f.closeProducer();
  });

  it('invalidates a pending Consumer when the publisher is revoked on a different transport', async () => {
    const f = fixture();
    const payload = await f.consumerPayload();
    const late = deferred<typeof f.native>();
    f.consume.mockReturnValueOnce(late.promise);
    const ack = f.receive('media.consumer.create', payload);
    expect(f.consume).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
    expect(f.cleanup('a').cleanupPending).toBe(true);
    expect(await ack).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.admission.stats().active).toBe(1);
    late.resolve(f.native);
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(f.native.resume).not.toHaveBeenCalled();
    expect(f.cleanup('a').cleanupPending).toBe(false);
  });

  it('closes the bound Consumer immediately when revoked during native resume', async () => {
    const f = fixture();
    const binding = await f.createPaused();
    const late = deferred<void>();
    f.native.resume.mockReturnValueOnce(late.promise);
    const ack = f.receive('media.consumer.ready', binding);
    expect(f.native.resume).toHaveBeenCalledOnce();
    expect(f.cleanup('b').cleanupPending).toBe(true);
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(await ack).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.admission.stats().active).toBe(1);
    late.resolve();
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(f.cleanup('b').cleanupPending).toBe(false);
  });

  it('closes a Producer that already returned from native I/O while its recheck is still queued', async () => {
    const f = fixture();
    const late = deferred<ReturnType<typeof f.makeProducer>>();
    const gate = deferred<void>();
    const producer = f.makeProducer();
    f.produce.mockReturnValueOnce(late.promise);
    const ack = f.publish();
    f.holdNextGate(gate.promise);
    late.resolve(producer);
    await Promise.resolve();
    expect(f.cleanup('a').cleanupPending).toBe(true);
    expect(producer.close).toHaveBeenCalledOnce();
    expect(await ack).toMatchObject({ error: { code: 'CONFLICT' } });
    gate.resolve();
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
    expect(producer.close).toHaveBeenCalledOnce();
  });

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
