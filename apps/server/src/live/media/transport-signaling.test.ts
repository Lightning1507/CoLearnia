import { randomUUID } from 'node:crypto';
import type { LiveContext, SessionCleanupRequest } from '@colearnia/contracts';
import { mediaTransportCreateAckSchema } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CleanupAdmission } from '../session-manager/cleanup-admission.js';
import { createTransportSignaling } from './transport-signaling.js';

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

function fixture() {
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
      return use({ ok: true, context }, { closed: false } as MediaTypes.Router);
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
  it('deduplicates create and rejects stale and foreign transport commands', async () => {
    const f = fixture();
    const owner = f.socket('owner');
    const first = owner.emit('media.transport.create', f.createInput);
    const replay = owner.emit('media.transport.create', f.createInput);
    const created = mediaTransportCreateAckSchema.parse(await first);
    expect(await replay).toEqual(created);
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
    await f.service.cleanup(f.cleanup);
  });

  it('closes a late create on revoke and keeps the I/O slot until completion', async () => {
    const f = fixture();
    const late = deferred<Native>();
    f.createTransport.mockReturnValueOnce(late.promise);
    const pending = f.socket('owner').emit('media.transport.create', f.createInput);
    await vi.waitFor(() => expect(f.createTransport).toHaveBeenCalledOnce());
    f.revoke();
    expect((await f.service.cleanup(f.cleanup)).outcome).toEqual({
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
    expect((await f.service.cleanup(f.cleanup)).outcome.cleanupPending).toBe(true);
    late.resolve(f.native);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.native.close).toHaveBeenCalledOnce();
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
