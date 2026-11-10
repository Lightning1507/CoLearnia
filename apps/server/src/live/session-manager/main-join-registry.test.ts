import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import type { types as MediaTypes } from 'mediasoup';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  SessionProjection,
} from '@colearnia/contracts';
import { sessionJoinAckSchema } from '@colearnia/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationCoordinator } from '../../lib/operation-coordinator.js';
import { createMainJoinRegistry, MainJoinError } from './main-join-registry.js';
import { canReceiveMedia } from '../policy/session-policy.js';

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
function setup(limits: Parameters<typeof createMainJoinRegistry>[0]['limits'] = {}) {
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

describe('SCRUM-82 MAIN join registry', () => {
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
    ).toMatchObject({ ok: false, errorCode: 'CONFLICT' });
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
