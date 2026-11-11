import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import type { types as MediaTypes } from 'mediasoup';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  SessionProjection,
  SessionCleanupRequest,
  SessionCleanupResult,
} from '@colearnia/contracts';
import { sessionJoinAckSchema } from '@colearnia/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationCoordinator } from '../../lib/operation-coordinator.js';
import { createMainJoinRegistry, MainJoinError } from './main-join-registry.js';
import { canReceiveMedia } from '../policy/session-policy.js';
import type { PolicyParticipant, SessionPolicyState } from '../policy/session-policy.js';

const registries: ReturnType<typeof createMainJoinRegistry>[] = [];
afterEach(() => {
  for (const registry of registries.splice(0)) registry.close();
});
const id = () => new Types.ObjectId().toHexString();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(
  limits: Parameters<typeof createMainJoinRegistry>[0]['limits'] = {},
  revocationCleanup?: Parameters<typeof createMainJoinRegistry>[0]['revocationCleanup'],
  revokedAuthSessions?: Parameters<typeof createMainJoinRegistry>[0]['revokedAuthSessions'],
  endCleanup?: Parameters<typeof createMainJoinRegistry>[0]['endCleanup'],
) {
  let time = Date.UTC(2026, 10, 10);
  const target = { workspaceId: id(), channelId: id() };
  const principal = (): AuthenticatedContext => ({
    userId: id(),
    authSessionId: id(),
    expiresAt: new Date(time + 3600_000).toISOString(),
  });
  const auth = principal();
  const access = (identity: AuthenticatedContext, destination = target): ChannelAccessStamp => ({
    ...destination,
    channelType: 'LIVE',
    membershipId: identity.userId,
    membershipIncarnation: 1,
    membershipRevision: 0,
    channelRevision: 0,
    canReadContent: true,
    canManageChannel: false,
  });
  const resolveAuthority = vi.fn(
    async (identity: AuthenticatedContext, destination: typeof target) => ({
      auth: { ...identity },
      access: access(identity, destination),
      displayName: 'Sinh viên',
    }),
  );
  const isAuthorityCurrent = vi.fn<
    Parameters<typeof createMainJoinRegistry>[0]['isAuthorityCurrent']
  >(() => true);
  const routers: MediaTypes.Router[] = [];
  const createRouter = vi.fn(async () => {
    const router = {
      id: randomUUID(),
      closed: false,
      close: vi.fn(function (this: { closed: boolean }) {
        this.closed = true;
      }),
    } as unknown as MediaTypes.Router;
    routers.push(router);
    return router;
  });
  const repository = {
    beginEnding: vi.fn(async (input: { expectedRevision: number }) => ({
      revision: input.expectedRevision + 1,
    })),
    completeEnding: vi.fn(async (input: { expectedRevision: number }) => ({
      revision: input.expectedRevision + 1,
    })),
    create: vi.fn(async (input: { sessionId: Types.ObjectId; participantId: Types.ObjectId }) => ({
      sessionId: input.sessionId,
      participantId: input.participantId,
      revision: 0,
    })),
    join: vi.fn(async (input: { participantId: Types.ObjectId; expectedRevision: number }) => ({
      participantId: input.participantId,
      revision: input.expectedRevision + 1,
    })),
  };
  const registry = createMainJoinRegistry({
    coordinator: createOperationCoordinator(),
    repository,
    resolveAuthority,
    isAuthorityCurrent,
    createRouter,
    now: () => time,
    limits,
    ...(revocationCleanup ? { revocationCleanup } : {}),
    ...(endCleanup ? { endCleanup } : {}),
    // Fixture M1 records the cohort when committing logout-all, not on delivery.
    revokedAuthSessions: revokedAuthSessions ?? (() => [auth.authSessionId]),
  });
  registries.push(registry);
  const binding = (identity = auth) => ({
    auth: identity,
    socketId: randomUUID(),
    isConnected: () => true,
  });
  const issue = (identity = auth, destination = target, requestId = randomUUID()) =>
    registry.issue(identity, destination, { requestId });
  return {
    registry,
    auth,
    target,
    principal,
    binding,
    issue,
    resolveAuthority,
    isAuthorityCurrent,
    repository,
    routers,
    createRouter,
    access,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}
function projection(
  result: Awaited<ReturnType<ReturnType<typeof createMainJoinRegistry>['join']>>,
) {
  return JSON.parse(result.parts.map((part) => part.fragment).join('')) as SessionProjection;
}

function cleanupAck(value: SessionCleanupRequest): SessionCleanupResult {
  const base = {
    operationId: value.operationId,
    sessionId: value.sessionId,
    epoch: value.epoch,
    transitionToken: value.transitionToken,
    outcome: {
      permissionRevoked: true as const,
      pendingInvalidated: true as const,
      cleanupPending: false,
    },
  };
  return 'callGeneration' in value
    ? { ...base, callGeneration: value.callGeneration, target: value.target }
    : { ...base, target: value.target };
}
async function revokeFixture(limits: Parameters<typeof setup>[0] = {}) {
  const media = vi.fn((value: SessionCleanupRequest) => cleanupAck(value));
  const messaging = vi.fn(async (value: SessionCleanupRequest) => cleanupAck(value));
  const board = vi.fn(async (value: SessionCleanupRequest) => cleanupAck(value));
  const adapters = { media: { revoke: media }, messaging, board };
  const f = setup(limits, adapters, undefined, adapters);
  const socket = f.binding();
  const ticket = await f.issue();
  const joined = await f.registry.join(socket, { ticket: ticket.ticket, requestId: randomUUID() });
  const event = {
    operationId: randomUUID(),
    revision: 1,
    kind: 'AUTH_SESSION' as const,
    authSessionId: f.auth.authSessionId,
  };
  return { ...f, socket, ticket, joined, event, media, messaging, board };
}

async function endFixture(
  action: 'END' | 'HOST_LEAVE' = 'END',
  limits: Parameters<typeof setup>[0] = {},
) {
  const media = vi.fn((value: SessionCleanupRequest) => cleanupAck(value));
  const messaging = vi.fn(async (value: SessionCleanupRequest) => cleanupAck(value));
  const board = vi.fn(async (value: SessionCleanupRequest) => cleanupAck(value));
  const f = setup(limits, undefined, undefined, { media: { revoke: media }, messaging, board });
  const socket = f.binding();
  const ticket = await f.issue();
  const joined = await f.registry.join(socket, { ticket: ticket.ticket, requestId: randomUUID() });
  const command = {
    requestId: randomUUID(),
    sessionId: ticket.sessionId,
    epoch: ticket.epoch,
    callGeneration: joined.ack.data.result.callGeneration,
    expectedPolicyRevision: joined.parts[0]!.policyRevision,
    action,
  };
  return { ...f, socket, command, media, messaging, board };
}

describe('SCRUM-86 session end', () => {
  it('keeps end idempotent when host revocation arrives while shared cleanup is pending', async () => {
    const f = await revokeFixture();
    const waiting = deferred<void>();
    f.messaging.mockImplementation(async (request) => {
      await waiting.promise;
      return cleanupAck(request);
    });
    const command = {
      requestId: randomUUID(),
      sessionId: f.ticket.sessionId,
      epoch: f.ticket.epoch,
      callGeneration: f.joined.ack.data.result.callGeneration,
      expectedPolicyRevision: f.joined.parts[0]!.policyRevision,
      action: 'END',
    };
    const ending = f.registry.end(f.socket, command);
    await vi.waitFor(() => expect(f.messaging).toHaveBeenCalled());
    const revoke = f.registry.revoke(f.event);
    await vi.waitFor(() =>
      expect(f.media.mock.calls.some(([request]) => request.reason === 'ACCESS_REVOKED')).toBe(
        true,
      ),
    );
    waiting.resolve();
    expect(await ending).toMatchObject({ data: { status: 'completed' } });
    expect((await revoke).permissionRevoked).toBe(true);
    expect(f.repository.beginEnding).toHaveBeenCalledTimes(1);
    expect(f.repository.completeEnding).toHaveBeenCalledTimes(1);
    expect(f.registry.stats().ownerships).toBe(0);
    await expect(f.registry.end(f.socket, command)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each([false, true])(
    'rejects replay that expires during authority lookup with a newer room=%s',
    async (newerRoom) => {
      const f = await endFixture();
      await f.registry.end(f.socket, f.command);
      let proof: { sessionId: string; epoch: string; callGeneration: number } | undefined;
      if (newerRoom) {
        const ticket = await f.issue();
        const joined = await f.registry.join(f.socket, {
          ticket: ticket.ticket,
          requestId: randomUUID(),
        });
        proof = { ...ticket, callGeneration: joined.ack.data.result.callGeneration };
      }
      f.advance(59_999);
      const original = f.resolveAuthority.getMockImplementation()!;
      f.resolveAuthority.mockImplementationOnce(async (auth, target) => {
        f.advance(2);
        return original(auth, target);
      });
      await expect(f.registry.end(f.socket, f.command)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(f.registry.stats().endRecords).toBe(0);
      expect(f.repository.beginEnding).toHaveBeenCalledTimes(1);
      expect(f.repository.completeEnding).toHaveBeenCalledTimes(1);
      expect(f.media).toHaveBeenCalledTimes(2);
      if (proof) {
        expect(f.routers[1]!.closed).toBe(false);
        expect(await f.registry.withContext(f.socket.socketId, proof, (result) => result.ok)).toBe(
          true,
        );
      }
    },
  );
  it('does not accept an end after authority checks exhaust the monotonic deadline', async () => {
    const f = await endFixture();
    let time = 0;
    const monotonic = vi.spyOn(performance, 'now').mockImplementation(() => time);
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, target) => {
      const value = await original(auth, target);
      time = 10_001;
      return value;
    });
    try {
      await expect(f.registry.end(f.socket, f.command)).rejects.toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
      });
      expect(f.routers[0]!.closed).toBe(false);
      expect(f.registry.stats().endRecords).toBe(0);
      expect(f.repository.beginEnding).not.toHaveBeenCalled();
      expect(f.media).not.toHaveBeenCalled();
      expect(
        await f.registry.withContext(f.socket.socketId, f.command, (result) => result.ok),
      ).toBe(true);
    } finally {
      monotonic.mockRestore();
    }
  });
  it('keeps pending when participants are clean but the shared MAIN scope is not confirmed', async () => {
    const f = await endFixture();
    f.board.mockImplementation(async (value) =>
      value.target.type === 'SCOPE'
        ? {
            ...cleanupAck(value),
            outcome: {
              permissionRevoked: false,
              pendingInvalidated: false,
              cleanupPending: true,
              errorCode: 'CONFLICT',
              retryable: false,
            },
          }
        : cleanupAck(value),
    );
    const result = await f.registry.end(f.socket, f.command);
    expect(result).toMatchObject({ data: { status: 'pending', result: { state: 'ENDING' } } });
    expect(f.board).toHaveBeenCalledWith(
      expect.objectContaining({ target: { type: 'SCOPE', scope: { type: 'MAIN' } } }),
    );
    expect(f.repository.completeEnding).not.toHaveBeenCalled();
    expect(f.routers[0]!.closed).toBe(true);
  });
  it('enforces bounded end retention before changing another active room', async () => {
    const f = await endFixture('END', { maxEndRecords: 1 });
    await f.registry.end(f.socket, f.command);
    const ticket = await f.issue();
    const joined = await f.registry.join(f.socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    await expect(
      f.registry.end(f.socket, {
        ...f.command,
        requestId: randomUUID(),
        sessionId: ticket.sessionId,
        epoch: ticket.epoch,
        callGeneration: joined.ack.data.result.callGeneration,
        expectedPolicyRevision: joined.parts[0]!.policyRevision,
      }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    expect(f.routers[1]!.closed).toBe(false);
    expect(f.registry.stats().endRecords).toBe(1);
  });
  it('rechecks access before returning a completed replay', async () => {
    const f = await endFixture();
    await f.registry.end(f.socket, f.command);
    f.resolveAuthority.mockImplementation(async (auth, target) => ({
      auth,
      access: { ...f.access(auth, target), canReadContent: false },
      displayName: 'Sinh viên',
    }));
    await expect(f.registry.end(f.socket, f.command)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.repository.completeEnding).toHaveBeenCalledTimes(1);
  });
  it('uses the host committed under the same gate when transfer precedes voluntary leave', async () => {
    const f = await endFixture('HOST_LEAVE');
    const member = f.principal();
    const ticket = await f.issue(member);
    const joined = await f.registry.join(f.binding(member), {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    // Simulate the synchronous host-transfer commit port under the real coordinator.
    // The host-transfer feature itself is outside this task.
    await f.registry.withContext(f.socket.socketId, f.command, (_resolved, _router, policy) => {
      const state = policy!.session as SessionPolicyState;
      state.hostParticipantId = joined.ack.data.result.participantId;
      state.policyRevision++;
    });
    await expect(f.registry.end(f.socket, f.command)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.repository.beginEnding).not.toHaveBeenCalled();
    expect(f.routers[0]!.closed).toBe(false);
  });
  it('does not enable end when a cleanup domain has not been configured', async () => {
    const f = setup();
    const socket = f.binding();
    const ticket = await f.issue();
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    await expect(
      f.registry.end(socket, {
        requestId: randomUUID(),
        sessionId: ticket.sessionId,
        epoch: ticket.epoch,
        callGeneration: joined.ack.data.result.callGeneration,
        expectedPolicyRevision: joined.parts[0]!.policyRevision,
        action: 'END',
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.routers[0]!.closed).toBe(false);
  });
  it('expires completed replay records without touching the next room', async () => {
    const f = await endFixture();
    await f.registry.end(f.socket, f.command);
    const next = await f.issue();
    const nextJoin = await f.registry.join(f.socket, {
      ticket: next.ticket,
      requestId: randomUUID(),
    });
    expect(next.sessionId).not.toBe(f.command.sessionId);
    await f.registry.end(f.socket, f.command);
    expect(f.registry.stats().ownerships).toBe(1);
    f.advance(60_000);
    await f.registry.sweepExpired();
    await expect(f.registry.end(f.socket, f.command)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(nextJoin.ack.data.result.callGeneration).toBeGreaterThan(f.command.callGeneration);
    expect(f.routers[1]!.closed).toBe(false);
  });
  it.each(['END', 'HOST_LEAVE'] as const)(
    'ends the session for %s once and replays only the exact command',
    async (action) => {
      const f = await endFixture(action);
      const [one, two] = await Promise.all([
        f.registry.end(f.socket, f.command),
        f.registry.end(f.socket, f.command),
      ]);
      expect(one).toEqual(two);
      expect(one).toMatchObject({ data: { status: 'completed', result: { state: 'ENDED' } } });
      expect(await f.registry.end(f.socket, f.command)).toEqual(one);
      expect(f.registry.stats().ownerships).toBe(0);
      expect(f.routers[0]!.close).toHaveBeenCalledTimes(1);
      expect(f.repository.beginEnding).toHaveBeenCalledTimes(1);
      expect(f.repository.completeEnding).toHaveBeenCalledTimes(1);
      expect(f.media).toHaveBeenCalledTimes(2);
      expect(f.messaging).toHaveBeenCalledTimes(2);
      expect(f.board).toHaveBeenCalledTimes(2);
      await expect(
        f.registry.end(f.socket, { ...f.command, action: action === 'END' ? 'HOST_LEAVE' : 'END' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(f.registry.end(f.binding(), f.command)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    },
  );
  it('denies members, stale revisions, wrong generations and forged identity before side effects', async () => {
    const f = await endFixture();
    for (const command of [
      { ...f.command, expectedPolicyRevision: 0 },
      { ...f.command, callGeneration: 999 },
      { ...f.command, epoch: randomUUID() },
    ])
      await expect(f.registry.end(f.socket, command)).rejects.toMatchObject({ code: 'CONFLICT' });
    const member = f.principal();
    const socket = f.binding(member);
    const ticket = await f.issue(member);
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    await expect(
      f.registry.end(socket, {
        ...f.command,
        callGeneration: joined.ack.data.result.callGeneration,
        expectedPolicyRevision: joined.parts[0]!.policyRevision,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      f.registry.end(f.socket, { ...f.command, userId: member.userId }),
    ).rejects.toThrow();
    expect(f.repository.beginEnding).not.toHaveBeenCalled();
    expect(f.routers[0]!.closed).toBe(false);
  });
  it('releases the gate while cleanup waits, blocks joins and coalesces retries', async () => {
    const f = await endFixture();
    const pending = deferred<SessionCleanupResult>();
    f.messaging.mockImplementation((value) => pending.promise.then(() => cleanupAck(value)));
    const first = f.registry.end(f.socket, f.command);
    await vi.waitFor(() => expect(f.messaging).toHaveBeenCalled());
    expect(f.routers[0]!.closed).toBe(true);
    await expect(f.issue(f.principal())).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    await expect(
      f.registry.withContext(f.socket.socketId, f.command, () => true),
    ).rejects.toThrow();
    const again = f.registry.end(f.socket, f.command);
    pending.resolve(cleanupAck(f.messaging.mock.calls[0]![0]));
    expect(await first).toEqual(await again);
    expect(f.repository.beginEnding).toHaveBeenCalledTimes(1);
    expect(f.repository.completeEnding).toHaveBeenCalledTimes(1);
  });
  it('keeps ENDING and deny after a permanent cleanup refusal, without blind retries', async () => {
    const f = await endFixture();
    f.board.mockImplementation(async (value) => ({
      ...cleanupAck(value),
      outcome: {
        permissionRevoked: false,
        pendingInvalidated: false,
        cleanupPending: true,
        errorCode: 'CONFLICT',
        retryable: false,
      },
    }));
    const result = await f.registry.end(f.socket, f.command);
    expect(result).toMatchObject({ data: { status: 'pending', result: { state: 'ENDING' } } });
    expect(await f.registry.end(f.socket, f.command)).toEqual(result);
    expect(f.repository.completeEnding).not.toHaveBeenCalled();
    expect(f.board).toHaveBeenCalledTimes(2);
    expect(f.registry.stats().ownerships).toBe(1);
    await expect(f.issue()).rejects.toThrow();
  });
  it.each(['beginEnding', 'completeEnding'] as const)(
    'does not repeat an uncertain %s write or expose raw DB errors',
    async (method) => {
      const f = await endFixture();
      f.repository[method].mockRejectedValueOnce(new Error('private-database-token'));
      const result = await f.registry.end(f.socket, f.command);
      expect(result).toMatchObject({ data: { status: 'pending' } });
      expect(await f.registry.end(f.socket, f.command)).toEqual(result);
      expect(f.repository[method]).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('private');
      await expect(f.issue()).rejects.toThrow();
    },
  );
});

describe('SCRUM-83 MAIN revocation', () => {
  it.each(['new login', 'fence before write', 'fence after write'] as const)(
    'does not grant a stale host reservation on delayed revoke: %s',
    async (kind) => {
      const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
      const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup });
      const reserved = await f.issue();
      const peer = f.principal();
      const peerTicket = await f.issue(peer);
      const peerSocket = f.binding(peer);
      const peerCommand = { ticket: peerTicket.ticket, requestId: randomUUID() };
      await f.registry.join(peerSocket, peerCommand);
      const login = kind === 'new login' ? { ...f.auth, authSessionId: id() } : f.auth;
      let revoked = kind === 'fence before write';
      f.isAuthorityCurrent.mockImplementation(
        (authority, _held, committed) =>
          !(revoked && authority.auth.userId === f.auth.userId && committed !== undefined),
      );
      const fresh = await f.issue(login);
      const originalJoin = f.repository.join.getMockImplementation()!;
      if (kind === 'fence after write')
        f.repository.join.mockImplementationOnce(async (input) => {
          const result = await originalJoin(input);
          revoked = true;
          return result;
        });
      const joining = f.registry.join(f.binding(login), {
        ticket: fresh.ticket,
        requestId: randomUUID(),
      });
      if (kind.startsWith('fence')) {
        await expect(joining).rejects.toMatchObject({ code: 'CONFLICT' });
        const peerSnapshot = await f.registry.join(peerSocket, peerCommand);
        expect(projection(peerSnapshot).hostParticipantId).toBeNull();
        return;
      }
      const joined = await joining;
      expect(fresh.sessionId).toBe(reserved.sessionId);
      expect(projection(joined).viewer.role).toBe('MEMBER');
      expect(projection(joined).hostParticipantId).toBeNull();
      await f.registry.revoke({
        operationId: randomUUID(),
        kind: 'AUTH_SESSION',
        authSessionId: f.auth.authSessionId,
        revision: 1,
      });
    },
  );
  it.each(['membershipRevision', 'channelRevision'] as const)(
    'keeps host reservation across a continuous %s increase, but not a revoke/regrant gap',
    async (field) => {
      for (const continuous of [true, false]) {
        const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
        const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup });
        const reserved = await f.issue();
        f.resolveAuthority.mockImplementation(async (auth, target) => ({
          auth,
          access: { ...f.access(auth, target), [field]: 1 },
          displayName: 'Sinh viên',
        }));
        f.isAuthorityCurrent.mockImplementation(
          (_authority, _held, committed) =>
            committed === undefined || continuous || committed[field] === 1,
        );
        const ticket = await f.issue();
        const socket = f.binding();
        const command = { ticket: ticket.ticket, requestId: randomUUID() };
        const joined = await f.registry.join(socket, command);
        expect(projection(joined).viewer.role).toBe(continuous ? 'HOST' : 'MEMBER');
        expect(projection(joined).hostParticipantId).toBe(
          continuous ? joined.ack.data.result.participantId : null,
        );
        expect(ticket.sessionId).toBe(reserved.sessionId);
        expect(projection(await f.registry.join(socket, command)).viewer.role).toBe(
          continuous ? 'HOST' : 'MEMBER',
        );
        expect(f.repository.join).toHaveBeenCalledTimes(1);
      }
    },
  );
  it('does not block a current ownership from the stale stamp of a consumed ticket', async () => {
    const f = await revokeFixture();
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, target) => ({
      ...(await original(auth, target)),
      access: { ...f.access(auth, target), channelRevision: 2 },
    }));
    const proof = { ...f.ticket, callGeneration: f.joined.ack.data.result.callGeneration };
    expect(await f.registry.withContext(f.socket.socketId, proof, (result) => result.ok)).toBe(
      true,
    );
    await f.registry.revoke({
      operationId: randomUUID(),
      revision: 1,
      kind: 'PRIVATE_CHANNEL_ACCESS',
      workspaceId: f.target.workspaceId,
      channelId: f.target.channelId,
      userId: f.auth.userId,
      membershipId: f.auth.userId,
      membershipIncarnation: 1,
    });
    expect(await f.registry.withContext(f.socket.socketId, proof, (result) => result.ok)).toBe(
      true,
    );
    expect(f.media).not.toHaveBeenCalled();
    expect(f.registry.stats().ownerships).toBe(1);
  });
  it.each([false, true])(
    'revokes an unconsumed host reservation with ticket expired=%s without promoting a later login',
    async (expired) => {
      const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
      const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup });
      const reserved = await f.issue();
      const peer = f.principal();
      const peerTicket = await f.issue(peer);
      await f.registry.join(f.binding(peer), {
        ticket: peerTicket.ticket,
        requestId: randomUUID(),
      });
      if (expired) {
        f.advance(60_000);
        await f.registry.sweepExpired();
      }
      await f.registry.revoke({
        operationId: randomUUID(),
        revision: 1,
        kind: 'AUTH_SESSION',
        authSessionId: f.auth.authSessionId,
      });
      const login = { ...f.auth, authSessionId: id() };
      const fresh = await f.issue(login);
      expect(fresh.sessionId).toBe(reserved.sessionId);
      const joined = await f.registry.join(f.binding(login), {
        ticket: fresh.ticket,
        requestId: randomUUID(),
      });
      expect(projection(joined).viewer.role).toBe('MEMBER');
    },
  );
  it('uses the M1 committed logout-all cohort when a newer login predates event delivery', async () => {
    const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
    const cohort = vi.fn<NonNullable<Parameters<typeof setup>[2]>>();
    const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup }, cohort);
    const old = await f.issue();
    const login = { ...f.auth, authSessionId: id() };
    const fresh = await f.issue(login);
    cohort.mockReturnValue([f.auth.authSessionId]);
    const event = {
      operationId: randomUUID(),
      revision: 7,
      kind: 'USER_AUTH_SESSIONS',
      userId: f.auth.userId,
    };
    await f.registry.revoke(event);
    expect(cohort).toHaveBeenCalledWith(event);
    await expect(
      f.registry.join(f.binding(), { ticket: old.ticket, requestId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      f.registry.join(f.binding(login), { ticket: fresh.ticket, requestId: randomUUID() }),
    ).resolves.toHaveProperty('ack.data');
  });
  it('does not fall back to current sessions when the committed M1 cohort is unavailable', async () => {
    const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
    const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup }, () => {
      throw new Error('M1 cohort unavailable');
    });
    await f.issue();
    await expect(
      f.registry.revoke({
        operationId: randomUUID(),
        revision: 1,
        kind: 'USER_AUTH_SESSIONS',
        userId: f.auth.userId,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().intents).toBe(1);
    expect(f.registry.stats().revocations).toBe(0);
  });
  it('does not wait on an unrelated Workspace gate', async () => {
    const f = await revokeFixture();
    const peer = f.principal();
    const target = { workspaceId: id(), channelId: id() };
    const ticket = await f.issue(peer, target);
    const socket = f.binding(peer);
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const waiting = deferred<void>();
    const entered = deferred<void>();
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      if (auth.userId === peer.userId) {
        entered.resolve();
        await waiting.promise;
      }
      return original(auth, destination);
    });
    const context = f.registry.withContext(
      socket.socketId,
      { ...ticket, callGeneration: joined.ack.data.result.callGeneration },
      (result) => result.ok,
    );
    try {
      await entered.promise;
      expect((await f.registry.revoke(f.event)).permissionRevoked).toBe(true);
    } finally {
      waiting.resolve();
    }
    expect(await context).toBe(true);
  });
  it('rejects incomplete runtime wiring before invalidating a ticket', async () => {
    const f = setup({}, {} as NonNullable<Parameters<typeof setup>[1]>);
    await f.issue();
    await expect(
      f.registry.revoke({
        operationId: randomUUID(),
        kind: 'AUTH_SESSION',
        authSessionId: f.auth.authSessionId,
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().intents).toBe(1);
    expect(f.registry.stats().revocations).toBe(0);
  });
  it('invalidates an outstanding Router allocation before any ticket or ownership is exposed', async () => {
    const cleanup = async (value: SessionCleanupRequest) => cleanupAck(value);
    const f = setup({}, { media: cleanup, messaging: cleanup, board: cleanup });
    const pending = deferred<void>();
    const original = f.createRouter.getMockImplementation()!;
    f.createRouter.mockImplementationOnce(async () => {
      const router = await original();
      await pending.promise;
      return router;
    });
    const ticket = f.issue();
    const rejected = expect(ticket).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await vi.waitFor(() => expect(f.routers).toHaveLength(1));
    const result = await f.registry.revoke({
      operationId: randomUUID(),
      kind: 'AUTH_SESSION',
      authSessionId: f.auth.authSessionId,
      revision: 1,
    });
    expect(result).toMatchObject({
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: true,
    });
    pending.resolve();
    await rejected;
    expect(f.routers[0]!.closed).toBe(true);
    expect(f.registry.stats().ownerships).toBe(0);
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it('bounds replay records and keeps the M1 fence authoritative after local replay expiry', async () => {
    const f = await revokeFixture({ maxRevocations: 1, revocationReplayTtlMs: 1000 });
    await f.registry.revoke(f.event);
    await expect(
      f.registry.revoke({ ...f.event, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    f.isAuthorityCurrent.mockImplementation(
      (current) => current.auth.authSessionId !== f.auth.authSessionId,
    );
    f.advance(1000);
    await f.registry.sweepExpired();
    expect(f.registry.stats().revocations).toBe(0);
    await expect(f.issue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not release a newer generation if a lifecycle commit replaced the captured generation', async () => {
    const f = await revokeFixture();
    const peer = f.principal();
    const peerSocket = f.binding(peer);
    const ticket = await f.issue(peer);
    const joined = await f.registry.join(peerSocket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const waiting = deferred<void>();
    f.messaging.mockImplementation(async (value) => {
      await waiting.promise;
      return cleanupAck(value);
    });
    const revoke = f.registry.revoke(f.event);
    await vi.waitFor(() => expect(f.media).toHaveBeenCalledTimes(1));
    // Exercise an ABA guard using a future lifecycle commit under the actual gate.
    // This does not implement reconnect or claim a restored grant.
    await f.registry.withContext(
      peerSocket.socketId,
      { ...ticket, callGeneration: joined.ack.data.result.callGeneration },
      (_resolved, _router, policy) => {
        const participant = policy!.session.participants.get(
          f.joined.ack.data.result.participantId,
        ) as PolicyParticipant;
        participant.callGeneration++;
      },
    );
    waiting.resolve();
    await revoke;
    expect(f.registry.stats().ownerships).toBe(2);
    expect(f.media.mock.calls[0]![0]).toHaveProperty(
      'callGeneration',
      f.joined.ack.data.result.callGeneration,
    );
  });
  it('allows a new membership incarnation only through a fresh join and generation', async () => {
    const f = await revokeFixture();
    const peer = f.principal();
    const ticket = await f.issue(peer);
    await f.registry.join(f.binding(peer), { ticket: ticket.ticket, requestId: randomUUID() });
    await f.registry.revoke({
      operationId: randomUUID(),
      revision: 1,
      kind: 'WORKSPACE_MEMBERSHIP',
      workspaceId: f.target.workspaceId,
      userId: f.auth.userId,
      membershipId: f.auth.userId,
      membershipIncarnation: 1,
    });
    f.resolveAuthority.mockImplementation(async (auth, target) => ({
      auth,
      access: {
        ...f.access(auth, target),
        membershipIncarnation: auth.userId === f.auth.userId ? 2 : 1,
      },
      displayName: 'Sinh viên',
    }));
    const fresh = await f.issue();
    const joined = await f.registry.join(f.socket, {
      ticket: fresh.ticket,
      requestId: randomUUID(),
    });
    expect(joined.ack.data.result.callGeneration).toBeGreaterThan(
      f.joined.ack.data.result.callGeneration,
    );
    expect(projection(joined).viewer.role).toBe('MEMBER');
  });
  it('rejects revocation when required cleanup adapters are missing', async () => {
    const f = setup();
    const ticket = await f.issue();
    await expect(
      f.registry.revoke({
        operationId: randomUUID(),
        kind: 'AUTH_SESSION',
        authSessionId: f.auth.authSessionId,
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().intents).toBe(1);
    expect(ticket.ticket).not.toBe('');
  });
  it('invalidates tickets, cleans the exact generation once and replays the same operation', async () => {
    const f = await revokeFixture();
    const extraTicket = await f.issue();
    const [one, two] = await Promise.all([f.registry.revoke(f.event), f.registry.revoke(f.event)]);
    expect(one).toEqual(two);
    expect(one).toMatchObject({ permissionRevoked: true, pendingInvalidated: true });
    expect(f.registry.stats().ownerships).toBe(0);
    expect(f.media).toHaveBeenCalledTimes(1);
    expect(f.media.mock.calls[0]![0]).toMatchObject({
      callGeneration: f.joined.ack.data.result.callGeneration,
      target: { type: 'PARTICIPANT', participantId: f.joined.ack.data.result.participantId },
    });
    await expect(
      f.registry.join(f.socket, { ticket: extraTicket.ticket, requestId: randomUUID() }),
    ).rejects.toThrow();
    await expect(f.issue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.registry.revoke({ ...f.event, revision: 2 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(f.repository.join).toHaveBeenCalledTimes(1);
  });
  it('denies immediately while cleanup waits, without revoking unrelated peers', async () => {
    const f = await revokeFixture();
    const other = f.principal();
    const otherSocket = f.binding(other);
    const otherTicket = await f.issue(other);
    const joined = await f.registry.join(otherSocket, {
      ticket: otherTicket.ticket,
      requestId: randomUUID(),
    });
    const pending = deferred<SessionCleanupResult>();
    f.messaging.mockImplementation((value) => pending.promise.then(() => cleanupAck(value)));
    const task = f.registry.revoke(f.event);
    await vi.waitFor(() => expect(f.media).toHaveBeenCalledTimes(1));
    await expect(
      f.registry.withContext(
        f.socket.socketId,
        { ...f.ticket, callGeneration: f.joined.ack.data.result.callGeneration },
        (result) => result.ok,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await f.registry.withContext(
        otherSocket.socketId,
        { ...otherTicket, callGeneration: joined.ack.data.result.callGeneration },
        (result) => result.ok,
      ),
    ).toBe(true);
    pending.resolve(cleanupAck(f.messaging.mock.calls[0]![0]));
    await task;
    expect(f.registry.stats().ownerships).toBe(1);
  });
  it('keeps deny and ownership on permanent cleanup failure instead of restoring a grant', async () => {
    const f = await revokeFixture();
    f.board.mockImplementation(async (value) => ({
      ...cleanupAck(value),
      outcome: {
        permissionRevoked: false,
        pendingInvalidated: false,
        cleanupPending: true,
        errorCode: 'CONFLICT',
        retryable: false,
      },
    }));
    const result = await f.registry.revoke(f.event);
    expect(result).toMatchObject({ permissionRevoked: false, cleanupPending: true });
    expect(await f.registry.revoke(f.event)).toEqual(result);
    expect(f.registry.stats().ownerships).toBe(1);
    expect(f.board).toHaveBeenCalledTimes(1);
    await expect(f.issue()).rejects.toThrow();
  });
  it('does not grant a join whose metadata acknowledgement arrives after auth revocation', async () => {
    const f = await revokeFixture();
    const user = f.principal();
    const ticket = await f.issue(user);
    const waiting = deferred<{ participantId: Types.ObjectId; expectedRevision: number }>();
    f.repository.join.mockImplementationOnce(async (input) => {
      await waiting.promise;
      return { participantId: input.participantId, revision: input.expectedRevision + 1 };
    });
    const join = f.registry.join(f.binding(user), {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const rejected = expect(join).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await vi.waitFor(() => expect(f.repository.join).toHaveBeenCalledTimes(2));
    const revoke = f.registry.revoke({
      ...f.event,
      operationId: randomUUID(),
      authSessionId: user.authSessionId,
    });
    waiting.resolve(f.repository.join.mock.calls[1]![0]);
    await rejected;
    expect((await revoke).permissionRevoked).toBe(true);
    expect(f.registry.stats().ownerships).toBe(1);
  });
  it('does not restore old host control when a new login joins the continuing room', async () => {
    const f = await revokeFixture();
    const peer = f.principal();
    const peerTicket = await f.issue(peer);
    await f.registry.join(f.binding(peer), { ticket: peerTicket.ticket, requestId: randomUUID() });
    await f.registry.revoke(f.event);
    const login = { ...f.auth, authSessionId: id() };
    const ticket = await f.issue(login);
    const joined = await f.registry.join(f.binding(login), {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    expect(projection(joined).viewer.role).toBe('MEMBER');
    expect(joined.ack.data.result.callGeneration).toBeGreaterThan(
      f.joined.ack.data.result.callGeneration,
    );
    expect(f.registry.stats().ownerships).toBe(2);
  });
  it('captures USER_AUTH_SESSIONS without denying a later authSession', async () => {
    const f = await revokeFixture();
    await f.registry.revoke({
      operationId: randomUUID(),
      kind: 'USER_AUTH_SESSIONS',
      userId: f.auth.userId,
      revision: 1,
    });
    await expect(f.issue()).rejects.toThrow();
    await expect(f.issue({ ...f.auth, authSessionId: id() })).resolves.toHaveProperty('ticket');
  });
});

describe('SCRUM-82 MAIN join registry', () => {
  it('keeps each consumed ticket bound to its own requestId during same-socket recovery', async () => {
    const f = setup();
    const socket = f.binding();
    const firstTicket = await f.issue();
    const firstCommand = { ticket: firstTicket.ticket, requestId: randomUUID() };
    const first = await f.registry.join(socket, firstCommand);
    const secondTicket = await f.issue();
    const secondCommand = { ticket: secondTicket.ticket, requestId: randomUUID() };
    const second = await f.registry.join(socket, secondCommand);

    for (const command of [firstCommand, secondCommand, firstCommand]) {
      const replay = await f.registry.join(socket, command);
      expect(replay.ack.requestId).toBe(command.requestId);
      expect(replay.ack.data.result.participantId).toBe(first.ack.data.result.participantId);
      expect(replay.ack.data.result.callGeneration).toBe(first.ack.data.result.callGeneration);
      expect(projection(replay).participants).toHaveLength(1);
    }
    for (const command of [
      { ...firstCommand, requestId: secondCommand.requestId },
      { ...secondCommand, requestId: firstCommand.requestId },
    ]) {
      await expect(f.registry.join(socket, command)).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    expect(second.ack.data.result.participantId).toBe(first.ack.data.result.participantId);
    expect(second.ack.data.result.callGeneration).toBe(first.ack.data.result.callGeneration);
    expect(f.registry.stats().ownerships).toBe(1);
    expect(f.repository.create).toHaveBeenCalledTimes(1);
    expect(f.repository.join).toHaveBeenCalledTimes(1);
  });

  it('recovers the same socket with a new ticket after provider outage outlives replay expiry', async () => {
    const f = setup();
    const b = f.principal();
    const aTicket = await f.issue();
    await f.registry.join(f.binding(), { ticket: aTicket.ticket, requestId: randomUUID() });
    const ticket = await f.issue(b);
    const socket = f.binding(b);
    const command = { ticket: ticket.ticket, requestId: randomUUID() };
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      if (auth.userId === f.auth.userId) throw new Error('Temporary');
      return original(auth, destination);
    });
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    const participantId = f.repository.join.mock.calls[1]![0].participantId.toHexString();
    expect(f.registry.stats().ownerships).toBe(2);
    f.advance(60_000);
    await f.registry.sweepExpired();
    f.resolveAuthority.mockImplementation(original);
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const fresh = await f.issue(b);
    const recovery = { ticket: fresh.ticket, requestId: randomUUID() };
    await expect(f.registry.join(f.binding(b), recovery)).rejects.toMatchObject({
      code: 'CALL_ALREADY_ACTIVE',
    });
    const joined = await f.registry.join(socket, recovery);
    expect(joined.ack.data.result.participantId).toBe(participantId);
    expect(joined.ack.data.result.callGeneration).toBe(2);
    expect(projection(joined).participants).toHaveLength(2);
    expect(f.repository.join).toHaveBeenCalledTimes(2);
    const again = await f.registry.join(socket, recovery);
    expect(again.ack.data.result.callGeneration).toBe(joined.ack.data.result.callGeneration);
  });

  it('does not restore a revoked/regranted ownership through a fresh recovery ticket', async () => {
    const f = setup();
    const ticket = await f.issue();
    const socket = f.binding();
    await f.registry.join(socket, { ticket: ticket.ticket, requestId: randomUUID() });
    f.advance(60_000);
    await f.registry.sweepExpired();
    const fresh = await f.issue();
    f.isAuthorityCurrent.mockImplementation(
      (_authority, _held, committed) => committed === undefined,
    );
    await expect(
      f.registry.join(socket, { ticket: fresh.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.repository.join).toHaveBeenCalledOnce();
  });
  it.each(['membershipRevision', 'channelRevision'] as const)(
    'keeps uninterrupted access after %s increases, preserving ownership and retry',
    async (field) => {
      const f = setup();
      const b = f.principal();
      const aTicket = await f.issue();
      const bTicket = await f.issue(b);
      const aSocket = f.binding();
      const bSocket = f.binding(b);
      const aCommand = { ticket: aTicket.ticket, requestId: randomUUID() };
      const a = await f.registry.join(aSocket, aCommand);
      const joinedB = await f.registry.join(bSocket, {
        ticket: bTicket.ticket,
        requestId: randomUUID(),
      });
      f.resolveAuthority.mockImplementation(async (auth, destination) => ({
        auth,
        access: {
          ...f.access(auth, destination),
          ...(auth.userId === f.auth.userId ? { [field]: 2 } : {}),
        },
        displayName: 'Sinh viên',
      }));
      const context = {
        sessionId: aTicket.sessionId,
        epoch: aTicket.epoch,
        callGeneration: a.ack.data.result.callGeneration,
      };
      expect(
        await f.registry.withContext(
          bSocket.socketId,
          { ...context, callGeneration: joinedB.ack.data.result.callGeneration },
          (resolved, _r, policy) => {
            expect(resolved.ok).toBe(true);
            return canReceiveMedia(policy!, a.ack.data.result.participantId, 'CAMERA');
          },
        ),
      ).toBe(true);
      expect(
        await f.registry.withContext(aSocket.socketId, context, (result) => result),
      ).toMatchObject({ ok: true });
      const retry = await f.registry.join(aSocket, aCommand);
      expect(retry.ack.data.result.participantId).toBe(a.ack.data.result.participantId);
      expect(retry.ack.data.result.callGeneration).toBe(a.ack.data.result.callGeneration);
      expect(f.repository.join).toHaveBeenCalledTimes(2);
    },
  );

  it('rejects revoke/regrant gaps even when current membership and read permission look valid', async () => {
    const f = setup();
    const ticket = await f.issue();
    const socket = f.binding();
    const command = { ticket: ticket.ticket, requestId: randomUUID() };
    const joined = await f.registry.join(socket, command);
    f.isAuthorityCurrent.mockImplementation(
      (_authority, _held, committed) => committed === undefined,
    );
    const context = {
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data.result.callGeneration,
    };
    expect(
      await f.registry.withContext(socket.socketId, context, (result) => result),
    ).toMatchObject({ ok: false });
    f.isAuthorityCurrent.mockReturnValue(true);
    expect(
      await f.registry.withContext(socket.socketId, context, (result) => result),
    ).toMatchObject({ ok: false });
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('retries a committed join after a temporary peer-provider failure without writing metadata twice', async () => {
    const f = setup();
    const b = f.principal();
    const aTicket = await f.issue();
    await f.registry.join(f.binding(), { ticket: aTicket.ticket, requestId: randomUUID() });
    const ticket = await f.issue(b);
    const socket = f.binding(b);
    const command = { ticket: ticket.ticket, requestId: randomUUID() };
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      if (auth.userId === f.auth.userId) throw new Error('Temporary DB failure');
      return original(auth, destination);
    });
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(f.registry.stats().ownerships).toBe(2);
    f.resolveAuthority.mockImplementation(original);
    const retry = await f.registry.join(socket, command);
    expect(projection(retry).participants).toHaveLength(2);
    expect(f.repository.join).toHaveBeenCalledTimes(2);
    const again = await f.registry.join(socket, command);
    expect(again.ack.data.result.callGeneration).toBe(retry.ack.data.result.callGeneration);
  });

  it('still refuses a committed join retry after real revocation during the provider outage', async () => {
    const f = setup();
    const b = f.principal();
    const aTicket = await f.issue();
    await f.registry.join(f.binding(), { ticket: aTicket.ticket, requestId: randomUUID() });
    const ticket = await f.issue(b);
    const socket = f.binding(b);
    const command = { ticket: ticket.ticket, requestId: randomUUID() };
    const original = f.resolveAuthority.getMockImplementation()!;
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      if (auth.userId === f.auth.userId) throw new Error('Temporary');
      return original(auth, destination);
    });
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    f.resolveAuthority.mockImplementation(original);
    f.isAuthorityCurrent.mockImplementation((current) => current.auth.userId !== b.userId);
    await expect(f.registry.join(socket, command)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.repository.join).toHaveBeenCalledTimes(2);
  });
  it('denies a connected revoked publisher and removes it from another member snapshot', async () => {
    const f = setup();
    const b = f.principal();
    const bSocket = f.binding(b);
    const aTicket = await f.issue();
    const bTicket = await f.issue(b);
    const a = await f.registry.join(f.binding(), {
      ticket: aTicket.ticket,
      requestId: randomUUID(),
    });
    const bCommand = { ticket: bTicket.ticket, requestId: randomUUID() };
    const joinedB = await f.registry.join(bSocket, bCommand);
    f.resolveAuthority.mockImplementation(async (auth, destination) => ({
      auth,
      access: {
        ...f.access(auth, destination),
        canReadContent: auth.userId !== f.auth.userId,
      },
      displayName: 'Sinh viên',
    }));
    const canReceive = await f.registry.withContext(
      bSocket.socketId,
      {
        sessionId: bTicket.sessionId,
        epoch: bTicket.epoch,
        callGeneration: joinedB.ack.data.result.callGeneration,
      },
      (resolved, _router, policy) => {
        expect(resolved.ok).toBe(true);
        expect(canReceiveMedia(policy!, joinedB.ack.data.result.participantId, 'CAMERA')).toBe(
          true,
        );
        return canReceiveMedia(policy!, a.ack.data.result.participantId, 'CAMERA');
      },
    );
    expect(canReceive).toBe(false);
    const retry = await f.registry.join(bSocket, bCommand);
    expect(projection(retry).policyRevision).toBeGreaterThan(projection(joinedB).policyRevision);
    expect(projection(retry).participants.map((p) => p.participantId)).not.toContain(
      a.ack.data.result.participantId,
    );
    expect(f.registry.stats().ownerships).toBe(2);
    expect(f.repository.join).toHaveBeenCalledTimes(2);
  });

  it('rechecks synchronous peer deny fences after later participant awaits', async () => {
    const f = setup();
    const b = f.principal();
    const bSocket = f.binding(b);
    const aTicket = await f.issue();
    const bTicket = await f.issue(b);
    const a = await f.registry.join(f.binding(), {
      ticket: aTicket.ticket,
      requestId: randomUUID(),
    });
    const joinedB = await f.registry.join(bSocket, {
      ticket: bTicket.ticket,
      requestId: randomUUID(),
    });
    const revoked = new Set<string>();
    f.isAuthorityCurrent.mockImplementation((current, held) => {
      held.assertHeld({ workspaceId: f.target.workspaceId });
      return !revoked.has(current.auth.userId);
    });
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      if (auth.userId === b.userId) revoked.add(f.auth.userId);
      return { auth, access: f.access(auth, destination), displayName: 'Sinh viên' };
    });
    expect(
      await f.registry.withContext(
        bSocket.socketId,
        {
          sessionId: bTicket.sessionId,
          epoch: bTicket.epoch,
          callGeneration: joinedB.ack.data.result.callGeneration,
        },
        (resolved, _router, policy) => {
          expect(resolved.ok).toBe(true);
          return canReceiveMedia(policy!, a.ack.data.result.participantId, 'CAMERA');
        },
      ),
    ).toBe(false);
  });

  it('rejects ticket replay that expires during authority lookup instead of returning an expired token', async () => {
    const f = setup();
    const requestId = randomUUID();
    const ticket = await f.issue(f.auth, f.target, requestId);
    f.advance(59_999);
    f.resolveAuthority.mockImplementation(async (auth, destination) => {
      f.advance(2);
      return { auth, access: f.access(auth, destination), displayName: 'Sinh viên' };
    });
    await expect(f.issue(f.auth, f.target, requestId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(f.registry.stats().intents).toBe(0);
    await expect(
      f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const fresh = await f.issue();
    await expect(
      f.registry.join(f.binding(), { ticket: fresh.ticket, requestId: randomUUID() }),
    ).resolves.toHaveProperty('ack.data.result');
  });
  it('rejects admission over four operations for one user before creating side effects', async () => {
    const f = setup();
    const pending = deferred<MediaTypes.Router>();
    f.createRouter.mockReturnValueOnce(pending.promise);
    const first = f.issue();
    await vi.waitFor(() => expect(f.createRouter).toHaveBeenCalledOnce());
    const waiting = [f.issue(), f.issue(), f.issue()];
    await expect(f.issue()).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    pending.resolve({ closed: false, close: vi.fn() } as unknown as MediaTypes.Router);
    await Promise.all([first, ...waiting]);
    expect(f.repository.create).toHaveBeenCalledOnce();
    expect(f.registry.stats().queued).toBe(0);
  });

  it('reserves a process room slot across the Router await', async () => {
    const f = setup({ maxRooms: 1 });
    const pending = deferred<MediaTypes.Router>();
    f.createRouter.mockReturnValueOnce(pending.promise);
    const first = f.issue();
    await vi.waitFor(() => expect(f.createRouter).toHaveBeenCalledOnce());
    await expect(
      f.issue(f.principal(), { workspaceId: id(), channelId: id() }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    pending.resolve({ closed: false, close: vi.fn() } as unknown as MediaTypes.Router);
    await first;
    expect(f.createRouter).toHaveBeenCalledOnce();
  });

  it('reserves a global ownership slot across a DB await in another Workspace', async () => {
    const f = setup({ maxOwnerships: 1 });
    const second = f.principal();
    const a = await f.issue();
    const b = await f.issue(second, { workspaceId: id(), channelId: id() });
    const pending = deferred<{ participantId: Types.ObjectId; revision: number }>();
    f.repository.join.mockReturnValueOnce(pending.promise);
    const first = f.registry.join(f.binding(), { ticket: a.ticket, requestId: randomUUID() });
    await vi.waitFor(() => expect(f.repository.join).toHaveBeenCalledOnce());
    await expect(
      f.registry.join(f.binding(second), { ticket: b.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    pending.resolve({
      participantId: f.repository.join.mock.calls[0]![0].participantId,
      revision: 1,
    });
    await first;
    expect(f.registry.stats().ownerships).toBe(1);
  });

  it('does not grant after access is revoked while metadata is being committed', async () => {
    const f = setup();
    const ticket = await f.issue();
    const pending = deferred<{ participantId: Types.ObjectId; revision: number }>();
    f.repository.join.mockReturnValueOnce(pending.promise);
    const task = f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() });
    await vi.waitFor(() => expect(f.repository.join).toHaveBeenCalledOnce());
    f.resolveAuthority.mockRejectedValue(new MainJoinError('FORBIDDEN'));
    pending.resolve({
      participantId: f.repository.join.mock.calls[0]![0].participantId,
      revision: 1,
    });
    await expect(task).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.registry.stats().ownerships).toBe(0);
  });

  it('keeps the grant denied when a DB await crosses the operation deadline', async () => {
    const f = setup();
    const ticket = await f.issue();
    const pending = deferred<{ participantId: Types.ObjectId; revision: number }>();
    f.repository.join.mockReturnValueOnce(pending.promise);
    const task = f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() });
    await vi.waitFor(() => expect(f.repository.join).toHaveBeenCalledOnce());
    f.advance(10_000);
    pending.resolve({
      participantId: f.repository.join.mock.calls[0]![0].participantId,
      revision: 1,
    });
    await expect(task).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().ownerships).toBe(0);
  });

  it('does not treat expiry of a consumed ticket as leaving an active room', async () => {
    const f = setup();
    const ticket = await f.issue();
    await f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() });
    f.advance(60_000);
    await f.registry.sweepExpired();
    expect(f.registry.stats()).toMatchObject({ ownerships: 1, rooms: 1, intents: 0 });
    expect(f.repository.beginEnding).not.toHaveBeenCalled();
  });
  it('serializes concurrent issue into one Router/session/host and joins both users', async () => {
    const f = setup();
    const second = f.principal();
    const [one, two] = await Promise.all([f.issue(), f.issue(second)]);
    expect(two.sessionId).toBe(one.sessionId);
    expect(two.epoch).toBe(one.epoch);
    expect(f.createRouter).toHaveBeenCalledTimes(1);
    expect(f.repository.create).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([
      f.registry.join(f.binding(), { ticket: one.ticket, requestId: randomUUID() }),
      f.registry.join(f.binding(second), { ticket: two.ticket, requestId: randomUUID() }),
    ]);
    expect(sessionJoinAckSchema.safeParse(a.ack).success).toBe(true);
    expect(projection(a).viewer.role).toBe('HOST');
    expect(projection(b).viewer.role).toBe('MEMBER');
    expect(projection(b).participants).toHaveLength(2);
    expect(f.registry.stats().ownerships).toBe(2);
    expect(f.repository.join.mock.calls.map(([input]) => input.expectedRevision)).toEqual([0, 1]);
  });

  it('replays issue with one token without granting any ownership', async () => {
    const f = setup();
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      f.issue(f.auth, f.target, requestId),
      f.issue(f.auth, f.target, requestId),
    ]);
    expect(b).toEqual(a);
    expect(f.registry.stats().ownerships).toBe(0);
    expect(f.repository.join).not.toHaveBeenCalled();
    await expect(
      f.registry.issue(f.auth, { ...f.target, channelId: id() }, { requestId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('retries a consumed ticket only for the same socket/command while returning a fresh projection', async () => {
    const f = setup();
    const ticket = await f.issue();
    const binding = f.binding();
    const command = { ticket: ticket.ticket, requestId: randomUUID() };
    const first = await f.registry.join(binding, command);
    const again = await f.registry.join(binding, command);
    expect(again.ack.data?.result.callGeneration).toBe(first.ack.data?.result.callGeneration);
    expect(again.ack.data?.result.participantId).toBe(first.ack.data?.result.participantId);
    expect(f.repository.join).toHaveBeenCalledTimes(1);
    await expect(
      f.registry.join(binding, { ...command, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(f.registry.join(f.binding(), command)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('accepts only one simultaneous ticket per user as ownership, even across channels', async () => {
    const f = setup();
    const other = { workspaceId: id(), channelId: id() };
    const a = await f.issue();
    const b = await f.issue(f.auth, other);
    const results = await Promise.allSettled([
      f.registry.join(f.binding(), { ticket: a.ticket, requestId: randomUUID() }),
      f.registry.join(f.binding(), { ticket: b.ticket, requestId: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'CALL_ALREADY_ACTIVE' },
    });
    expect(f.repository.join).toHaveBeenCalledTimes(1);
  });

  it('does not consume a conflicting ticket or bypass cleanup on takeover confirmation', async () => {
    const f = setup();
    const a = await f.issue();
    const first = await f.registry.join(f.binding(), { ticket: a.ticket, requestId: randomUUID() });
    const b = await f.issue(f.auth, { ...f.target, channelId: id() });
    const command = { ticket: b.ticket, requestId: randomUUID() };
    await expect(f.registry.join(f.binding(), command)).rejects.toMatchObject({
      code: 'CALL_ALREADY_ACTIVE',
    });
    await expect(
      f.registry.join(f.binding(), {
        ...command,
        takeover: {
          confirmed: true,
          expectedCallGeneration: first.ack.data!.result.callGeneration,
        },
      }),
    ).rejects.toMatchObject({ code: 'CALL_ALREADY_ACTIVE' });
    expect(f.repository.join).toHaveBeenCalledTimes(1);
  });

  it('rejects a ticket exactly at expiry and sweeps it before admitting another intent', async () => {
    const f = setup({ maxIntents: 1 });
    const ticket = await f.issue();
    f.advance(60_000);
    await expect(
      f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(f.issue()).resolves.toHaveProperty('ticket');
    expect(f.repository.create).toHaveBeenCalledTimes(2);
    expect(f.repository.completeEnding).toHaveBeenCalledOnce();
    expect(f.routers[0]?.close).toHaveBeenCalledOnce();
  });

  it.each(['user', 'authSession'])('binds the ticket to the original %s', async (field) => {
    const f = setup();
    const ticket = await f.issue();
    const other = field === 'user' ? f.principal() : { ...f.auth, authSessionId: id() };
    await expect(
      f.registry.join(f.binding(other), { ticket: ticket.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.repository.join).not.toHaveBeenCalled();
  });

  it.each([
    { channelType: 'TEXT' },
    { canReadContent: false },
    { workspaceId: id() },
    { channelId: id() },
  ])('refuses invalid channel authority %j before creating resources', async (fields) => {
    const f = setup();
    f.resolveAuthority.mockImplementation(async (auth) => ({
      auth,
      access: { ...f.access(auth), ...fields } as ChannelAccessStamp,
      displayName: 'Tên',
    }));
    await expect(f.issue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.createRouter).not.toHaveBeenCalled();
  });

  it('rejects expired auth and revocation after the Router await, closing the uncommitted Router', async () => {
    const f = setup();
    const pending = deferred<MediaTypes.Router>();
    f.createRouter.mockReturnValueOnce(pending.promise);
    const task = f.issue();
    await vi.waitFor(() => expect(f.createRouter).toHaveBeenCalledTimes(1));
    f.resolveAuthority.mockRejectedValue(new MainJoinError('FORBIDDEN'));
    const router = { closed: false, close: vi.fn() } as unknown as MediaTypes.Router;
    pending.resolve(router);
    await expect(task).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(router.close).toHaveBeenCalledOnce();
    expect(f.repository.create).not.toHaveBeenCalled();
    f.advance(3600_000);
    await expect(f.issue()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it.each(['membershipIncarnation', 'membershipRevision', 'channelRevision'])(
    'rejects changed %s before ticket consume',
    async (field) => {
      const f = setup();
      const ticket = await f.issue();
      f.resolveAuthority.mockImplementation(async (auth) => ({
        auth,
        access: { ...f.access(auth), [field]: 2 },
        displayName: 'Tên',
      }));
      await expect(
        f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(f.repository.join).not.toHaveBeenCalled();
    },
  );

  it('does not grant when a socket disconnects or permission is revoked during DB commit', async () => {
    const f = setup();
    const ticket = await f.issue();
    const pending = deferred<{ participantId: Types.ObjectId; revision: number }>();
    f.repository.join.mockReturnValueOnce(pending.promise);
    let connected = true;
    const binding = { ...f.binding(), isConnected: () => connected };
    const task = f.registry.join(binding, { ticket: ticket.ticket, requestId: randomUUID() });
    await vi.waitFor(() => expect(f.repository.join).toHaveBeenCalledOnce());
    connected = false;
    pending.resolve({ participantId: new Types.ObjectId(), revision: 1 });
    await expect(task).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.registry.stats().ownerships).toBe(0);
  });

  it('never serializes auth stamps, tickets or Router handles into the public snapshot', async () => {
    const f = setup();
    const ticket = await f.issue();
    const joined = await f.registry.join(f.binding(), {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const serialized = JSON.stringify(joined);
    for (const secret of [
      ticket.ticket,
      f.auth.authSessionId,
      f.auth.userId,
      f.access(f.auth).membershipId,
    ])
      expect(serialized).not.toContain(secret);
    expect(projection(joined).permissions).toMatchObject({
      publishMic: true,
      publishCamera: true,
      publishScreen: true,
      freezeBoard: false,
    });
  });

  it('serves M3 context only to the current socket/generation with a fresh access check', async () => {
    const f = setup();
    const ticket = await f.issue();
    const binding = f.binding();
    const joined = await f.registry.join(binding, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const input = {
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data!.result.callGeneration,
    };
    const result = await f.registry.withContext(binding.socketId, input, (context, router) => ({
      context,
      router,
    }));
    expect(result.context.ok).toBe(true);
    expect(result.router).toBe(f.routers[0]);
    expect(await f.registry.withContext('old-socket', input, (context) => context)).toMatchObject({
      ok: false,
      errorCode: 'CONFLICT',
    });
    expect(
      await f.registry.withContext(
        binding.socketId,
        { ...input, callGeneration: input.callGeneration + 1 },
        (context) => context,
      ),
    ).toMatchObject({ ok: false, errorCode: 'CONFLICT' });
    f.resolveAuthority.mockImplementation(async (auth) => ({
      auth,
      access: { ...f.access(auth), membershipRevision: 2 },
      displayName: 'Tên',
    }));
    expect(
      await f.registry.withContext(binding.socketId, input, (context) => context),
    ).toMatchObject({ ok: true });
  });

  it('keeps uncertain create results denied instead of retrying an insert or restoring DB metadata', async () => {
    const f = setup();
    const error = new mongo.MongoServerError({ message: 'Lost commit ack' });
    error.addErrorLabel('UnknownTransactionCommitResult');
    f.repository.create.mockRejectedValueOnce(error);
    await expect(f.issue()).rejects.toThrow();
    await expect(f.issue()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.repository.create).toHaveBeenCalledOnce();
    expect(f.routers[0]?.close).toHaveBeenCalledOnce();
    expect(f.registry.stats().ownerships).toBe(0);
  });

  it('keeps a failed join room denied and does not infer success from a revision increment', async () => {
    const f = setup();
    const ticket = await f.issue();
    f.repository.join.mockRejectedValueOnce(new Error('Lost acknowledgement'));
    await expect(
      f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() }),
    ).rejects.toThrow();
    await expect(f.issue()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().ownerships).toBe(0);
    expect(f.repository.join).toHaveBeenCalledOnce();
  });

  it('closes late Routers after timeout and keeps their admission until completion', async () => {
    const f = setup({ routerTimeoutMs: 5 });
    const pending = deferred<MediaTypes.Router>();
    f.createRouter.mockReturnValueOnce(pending.promise);
    await expect(f.issue()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().pendingRouters).toBe(1);
    await expect(f.issue()).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    const router = { close: vi.fn() } as unknown as MediaTypes.Router;
    pending.resolve(router);
    await vi.waitFor(() => expect(router.close).toHaveBeenCalledOnce());
    expect(f.registry.stats().pendingRouters).toBe(0);
  });

  it('closes a Router if shutdown occurs during metadata create', async () => {
    const f = setup();
    const pending = deferred<{
      sessionId: Types.ObjectId;
      participantId: Types.ObjectId;
      revision: number;
    }>();
    f.repository.create.mockReturnValueOnce(pending.promise);
    const task = f.issue();
    await vi.waitFor(() => expect(f.repository.create).toHaveBeenCalledOnce());
    f.registry.close();
    pending.resolve({
      sessionId: new Types.ObjectId(),
      participantId: new Types.ObjectId(),
      revision: 0,
    });
    await expect(task).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.routers[0]?.close).toHaveBeenCalled();
    expect(f.registry.stats().rooms).toBe(0);
  });

  it('enforces intent/session/ownership limits before adding more durable effects', async () => {
    const f = setup({ maxRooms: 1, perUserIntents: 1, maxOwnerships: 1 });
    const ticket = await f.issue();
    await expect(f.issue()).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    await expect(
      f.issue(f.principal(), { workspaceId: id(), channelId: id() }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    await f.registry.join(f.binding(), { ticket: ticket.ticket, requestId: randomUUID() });
    const other = f.principal();
    const otherTicket = await f.issue(other);
    await expect(
      f.registry.join(f.binding(other), { ticket: otherTicket.ticket, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    expect(f.repository.join).toHaveBeenCalledOnce();
  });
});
