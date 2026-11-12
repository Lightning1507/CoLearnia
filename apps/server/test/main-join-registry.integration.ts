import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { createWorker } from 'mediasoup';
import type { types as MediaTypes } from 'mediasoup';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  SessionCleanupRequest,
  SessionCleanupResult,
} from '@colearnia/contracts';
import { mediaTransportCreateAckSchema } from '@colearnia/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { mediaCodecs } from '../src/live/media/runtime.js';
import { createMainJoinRegistry } from '../src/live/session-manager/main-join-registry.js';
import { canReceiveMedia } from '../src/live/policy/session-policy.js';
import { createSessionRepository } from '../src/live/session-manager/session-repository.js';
import {
  sessionModels,
  sessionCollectionValidators,
} from '../src/live/session-manager/session-models.js';
import { testReplicaUri } from './replica-uri.js';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTransportSignaling } from '../src/live/media/transport-signaling.js';
import { startLiveRuntime } from '../src/live/media/live-runtime.js';
import { loadConfig } from '../src/config/env.js';

const databaseName = `colearnia_test_scrum82_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const repository = createSessionRepository(database);
const models = sessionModels(database.connection);
const registries: ReturnType<typeof createMainJoinRegistry>[] = [];
let worker: MediaTypes.Worker;
let ownsDatabase = false;
const id = () => new Types.ObjectId().toHexString();

function cleanupResult(value: SessionCleanupRequest): SessionCleanupResult {
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

async function endCleanup(value: SessionCleanupRequest): Promise<SessionCleanupResult> {
  return cleanupResult(value);
}

beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  const db = database.connection.db!;
  expect((await db.admin().command({ hello: 1 })).setName).toBe('rs0');
  ownsDatabase = true;
  await models.LiveSession.init();
  await models.SessionParticipant.init();
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await models.LiveSession.createCollection({
    validator: sessionCollectionValidators.liveSessions,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await models.SessionParticipant.createCollection({
    validator: sessionCollectionValidators.sessionParticipants,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await models.LiveSession.createIndexes();
  await models.SessionParticipant.createIndexes();
  worker = await createWorker({ logLevel: 'error' });
});
afterAll(async () => {
  for (const registry of registries) registry.close();
  worker?.close();
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum82_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

function setup(
  customRepository = repository,
  revocationCleanup?: Parameters<typeof createMainJoinRegistry>[0]['revocationCleanup'],
  endCleanup?: Parameters<typeof createMainJoinRegistry>[0]['endCleanup'],
  reconnectCleanup?: Parameters<typeof createMainJoinRegistry>[0]['reconnectCleanup'],
  routerFactory?: () => Promise<MediaTypes.Router>,
) {
  let time = Date.now();
  const coordinator = createOperationCoordinator();
  const target = { workspaceId: id(), channelId: id() };
  const auth = (): AuthenticatedContext => ({
    userId: id(),
    authSessionId: id(),
    expiresAt: new Date(time + 3600_000).toISOString(),
  });
  const routers: MediaTypes.Router[] = [];
  const revoked = new Set<string>();
  const registry = createMainJoinRegistry({
    coordinator,
    ...(revocationCleanup ? { revocationCleanup } : {}),
    ...(endCleanup ? { endCleanup } : {}),
    ...(reconnectCleanup ? { reconnectCleanup } : {}),
    repository: customRepository,
    now: () => time,
    // M1 authority is a fixture; DB session writes and native Routers are real.
    resolveAuthority: async (identity, destination, held) => {
      held.assertHeld({ workspaceId: destination.workspaceId });
      const access: ChannelAccessStamp = {
        ...destination,
        channelType: 'LIVE',
        membershipId: identity.userId,
        membershipIncarnation: 1,
        membershipRevision: 0,
        channelRevision: 0,
        canReadContent: !revoked.has(identity.userId),
        canManageChannel: false,
      };
      return { auth: identity, access, displayName: 'Sinh viên' };
    },
    isAuthorityCurrent: (current, held) => {
      held.assertHeld({ workspaceId: current.access.workspaceId });
      return !revoked.has(current.auth.userId);
    },
    createRouter: async () => {
      const router = await (routerFactory?.() ?? worker.createRouter({ mediaCodecs }));
      routers.push(router);
      return router;
    },
  });
  registries.push(registry);
  const binding = (identity: AuthenticatedContext) => ({
    auth: identity,
    socketId: randomUUID(),
    isConnected: () => true,
  });
  return {
    registry,
    revoked,
    target,
    auth,
    routers,
    binding,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('MAIN registry with real MongoDB and mediasoup Router', () => {
  it('closes a native transport before resuming without rewriting participant metadata', async () => {
    const media = vi.fn((request: SessionCleanupRequest) => {
      transport.close();
      return cleanupResult(request);
    });
    const f = setup(repository, undefined, undefined, {
      media: { revoke: media },
      messaging: endCleanup,
      board: endCleanup,
    });
    const user = f.auth();
    const old = f.binding(user);
    const ticket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    const joined = await f.registry.join(old, { ticket: ticket.ticket, requestId: randomUUID() });
    const transport = await f.routers[0]!.createWebRtcTransport({
      listenInfos: [{ protocol: 'udp', ip: '127.0.0.1' }],
    });
    const before = await models.LiveSession.findById(ticket.sessionId).lean().orFail();
    const next = f.binding(user);
    const input = {
      requestId: randomUUID(),
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data.result.callGeneration,
      resumeTicket: joined.ack.data.result.resumeTicket,
    };
    await f.registry.disconnect(old.socketId);
    expect(transport.closed).toBe(true);
    const resumed = await f.registry.resume(next, input);
    const replay = await f.registry.resume(next, input);
    expect(resumed.ack.data.result.participantId).toBe(joined.ack.data.result.participantId);
    expect(replay.ack.data.result.callGeneration).toBe(resumed.ack.data.result.callGeneration);
    expect((await models.LiveSession.findById(ticket.sessionId).lean().orFail()).revision).toBe(
      before.revision,
    );
    expect(await models.SessionParticipant.countDocuments({ sessionId: ticket.sessionId })).toBe(1);
    expect(await f.registry.withContext(old.socketId, input, (result) => result.ok)).toBe(false);
    const resync = await f.registry.resync(next, {
      requestId: randomUUID(),
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: resumed.ack.data.result.callGeneration,
      payload: {},
    });
    expect(resync.parts[0]!.callGeneration).toBe(resumed.ack.data.result.callGeneration);
  });

  it('keeps a revoked user denied during reconnect with real metadata', async () => {
    const f = setup(repository, undefined, undefined, {
      media: { revoke: cleanupResult },
      messaging: endCleanup,
      board: endCleanup,
    });
    const user = f.auth();
    const socket = f.binding(user);
    const ticket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    await f.registry.disconnect(socket.socketId);
    f.revoked.add(user.userId);
    const command = {
      requestId: randomUUID(),
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data.result.callGeneration,
      resumeTicket: joined.ack.data.result.resumeTicket,
    };
    await expect(f.registry.resume(f.binding(user), command)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    f.revoked.delete(user.userId);
    await expect(f.registry.resume(f.binding(user), command)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('ends affected durable sessions after a real mediasoup worker process dies', async () => {
    const ownedWorker = await createWorker({ logLevel: 'error' });
    const report = vi.fn();
    let accepting = true;
    let fixture: ReturnType<typeof setup> | undefined;
    const runtime = await startLiveRuntime(
      loadConfig({
        NODE_ENV: 'test',
        MEDIA_PORT: String(45000 + Math.floor(Math.random() * 15000)),
        MEDIA_LISTEN_IP: '127.0.0.1',
        MEDIA_ANNOUNCED_ADDRESS: '127.0.0.1',
      }),
      {
        createWorker: async () => ownedWorker,
        closeAdmission: () => {
          accepting = false;
        },
        report,
        mountRegistry(media) {
          fixture = setup(
            repository,
            undefined,
            { media: endCleanup, messaging: endCleanup, board: endCleanup },
            undefined,
            media.createSessionRouter,
          );
          return fixture.registry;
        },
      },
    );
    const f = fixture!;
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), () => ({
      name: 'CoLearnia',
      database: 'connected',
      media: runtime.isReady() ? 'connected' : 'disconnected',
      ready: accepting && runtime.isReady(),
    }));
    const user = f.auth();
    const ticket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    await f.registry.join(f.binding(user), { ticket: ticket.ticket, requestId: randomUUID() });
    try {
      expect(runtime.isReady()).toBe(true);
      expect((await request(app).get('/health/ready')).status).toBe(200);
      // This PID belongs only to the worker created in this test.
      process.kill(ownedWorker.pid, 'SIGKILL');
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith('SETTLED'), { timeout: 15000 });
      expect(runtime.isReady()).toBe(false);
      expect(accepting).toBe(false);
      expect((await request(app).get('/health/ready')).status).toBe(503);
      expect((await request(app).get('/health/live')).status).toBe(200);
      expect(f.routers[0]!.closed).toBe(true);
      expect(await models.LiveSession.findById(ticket.sessionId).lean()).toMatchObject({
        status: 'ENDED',
        hostUserId: null,
        revision: 3,
      });
      expect(
        (
          await models.SessionParticipant.findOne({
            sessionId: new Types.ObjectId(ticket.sessionId),
          }).lean()
        )?.leftAt,
      ).toBeInstanceOf(Date);
      expect(f.registry.stats().ownerships).toBe(0);
      await expect(runtime.createSessionRouter()).rejects.toThrow();
      const lateListener = vi.fn();
      runtime.onFailure(lateListener);
      expect(lateListener).toHaveBeenCalledWith(
        expect.objectContaining({ routerIds: [f.routers[0]!.id] }),
      );
    } finally {
      runtime.close();
    }
  });
  it('keeps a committed end with a lost acknowledgement pending without repeating writes', async () => {
    let completes = 0;
    const f = setup(
      {
        ...repository,
        completeEnding: async (...args) => {
          completes++;
          await repository.completeEnding(...args);
          const error = new mongo.MongoServerError({
            message: 'Injected lost end acknowledgement',
          });
          error.addErrorLabel('UnknownTransactionCommitResult');
          throw error;
        },
      },
      undefined,
      { media: endCleanup, messaging: endCleanup, board: endCleanup },
    );
    const user = f.auth();
    const socket = f.binding(user);
    const ticket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    const command = {
      requestId: randomUUID(),
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data.result.callGeneration,
      expectedPolicyRevision: 1,
      action: 'END',
    };
    const result = await f.registry.end(socket, command);
    expect(result).toMatchObject({ data: { status: 'pending', result: { state: 'ENDING' } } });
    expect(await f.registry.end(socket, command)).toEqual(result);
    expect(completes).toBe(1);
    expect(await models.LiveSession.findById(ticket.sessionId).lean()).toMatchObject({
      status: 'ENDED',
      hostUserId: null,
      revision: 3,
    });
    expect(
      (
        await models.SessionParticipant.findOne({
          sessionId: new Types.ObjectId(ticket.sessionId),
        }).lean()
      )?.leftAt,
    ).toBeInstanceOf(Date);
    expect(f.routers[0]!.closed).toBe(true);
    await expect(
      f.registry.issue(user, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('ends real MAIN metadata and closes the Router once for concurrent host leave retries', async () => {
    const cleanup = async (value: SessionCleanupRequest): Promise<SessionCleanupResult> => {
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
    };
    let begins = 0;
    let completes = 0;
    const f = setup(
      {
        ...repository,
        beginEnding: async (...args) => {
          begins++;
          return repository.beginEnding(...args);
        },
        completeEnding: async (...args) => {
          completes++;
          return repository.completeEnding(...args);
        },
      },
      undefined,
      { media: cleanup, messaging: cleanup, board: cleanup },
    );
    const host = f.auth();
    const member = f.auth();
    const ticket = await f.registry.issue(host, f.target, { requestId: randomUUID() });
    const memberTicket = await f.registry.issue(member, f.target, { requestId: randomUUID() });
    const socket = f.binding(host);
    const joined = await f.registry.join(socket, {
      ticket: ticket.ticket,
      requestId: randomUUID(),
    });
    await f.registry.join(f.binding(member), {
      ticket: memberTicket.ticket,
      requestId: randomUUID(),
    });
    const command = {
      requestId: randomUUID(),
      sessionId: ticket.sessionId,
      epoch: ticket.epoch,
      callGeneration: joined.ack.data.result.callGeneration,
      expectedPolicyRevision: 2,
      action: 'HOST_LEAVE',
    };
    const [one, two] = await Promise.all([
      f.registry.end(socket, command),
      f.registry.end(socket, command),
    ]);
    expect(one).toEqual(two);
    expect(one).toMatchObject({ data: { status: 'completed', result: { state: 'ENDED' } } });
    expect(begins).toBe(1);
    expect(completes).toBe(1);
    expect(await models.LiveSession.findById(ticket.sessionId).lean()).toMatchObject({
      status: 'ENDED',
      revision: 4,
      hostUserId: null,
    });
    const participants = await models.SessionParticipant.find({
      sessionId: new Types.ObjectId(ticket.sessionId),
    }).lean();
    expect(participants).toHaveLength(2);
    expect(participants.every((value) => value.leftAt instanceof Date)).toBe(true);
    expect(f.routers[0]!.closed).toBe(true);
    const next = await f.registry.issue(host, f.target, { requestId: randomUUID() });
    expect(next.sessionId).not.toBe(ticket.sessionId);
    expect(await f.registry.end(socket, command)).toEqual(one);
    expect(f.routers[1]!.closed).toBe(false);
  });

  it('does not grant a reserved host identity to a new login before revocation delivery', async () => {
    const f = setup();
    const host = f.auth();
    const peer = f.auth();
    const reserved = await f.registry.issue(host, f.target, { requestId: randomUUID() });
    const peerTicket = await f.registry.issue(peer, f.target, { requestId: randomUUID() });
    await f.registry.join(f.binding(peer), { ticket: peerTicket.ticket, requestId: randomUUID() });
    // M1 has rotated/revoked the previous authSession, while M4 notification is delayed.
    const login = { ...host, authSessionId: id() };
    const fresh = await f.registry.issue(login, f.target, { requestId: randomUUID() });
    const joined = await f.registry.join(f.binding(login), {
      ticket: fresh.ticket,
      requestId: randomUUID(),
    });
    const snapshot = JSON.parse(joined.parts.map((part) => part.fragment).join(''));
    expect(snapshot.viewer.role).toBe('MEMBER');
    expect(snapshot.hostParticipantId).toBeNull();
    expect(fresh.sessionId).toBe(reserved.sessionId);
    expect(
      await models.SessionParticipant.countDocuments({
        sessionId: new Types.ObjectId(fresh.sessionId),
        userId: new Types.ObjectId(host.userId),
      }),
    ).toBe(1);
    expect(f.registry.stats().ownerships).toBe(2);
  });
  it.each([false, true])(
    'revokes real M3 transport resources with native creation delayed=%s',
    async (delayed) => {
      const confirmed = async (value: SessionCleanupRequest): Promise<SessionCleanupResult> => {
        const { reason, ...identity } = value;
        void reason;
        return {
          ...identity,
          outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending: false },
        };
      };
      const f = setup(repository, {
        media: { revoke: (value) => transportService.cleanup(value) },
        messaging: confirmed,
        board: confirmed,
      });
      const host = f.auth();
      const peer = f.auth();
      const socket = f.binding(host);
      const peerSocket = f.binding(peer);
      const ticket = await f.registry.issue(host, f.target, { requestId: randomUUID() });
      const joined = await f.registry.join(socket, {
        ticket: ticket.ticket,
        requestId: randomUUID(),
      });
      const peerTicket = await f.registry.issue(peer, f.target, { requestId: randomUUID() });
      const peerJoin = await f.registry.join(peerSocket, {
        ticket: peerTicket.ticket,
        requestId: randomUUID(),
      });
      let release!: () => void;
      let entered!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const created = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const native: MediaTypes.WebRtcTransport[] = [];
      const transportService = createTransportSignaling({
        withContext: f.registry.withContext,
        createTransport: async (router) => {
          const transport = await router.createWebRtcTransport({
            listenInfos: [{ protocol: 'udp', ip: '127.0.0.1' }],
          });
          native.push(transport);
          entered();
          if (delayed) await waiting;
          return transport;
        },
      });
      const handlers = new Map<string, (raw: unknown, ack?: (value: unknown) => void) => void>();
      transportService.attach({
        id: socket.socketId,
        on: (name, listener) => handlers.set(name, listener),
        once: () => {},
      });
      const response = new Promise<unknown>((resolve) =>
        handlers.get('media.transport.create')!(
          {
            requestId: randomUUID(),
            sessionId: ticket.sessionId,
            epoch: ticket.epoch,
            callGeneration: joined.ack.data.result.callGeneration,
            expectedPolicyRevision: 2,
            payload: { direction: 'SEND' },
          },
          resolve,
        ),
      );
      try {
        await created;
        if (!delayed)
          expect(mediaTransportCreateAckSchema.parse(await response)).toHaveProperty('data');
        const result = await f.registry.revoke({
          operationId: randomUUID(),
          kind: 'AUTH_SESSION',
          authSessionId: host.authSessionId,
          revision: 1,
        });
        expect(result).toMatchObject({
          permissionRevoked: true,
          pendingInvalidated: true,
          cleanupPending: delayed,
        });
        release();
        if (delayed)
          expect(mediaTransportCreateAckSchema.parse(await response)).toHaveProperty('error');
        await vi.waitFor(() => expect(native[0]!.closed).toBe(true));
        expect(f.routers[0]!.closed).toBe(false);
        expect(
          await f.registry.withContext(
            peerSocket.socketId,
            { ...peerTicket, callGeneration: peerJoin.ack.data.result.callGeneration },
            (result) => result.ok,
          ),
        ).toBe(true);
        expect(f.registry.stats().ownerships).toBe(1);
      } finally {
        release();
      }
    },
  );
  it('replays each ticket/requestId pair without rewriting ownership or durable metadata', async () => {
    let joinWrites = 0;
    const f = setup({
      ...repository,
      join: async (input) => {
        joinWrites++;
        return repository.join(input);
      },
    });
    const user = f.auth();
    const socket = f.binding(user);
    const firstTicket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    const firstCommand = { ticket: firstTicket.ticket, requestId: randomUUID() };
    const first = await f.registry.join(socket, firstCommand);
    const sessionId = new Types.ObjectId(firstTicket.sessionId);
    const originalSession = await models.LiveSession.findById(sessionId).lean();
    const originalParticipant = await models.SessionParticipant.findOne({ sessionId }).lean();
    const secondTicket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    const secondCommand = { ticket: secondTicket.ticket, requestId: randomUUID() };
    await f.registry.join(socket, secondCommand);

    for (const command of [firstCommand, secondCommand]) {
      const replay = await f.registry.join(socket, command);
      expect(replay.ack.requestId).toBe(command.requestId);
      expect(replay.ack.data.result.participantId).toBe(first.ack.data.result.participantId);
      expect(replay.ack.data.result.callGeneration).toBe(first.ack.data.result.callGeneration);
    }
    for (const command of [
      { ...firstCommand, requestId: secondCommand.requestId },
      { ...secondCommand, requestId: firstCommand.requestId },
    ]) {
      await expect(f.registry.join(socket, command)).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    expect(joinWrites).toBe(1);
    expect(f.registry.stats().ownerships).toBe(1);
    expect(f.routers).toHaveLength(1);
    expect(await models.LiveSession.findById(sessionId).lean()).toEqual(originalSession);
    expect(await models.SessionParticipant.find({ sessionId }).lean()).toEqual([
      originalParticipant,
    ]);
  });

  it('filters a revoked publisher from another recipient policy and join replay snapshot', async () => {
    const f = setup();
    const a = f.auth();
    const b = f.auth();
    const aTicket = await f.registry.issue(a, f.target, { requestId: randomUUID() });
    const bTicket = await f.registry.issue(b, f.target, { requestId: randomUUID() });
    const aJoin = await f.registry.join(f.binding(a), {
      ticket: aTicket.ticket,
      requestId: randomUUID(),
    });
    const bSocket = f.binding(b);
    const bCommand = { ticket: bTicket.ticket, requestId: randomUUID() };
    const bJoin = await f.registry.join(bSocket, bCommand);
    f.revoked.add(a.userId);
    const receives = await f.registry.withContext(
      bSocket.socketId,
      {
        sessionId: bTicket.sessionId,
        epoch: bTicket.epoch,
        callGeneration: bJoin.ack.data.result.callGeneration,
      },
      (resolved, _router, policy) => {
        expect(resolved.ok).toBe(true);
        return canReceiveMedia(policy!, aJoin.ack.data.result.participantId, 'CAMERA');
      },
    );
    expect(receives).toBe(false);
    const snapshot = await f.registry.join(bSocket, bCommand);
    const projection = JSON.parse(snapshot.parts.map((part) => part.fragment).join(''));
    expect(
      projection.participants.map(
        (participant: { participantId: string }) => participant.participantId,
      ),
    ).not.toContain(aJoin.ack.data.result.participantId);
    expect(
      await models.SessionParticipant.countDocuments({
        sessionId: new Types.ObjectId(bTicket.sessionId),
      }),
    ).toBe(2);
  });
  it('creates one durable session/host/Router under concurrent issuance and commits two MAIN participants', async () => {
    const f = setup();
    const a = f.auth();
    const b = f.auth();
    const [one, two] = await Promise.all([
      f.registry.issue(a, f.target, { requestId: randomUUID() }),
      f.registry.issue(b, f.target, { requestId: randomUUID() }),
    ]);
    expect(one.sessionId).toBe(two.sessionId);
    expect(f.routers).toHaveLength(1);
    expect(f.registry.stats().ownerships).toBe(0);
    const socket = f.binding(a);
    const command = { requestId: randomUUID(), ticket: one.ticket };
    const [joinedA, joinedB] = await Promise.all([
      f.registry.join(socket, command),
      f.registry.join(f.binding(b), { requestId: randomUUID(), ticket: two.ticket }),
    ]);
    const sessionId = new Types.ObjectId(one.sessionId);
    expect(
      await models.LiveSession.countDocuments({
        channelId: new Types.ObjectId(f.target.channelId),
      }),
    ).toBe(1);
    expect(await models.LiveSession.findById(sessionId).lean()).toMatchObject({
      hostUserId: new Types.ObjectId(a.userId),
      revision: 2,
    });
    expect(await models.SessionParticipant.countDocuments({ sessionId, leftAt: null })).toBe(2);
    expect(await models.SessionParticipant.find({ sessionId }).distinct('lastScope.kind')).toEqual([
      'MAIN',
    ]);
    const again = await f.registry.join(socket, command);
    expect(again.ack.data.result.callGeneration).toBe(joinedA.ack.data.result.callGeneration);
    expect(await models.SessionParticipant.countDocuments({ sessionId })).toBe(2);
    expect(joinedB.ack.data.result.callGeneration).not.toBe(joinedA.ack.data.result.callGeneration);
    const transport = await f.registry.withContext(
      socket.socketId,
      {
        sessionId: one.sessionId,
        epoch: one.epoch,
        callGeneration: joinedA.ack.data.result.callGeneration,
      },
      (resolved, router) => {
        expect(resolved.ok).toBe(true);
        expect(router).toBe(f.routers[0]);
        return router?.rtpCapabilities.codecs?.map((codec) => codec.mimeType);
      },
    );
    expect(transport).toContain('audio/opus');
    expect(transport).toContain('video/VP8');
  });

  it('never adopts an ACTIVE DB session into another runtime registry and closes the losing Router', async () => {
    const first = setup();
    const second = setup();
    const user = first.auth();
    await first.registry.issue(user, first.target, { requestId: randomUUID() });
    await expect(
      second.registry.issue(user, first.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(second.routers).toHaveLength(1);
    expect(second.routers[0]?.closed).toBe(true);
    expect(second.registry.stats().ownerships).toBe(0);
    expect(
      await models.LiveSession.countDocuments({
        channelId: new Types.ObjectId(first.target.channelId),
      }),
    ).toBe(1);
  });

  it('keeps a truly committed create with a simulated lost acknowledgement denied', async () => {
    const error = new mongo.MongoServerError({ message: 'Injected lost acknowledgement' });
    error.addErrorLabel('UnknownTransactionCommitResult');
    const f = setup({
      ...repository,
      create: async (input) => {
        await repository.create(input);
        throw error;
      },
    });
    const user = f.auth();
    await expect(
      f.registry.issue(user, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    await expect(
      f.registry.issue(user, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(f.registry.stats().ownerships).toBe(0);
    expect(
      await models.LiveSession.countDocuments({
        channelId: new Types.ObjectId(f.target.channelId),
      }),
    ).toBe(1);
    expect(f.routers).toHaveLength(1);
    expect(f.routers[0]?.closed).toBe(true);
  });

  it('ends an unconsumed expired room and its metadata before admitting a new session', async () => {
    const f = setup();
    const user = f.auth();
    const ticket = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    f.advance(60_000);
    await f.registry.sweepExpired();
    expect(await models.LiveSession.findById(ticket.sessionId).lean()).toMatchObject({
      status: 'ENDED',
      hostUserId: null,
    });
    expect(
      (
        await models.SessionParticipant.findOne({
          sessionId: new Types.ObjectId(ticket.sessionId),
        }).lean()
      )?.leftAt,
    ).toBeInstanceOf(Date);
    expect(f.routers[0]?.closed).toBe(true);
    expect(f.registry.stats().rooms).toBe(0);
    const next = await f.registry.issue(user, f.target, { requestId: randomUUID() });
    expect(next.sessionId).not.toBe(ticket.sessionId);
  });
});
