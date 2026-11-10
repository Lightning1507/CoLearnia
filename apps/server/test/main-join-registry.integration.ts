import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { createWorker } from 'mediasoup';
import type { types as MediaTypes } from 'mediasoup';
import type { AuthenticatedContext, ChannelAccessStamp } from '@colearnia/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { mediaCodecs } from '../src/live/media/runtime.js';
import { createMainJoinRegistry } from '../src/live/session-manager/main-join-registry.js';
import { createSessionRepository } from '../src/live/session-manager/session-repository.js';
import {
  sessionModels,
  sessionCollectionValidators,
} from '../src/live/session-manager/session-models.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum82_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const repository = createSessionRepository(database);
const models = sessionModels(database.connection);
const registries: ReturnType<typeof createMainJoinRegistry>[] = [];
let worker: MediaTypes.Worker;
let ownsDatabase = false;
const id = () => new Types.ObjectId().toHexString();

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

function setup(customRepository = repository) {
  let time = Date.now();
  const coordinator = createOperationCoordinator();
  const target = { workspaceId: id(), channelId: id() };
  const auth = (): AuthenticatedContext => ({
    userId: id(),
    authSessionId: id(),
    expiresAt: new Date(time + 3600_000).toISOString(),
  });
  const routers: MediaTypes.Router[] = [];
  const registry = createMainJoinRegistry({
    coordinator,
    repository: customRepository,
    now: () => time,
    // M1 authority is a fixture; DB session writes and native Routers are real.
    resolveAuthority: async (identity, destination, held) => {
      held.assertHeld({ userId: identity.userId, workspaceId: destination.workspaceId });
      const access: ChannelAccessStamp = {
        ...destination,
        channelType: 'LIVE',
        membershipId: identity.userId,
        membershipIncarnation: 1,
        membershipRevision: 0,
        channelRevision: 0,
        canReadContent: true,
        canManageChannel: false,
      };
      return { auth: identity, access, displayName: 'Sinh viên' };
    },
    createRouter: async () => {
      const router = await worker.createRouter({ mediaCodecs });
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
