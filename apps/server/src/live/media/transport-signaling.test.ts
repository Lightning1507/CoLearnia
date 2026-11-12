import { randomUUID } from 'node:crypto';
import type { LiveContext, SessionCleanupRequest } from '@colearnia/contracts';
import { mediaTransportCreateAckSchema } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CleanupAdmission } from '../session-manager/cleanup-admission.js';
import {
  beginSessionTransition,
  createSessionTransitionTiming,
} from '../session-manager/session-transition.js';
import { createTransportSignaling } from './transport-signaling.js';
import { createMediaSourceSync } from './media-source-sync.js';

type Ports = Parameters<typeof createTransportSignaling>[0];
type Native = Awaited<ReturnType<Ports['createTransport']>>;
type Socket = Parameters<ReturnType<typeof createTransportSignaling>['attach']>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(contextForSocket?: (socketId: string, context: LiveContext) => LiveContext) {
  const context: LiveContext = {
    sessionId: '1'.repeat(24),
    epoch: randomUUID(),
    callGeneration: 1,
    participantId: '2'.repeat(24),
    role: 'MEMBER',
    host: null,
    audienceEpoch: 2,
    policyRevision: 3,
    scope: { type: 'MAIN' },
    auth: {
      userId: '3'.repeat(24),
      authSessionId: '4'.repeat(24),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    access: {
      workspaceId: '5'.repeat(24),
      channelId: '6'.repeat(24),
      channelType: 'LIVE',
      membershipId: '7'.repeat(24),
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    },
  };
  const envelope = {
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: 1,
    expectedPolicyRevision: 3,
  };
  const createInput = { ...envelope, requestId: randomUUID(), payload: { direction: 'SEND' } };
  const dtlsParameters = {
    fingerprints: [{ algorithm: 'sha-256' as const, value: Array(32).fill('ab').join(':') }],
  };
  const native: Native = {
    id: 'transport-fixture',
    closed: false,
    iceParameters: { usernameFragment: 'fixture', password: 'fixture' },
    iceCandidates: [
      {
        foundation: 'fixture',
        priority: 1,
        ip: '127.0.0.1',
        address: '127.0.0.1',
        protocol: 'udp',
        port: 40000,
        type: 'host',
      },
    ],
    dtlsParameters,
    connect: vi.fn(async () => {}),
    close: vi.fn(),
    observer: { once: vi.fn() },
    on: vi.fn(),
  };
  const createTransport = vi.fn(async () => native);
  let allowed = true;
  const admission = new CleanupAdmission();
  const service = createTransportSignaling({
    admission,
    createTransport,
    async withContext(socketId, _input, use) {
      if (!allowed || socketId === 'anonymous')
        return use({ ok: false, errorCode: 'AUTH_REQUIRED' });
      return use({ ok: true, context: contextForSocket?.(socketId, context) ?? context }, {
        closed: false,
      } as MediaTypes.Router);
    },
  });
  function socket(id: string) {
    const handlers = new Map<Parameters<Socket['on']>[0], Parameters<Socket['on']>[1]>();
    let disconnect = () => {};
    service.attach({
      id,
      on: (event, listener) => handlers.set(event, listener),
      once: (_event, listener) => {
        disconnect = listener;
      },
    });
    return {
      emit: (event: Parameters<Socket['on']>[0], value: unknown) =>
        new Promise((ack) => handlers.get(event)?.(value, ack)),
      disconnect: () => disconnect(),
    };
  }
  const cleanup: SessionCleanupRequest = {
    operationId: randomUUID(),
    transitionToken: randomUUID(),
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: 1,
    reason: 'ACCESS_REVOKED',
    target: { type: 'PARTICIPANT', participantId: context.participantId },
  };
  return {
    context,
    createInput,
    envelope,
    dtlsParameters,
    native,
    createTransport,
    service,
    socket,
    cleanup,
    admission,
    revoke: () => {
      allowed = false;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('SCRUM-60 transport signaling', () => {
  it('publishes close for a Transport acknowledged after snapshot on the same socket only', async () => {
    const f = fixture();
    const sync = createMediaSourceSync({
      transports: f.service,
      media: {
        visibleSources: () => [],
        readOwnSources: () => ({ ownConsumers: [], ownProducers: [] }),
      },
      async withContext(_socketId, input, use) {
        const { context } = f;
        return use({ ok: true, context }, undefined, {
          request: { ...input, auth: context.auth },
          access: context.access,
          nowMs: Date.now(),
          session: {
            sessionId: context.sessionId,
            epoch: context.epoch,
            workspaceId: context.access.workspaceId,
            channelId: context.access.channelId,
            policyRevision: context.policyRevision,
            state: 'ACTIVE',
            phase: 'GUIDANCE',
            hostParticipantId: null,
            helpingGroupId: null,
            round: null,
            participants: new Map(),
            groups: new Map(),
          },
        });
      },
    });
    async function attachSync(id: string) {
      type SyncSocket = Parameters<typeof sync.attach>[0];
      let resync: Parameters<SyncSocket['on']>[1] | undefined;
      const emit = vi.fn<SyncSocket['emit']>();
      const recipient = sync.attach({
        id,
        connected: true,
        on: (_event, listener) => {
          resync = listener;
        },
        once: vi.fn(),
        emit,
      });
      expect(resync).toBeDefined();
      const { sessionId, epoch, callGeneration } = f.context;
      const result = await new Promise((ack) =>
        resync?.({ requestId: randomUUID(), sessionId, epoch, callGeneration, payload: {} }, ack),
      );
      expect(result).toMatchObject({ data: { status: 'completed' } });
      return { ...recipient, emit };
    }

    const owner = await attachSync('owner');
    const otherTab = await attachSync('other-tab');
    await expect(
      f.socket('owner').emit('media.transport.create', f.createInput),
    ).resolves.toMatchObject({
      data: { result: { transportId: f.native.id } },
    });
    f.service.cleanup(f.cleanup);
    const closed = { transportId: f.native.id, reason: 'TRANSPORT_FAILED' } as const;
    await expect(otherTab.publish('media.transport.closed', closed)).resolves.toBe(false);
    await expect(owner.publish('media.transport.closed', closed)).resolves.toBe(true);
    expect(owner.emit).toHaveBeenLastCalledWith(
      'media.transport.closed',
      expect.objectContaining({ mediaSequence: 1, payload: closed }),
    );
    await expect(owner.publish('media.transport.closed', closed)).resolves.toBe(false);
  });

  it('deduplicates create and rejects stale and foreign transport commands', async () => {
    const f = fixture();
    const owner = f.socket('owner');
    const first = owner.emit('media.transport.create', f.createInput);
    const created = mediaTransportCreateAckSchema.parse(await first);
    expect(await owner.emit('media.transport.create', f.createInput)).toEqual(created);
    expect(f.createTransport).toHaveBeenCalledOnce();
    const connect = {
      ...f.envelope,
      requestId: randomUUID(),
      payload: { transportId: f.native.id, dtlsParameters: f.dtlsParameters },
    };
    expect(await f.socket('anonymous').emit('media.transport.create', f.createInput)).toMatchObject(
      { error: { code: 'AUTH_REQUIRED' } },
    );
    expect(await f.socket('other-tab').emit('media.transport.connect', connect)).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(
      await owner.emit('media.transport.connect', { ...connect, callGeneration: 2 }),
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(await owner.emit('media.transport.connect', connect)).toMatchObject({
      data: { result: { connected: true } },
    });
    expect(await owner.emit('media.transport.connect', connect)).toMatchObject({
      data: { result: { connected: true } },
    });
    expect(
      await owner.emit('media.transport.connect', {
        ...connect,
        requestId: randomUUID(),
        payload: { ...connect.payload, dtlsParameters: { ...f.dtlsParameters, role: 'client' } },
      }),
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.native.connect).toHaveBeenCalledOnce();
    f.service.cleanup(f.cleanup);
  });

  it('rejects a flood of pending retries without attaching extra waiters and replays after completion', async () => {
    const f = fixture();
    const late = deferred<Native>();
    f.createTransport.mockReturnValueOnce(late.promise);
    const owner = f.socket('owner');
    const original = owner.emit('media.transport.create', f.createInput);
    await vi.waitFor(() => expect(f.createTransport).toHaveBeenCalledOnce());
    const retries = await Promise.all(
      Array.from({ length: 512 }, () => owner.emit('media.transport.create', f.createInput)),
    );
    expect(retries).toEqual(
      Array.from({ length: 512 }, () =>
        expect.objectContaining({
          requestId: f.createInput.requestId,
          error: expect.objectContaining({ code: 'OPERATION_IN_PROGRESS' }),
        }),
      ),
    );
    expect(f.createTransport).toHaveBeenCalledOnce();
    late.resolve(f.native);
    const completed = mediaTransportCreateAckSchema.parse(await original);
    expect(completed).toHaveProperty('data.result.transportId', f.native.id);
    expect(await owner.emit('media.transport.create', f.createInput)).toEqual(completed);
    expect(f.createTransport).toHaveBeenCalledOnce();
    f.service.cleanup(f.cleanup);
  });

  it('closes a late create on revoke and keeps the I/O slot until completion', async () => {
    const f = fixture();
    const late = deferred<Native>();
    f.createTransport.mockReturnValueOnce(late.promise);
    const pending = f.socket('owner').emit('media.transport.create', f.createInput);
    await vi.waitFor(() => expect(f.createTransport).toHaveBeenCalledOnce());
    f.revoke();
    expect(f.service.cleanup(f.cleanup).outcome).toEqual({
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: true,
    });
    expect(f.admission.stats().active).toBe(1);
    late.resolve(f.native);
    expect(await pending).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.native.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
  });

  it('times out a stalled native create without returning its admission slot early', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const late = deferred<Native>();
    f.createTransport.mockReturnValueOnce(late.promise);
    const owner = f.socket('owner');
    const reply = owner.emit('media.transport.create', f.createInput);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await reply).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
    expect(f.admission.stats().active).toBe(1);
    expect(f.service.cleanup(f.cleanup).outcome.cleanupPending).toBe(true);
    late.resolve(f.native);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(f.admission.stats().active).toBe(0);
  });

  it('closes an established transport under the transition gate when all eight session slots are occupied', async () => {
    vi.useFakeTimers();
    const f = fixture((socketId, context) => {
      if (socketId === 'owner') return context;
      const userId = socketId.padStart(24, '0');
      return { ...context, participantId: userId, auth: { ...context.auth, userId } };
    });
    const owner = f.socket('owner');
    await owner.emit('media.transport.create', f.createInput);
    await owner.emit('media.transport.connect', {
      ...f.envelope,
      requestId: randomUUID(),
      payload: { transportId: f.native.id, dtlsParameters: f.dtlsParameters },
    });
    const dtlsChanged = vi.mocked(f.native.on).mock.calls[0]?.[1];
    if (!dtlsChanged) throw new Error('DTLS listener was not registered');
    dtlsChanged('connected');

    const stalled = Array.from({ length: 8 }, (_, index) => {
      const native = { ...f.native, id: `stalled-${index}`, close: vi.fn() };
      const late = deferred<Native>();
      f.createTransport.mockReturnValueOnce(late.promise);
      return { late, native };
    });
    const requests = ['11', '12', '13', '14'].flatMap((user) => {
      const socket = f.socket(user);
      return ['SEND', 'RECV'].map((direction) =>
        socket.emit('media.transport.create', {
          ...f.envelope,
          requestId: randomUUID(),
          payload: { direction },
        }),
      );
    });
    await vi.advanceTimersByTimeAsync(2000);
    const timeouts = await Promise.all(requests);
    for (const reply of timeouts) {
      expect(reply).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
    }
    expect(f.createTransport).toHaveBeenCalledTimes(9);
    expect(f.admission.stats().active).toBe(8);
    expect(f.native.close).not.toHaveBeenCalled();

    let gateHeld = true;
    const revoke = vi.fn((request: SessionCleanupRequest) => {
      expect(gateHeld).toBe(true);
      return f.service.cleanup(request);
    });
    const transition = beginSessionTransition(
      f.cleanup,
      {
        assertHeld() {
          expect(gateHeld).toBe(true);
        },
        isCurrent: () => true,
      },
      {
        media: { revoke },
        messaging: vi.fn(),
        board: vi.fn(),
      },
      {
        userId: '3'.repeat(24),
        admission: f.admission,
        now: Date.now,
        timing: createSessionTransitionTiming(Date.now),
      },
    );
    gateHeld = false;
    expect(revoke).toHaveBeenCalledOnce();
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(transition.inspect().barrierActive).toBe(true);
    const foreground = transition.runForeground();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await foreground).phase).toBe('DEGRADED');
    expect(f.admission.stats().active).toBe(8);

    for (const { late, native } of stalled) late.resolve(native);
    await vi.advanceTimersByTimeAsync(0);
    for (const { native } of stalled) expect(native.close).toHaveBeenCalledOnce();
    expect(f.admission.stats().active).toBe(0);
  });

  it('does not acknowledge connect when authority changes during native I/O', async () => {
    const f = fixture();
    const owner = f.socket('owner');
    await owner.emit('media.transport.create', f.createInput);
    const late = deferred<void>();
    vi.mocked(f.native.connect).mockReturnValueOnce(late.promise);
    const pending = owner.emit('media.transport.connect', {
      ...f.envelope,
      requestId: randomUUID(),
      payload: { transportId: f.native.id, dtlsParameters: f.dtlsParameters },
    });
    await vi.waitFor(() => expect(f.native.connect).toHaveBeenCalledOnce());
    f.revoke();
    late.resolve(undefined);
    expect(await pending).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(f.native.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.admission.stats().active).toBe(0));
  });

  it('closes failed connect and expires a create that never starts DTLS', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const owner = f.socket('owner');
    await owner.emit('media.transport.create', f.createInput);
    vi.mocked(f.native.connect).mockRejectedValueOnce(new Error('fixture failure'));
    const result = await owner.emit('media.transport.connect', {
      ...f.envelope,
      requestId: randomUUID(),
      payload: { transportId: f.native.id, dtlsParameters: f.dtlsParameters },
    });
    expect(result).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
    expect(f.native.close).toHaveBeenCalledOnce();
    expect(
      await owner.emit('media.transport.create', { ...f.createInput, requestId: randomUUID() }),
    ).toMatchObject({ data: { result: { transportId: f.native.id } } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.native.close).toHaveBeenCalledTimes(2);
  });
});
