import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  SessionMetadataTarget,
} from '@colearnia/contracts';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import type { CoordinationContext } from '../src/lib/operation-coordinator.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import {
  createColdSessionArtifactGuard,
  createSessionBootstrap,
} from '../src/live/session-manager/session-bootstrap.js';
import type { PrepareStaleSession } from '../src/live/session-manager/session-bootstrap.js';
import { createSessionMetadataQuery } from '../src/live/session-manager/session-metadata-query.js';
import { createSessionRepository } from '../src/live/session-manager/session-repository.js';
import {
  sessionModels,
  sessionCollectionValidators,
} from '../src/live/session-manager/session-models.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum80_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const models = sessionModels(database.connection);
const repository = createSessionRepository(database);
const id = () => new Types.ObjectId();
let ownsDatabase = false;
const confirmed: PrepareStaleSession = async (session) => ({
  sessionId: session.sessionId,
  epoch: session.epoch,
  permissionRevoked: true,
  pendingInvalidated: true,
  cleanupPending: true,
});

async function seed(
  status: 'ACTIVE' | 'ENDING' | 'ENDED' = 'ACTIVE',
  target = { workspaceId: id(), channelId: id() },
  at = new Date(),
) {
  const input = {
    sessionId: id(),
    participantId: id(),
    ...target,
    epoch: randomUUID(),
    hostUserId: id(),
    at,
  };
  await repository.create(input);
  if (status !== 'ACTIVE')
    await repository.beginEnding({
      sessionId: input.sessionId,
      epoch: input.epoch,
      expectedRevision: 0,
      at,
    });
  if (status === 'ENDED')
    await repository.completeEnding({
      sessionId: input.sessionId,
      epoch: input.epoch,
      expectedRevision: 1,
      at,
    });
  return input;
}
function bootstrap(options: Partial<Parameters<typeof createSessionBootstrap>[1]> = {}) {
  return createSessionBootstrap(database, {
    isOffline: () => true,
    prepareStaleSession: confirmed,
    ...options,
  });
}
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  const db = database.connection.db!;
  expect((await db.admin().command({ hello: 1 })).setName).toBe('rs0');
  ownsDatabase = true;
  for (const model of [models.LiveSession, models.SessionParticipant]) await model.init();
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
});
afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum80_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('SCRUM-80 cold session bootstrap', () => {
  it.each(['transient error', 'success'] as const)(
    'does not retry a write or commit when beginEnding CAS returns %s after the deadline',
    async (outcome) => {
      const input = await seed('ACTIVE');
      let release!: () => void;
      let entered!: () => void;
      let settled!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const firstWriteDone = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const transactionSettled = new Promise<void>((resolve) => {
        settled = resolve;
      });
      const originalUpdate = models.LiveSession.updateOne.bind(models.LiveSession);
      const update = vi.spyOn(models.LiveSession, 'updateOne').mockImplementationOnce((...args) => {
        const delayed = originalUpdate(...args)
          .exec()
          .then(async (result) => {
            entered();
            await waiting;
            if (outcome === 'transient error') {
              const error = new mongo.MongoServerError({ message: 'Injected late CAS response' });
              error.addErrorLabel('TransientTransactionError');
              throw error;
            }
            return result;
          });
        return delayed as unknown as ReturnType<typeof models.LiveSession.updateOne>;
      });
      const commits = vi.fn();
      const transaction = database.transaction.bind(database);
      const transactionSpy = vi
        .spyOn(database, 'transaction')
        .mockImplementationOnce(async (work) => {
          let restoreCommit: (() => void) | undefined;
          try {
            return await transaction(async (session) => {
              if (!restoreCommit) {
                const originalCommit = session.commitTransaction.bind(session);
                const commitSpy = vi
                  .spyOn(session, 'commitTransaction')
                  .mockImplementation(async () => {
                    commits();
                    return originalCommit();
                  });
                restoreCommit = () => commitSpy.mockRestore();
              }
              return work(session);
            });
          } finally {
            restoreCommit?.();
            settled();
          }
        });
      const boot = bootstrap({ totalTimeoutMs: 1000 });
      const rejected = expect(boot.run()).rejects.toThrow();
      try {
        await firstWriteDone;
        await rejected;
        release();
        await transactionSettled;
        expect(update).toHaveBeenCalledTimes(1);
        expect(commits).not.toHaveBeenCalled();
        expect(await models.LiveSession.findById(input.sessionId).lean()).toMatchObject({
          status: 'ACTIVE',
          revision: 0,
          hostUserId: input.hostUserId,
        });
        expect(
          (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
        ).toBeNull();
        expect(boot.stats().state).toBe('FAILED');
        const app = createApp(loadConfig({ NODE_ENV: 'test' }), () => ({
          name: 'CoLearnia',
          database: 'connected',
          media: 'disconnected',
          ready: boot.isReady(),
        }));
        expect((await request(app).get('/health/ready')).status).toBe(503);
      } finally {
        release();
        await transactionSettled;
        update.mockRestore();
        transactionSpy.mockRestore();
        await bootstrap().run();
      }
    },
  );

  it('does not send participant updates when completeEnding CAS returns after the deadline', async () => {
    const input = await seed('ENDING');
    let release!: () => void;
    let entered!: () => void;
    let settled!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstWriteDone = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const transactionSettled = new Promise<void>((resolve) => {
      settled = resolve;
    });
    const originalUpdate = models.LiveSession.updateOne.bind(models.LiveSession);
    const update = vi.spyOn(models.LiveSession, 'updateOne').mockImplementationOnce((...args) => {
      const query = originalUpdate(...args);
      const delayed = query.exec().then(async (result) => {
        entered();
        await waiting;
        return result;
      });
      return delayed as unknown as ReturnType<typeof models.LiveSession.updateOne>;
    });
    const participantWrites = vi.spyOn(models.SessionParticipant, 'updateMany');
    const transaction = database.transaction.bind(database);
    const transactionSpy = vi
      .spyOn(database, 'transaction')
      .mockImplementationOnce(async (work) => {
        try {
          return await transaction(work);
        } finally {
          settled();
        }
      });
    const boot = bootstrap({ totalTimeoutMs: 1000 });
    const task = boot.run();
    const rejected = expect(task).rejects.toThrow();
    try {
      await firstWriteDone;
      await rejected;
      expect(boot.isReady()).toBe(false);
      release();
      await transactionSettled;
      expect(participantWrites).not.toHaveBeenCalled();
      const stored = await models.LiveSession.findById(input.sessionId).lean();
      expect(stored).toMatchObject({ status: 'ENDING', revision: 1, hostUserId: input.hostUserId });
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeNull();
      expect(boot.stats().state).toBe('FAILED');
    } finally {
      release();
      update.mockRestore();
      participantWrites.mockRestore();
      transactionSpy.mockRestore();
    }
    await bootstrap().run();
  });
  it.each(['conversation', 'frame'] as const)(
    'keeps malformed date arrays in %s pending rather than accepting them as scalar dates',
    async (kind) => {
      const input = await seed();
      const db = database.connection.db!;
      const collection = db.collection(kind === 'conversation' ? 'conversations' : 'files');
      const artifactId = id();
      const field = kind === 'conversation' ? 'closedAt' : 'cleanupAfter';
      await collection.insertOne({
        _id: artifactId,
        scope: { sessionId: input.sessionId },
        ...(kind === 'conversation' ? { kind: 'GROUP' } : { purpose: 'FRAME', state: 'READY' }),
        [field]: [new Date()],
      });
      const boot = bootstrap({ prepareStaleSession: createColdSessionArtifactGuard(database) });
      await expect(boot.run()).rejects.toThrow();
      expect(boot.isReady()).toBe(false);
      expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDING');
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeNull();
      expect(Array.isArray((await collection.findOne({ _id: artifactId }))?.[field])).toBe(true);
      await collection.updateOne({ _id: artifactId }, { $set: { [field]: new Date() } });
      await bootstrap({ prepareStaleSession: createColdSessionArtifactGuard(database) }).run();
    },
  );

  it('bounds the whole multi-session cold start without assuming in-flight transactions rolled back', async () => {
    const old = [];
    for (let index = 0; index < 7; index++) old.push(await seed('ENDING'));
    const callback = vi.fn(
      async (session: Parameters<PrepareStaleSession>[0], signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return confirmed(session, signal);
      },
    );
    const boot = bootstrap({
      prepareStaleSession: callback,
      cleanupTimeoutMs: 500,
      totalTimeoutMs: 1000,
    });
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), () => ({
      name: 'CoLearnia',
      database: 'connected',
      media: 'disconnected',
      ready: boot.isReady(),
    }));
    await expect(boot.run()).rejects.toThrow();
    expect(boot.stats().state).toBe('FAILED');
    expect(callback.mock.calls.length).toBeLessThan(7);
    expect(callback.mock.calls.at(-1)?.[1].aborted).toBe(true);
    const sessionIds = old.map((value) => value.sessionId);
    const ended = await models.LiveSession.countDocuments({
      _id: { $in: sessionIds },
      status: 'ENDED',
    });
    expect(ended).toBeLessThan(7);
    // A transaction already sent before the deadline may still commit. Do not
    // assert a globally stable ENDED count while that transaction is in flight.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await request(app).get('/health/ready')).status).toBe(503);
    expect((await request(app).get('/health/live')).status).toBe(200);
    await expect(boot.run()).rejects.toThrow();
    await bootstrap().run();
  });
  it('does not start completeEnding when cleanup returns after the total deadline', async () => {
    const input = await seed('ENDING');
    let release!: () => void;
    let entered!: () => void;
    let returned!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      returned = resolve;
    });
    const boot = bootstrap({
      totalTimeoutMs: 1000,
      cleanupTimeoutMs: 5000,
      prepareStaleSession: async (session, signal) => {
        entered();
        await waiting;
        const result = await confirmed(session, signal);
        returned();
        return result;
      },
    });
    const transactions = vi.spyOn(database, 'transaction');
    const task = boot.run();
    const rejected = expect(task).rejects.toThrow();
    try {
      await started;
      await rejected;
      release();
      await finished;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(transactions).not.toHaveBeenCalled();
      expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDING');
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeNull();
      expect(boot.stats().state).toBe('FAILED');
      expect(boot.isReady()).toBe(false);
    } finally {
      release();
      transactions.mockRestore();
    }
    await bootstrap().run();
  });

  it('keeps FAILED/readiness 503 when a transaction sent before deadline commits afterwards', async () => {
    const input = await seed('ENDING');
    let release!: () => void;
    let entered!: () => void;
    let settled!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const commitStarted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const transactionSettled = new Promise<void>((resolve) => {
      settled = resolve;
    });
    const transaction = database.transaction.bind(database);
    const spy = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
      try {
        return await transaction(async (session) => {
          const commit = session.commitTransaction.bind(session);
          vi.spyOn(session, 'commitTransaction').mockImplementationOnce(async () => {
            entered();
            await waiting;
            await commit();
          });
          return work(session);
        });
      } finally {
        settled();
      }
    });
    const boot = bootstrap({ totalTimeoutMs: 1000 });
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), () => ({
      name: 'CoLearnia',
      database: 'connected',
      media: 'disconnected',
      ready: boot.isReady(),
    }));
    const task = boot.run();
    const rejected = expect(task).rejects.toThrow();
    try {
      await commitStarted;
      await rejected;
      expect(boot.isReady()).toBe(false);
      release();
      await transactionSettled;
      expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDED');
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeInstanceOf(Date);
      expect(boot.stats().state).toBe('FAILED');
      expect((await request(app).get('/health/ready')).status).toBe(503);
      await expect(boot.run()).rejects.toThrow();
    } finally {
      release();
      spy.mockRestore();
    }
    await bootstrap().run();
  });
  it('accepts a fresh database without auto creating schema or indexes', async () => {
    const name = `colearnia_test_scrum80_${randomUUID().replaceAll('-', '')}`;
    const fresh = createDatabase(testReplicaUri(name));
    try {
      await fresh.connect();
      expect(fresh.connection.name).toBe(name);
      const boot = createSessionBootstrap(fresh, {
        isOffline: () => true,
        prepareStaleSession: confirmed,
      });
      await boot.run();
      expect(boot.isReady()).toBe(true);
      expect(await fresh.connection.db!.listCollections().toArray()).toEqual([]);
    } finally {
      await fresh.close();
    }
  });

  it('ends ACTIVE/ENDING sessions in pages, clears hosts/participation and leaves ENDED unchanged', async () => {
    const active = await seed();
    const ending = await seed('ENDING');
    const ended = await seed('ENDED');
    const previous = await models.LiveSession.findById(ended.sessionId).lean();
    const callback = vi.fn(confirmed);
    const boot = bootstrap({ prepareStaleSession: callback, pageSize: 1 });
    const task = boot.run();
    expect(boot.run()).toBe(task);
    expect(boot.isReady()).toBe(false);
    await task;
    expect(boot.stats()).toMatchObject({ state: 'READY', ended: 2 });
    for (const input of [active, ending]) {
      expect(await models.LiveSession.findById(input.sessionId).lean()).toMatchObject({
        status: 'ENDED',
        hostUserId: null,
      });
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeInstanceOf(Date);
    }
    expect(await models.LiveSession.findById(ended.sessionId).lean()).toEqual(previous);
    expect(callback).toHaveBeenCalledTimes(2);
    const secondBoot = bootstrap({ prepareStaleSession: callback });
    await secondBoot.run();
    expect(secondBoot.stats().ended).toBe(0);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('keeps HTTP readiness 503 until bootstrap and cleanup finish', async () => {
    await seed();
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const boot = bootstrap({
      prepareStaleSession: async (session) => {
        await wait;
        return confirmed(session, new AbortController().signal);
      },
    });
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), () => ({
      name: 'CoLearnia',
      database: 'connected',
      media: 'connected',
      ready: boot.isReady(),
    }));
    const task = boot.run();
    expect((await request(app).get('/health/ready')).status).toBe(503);
    finish();
    await task;
    expect((await request(app).get('/health/ready')).status).toBe(200);
  });

  it('rejects online use before mutating metadata', async () => {
    const input = await seed();
    const boot = bootstrap({ isOffline: () => false });
    await expect(boot.run()).rejects.toThrow('requires reconciliation');
    expect(boot.isReady()).toBe(false);
    expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ACTIVE');
    await bootstrap().run();
  });

  it('refuses missing indexes without changing schema and recovers only after provisioning', async () => {
    const input = await seed();
    await models.LiveSession.collection.dropIndex('ix_live_channel_metadata');
    try {
      const boot = bootstrap();
      await expect(boot.run()).rejects.toThrow();
      expect(boot.isReady()).toBe(false);
      expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ACTIVE');
      expect(
        (await models.LiveSession.collection.indexes()).some(
          (index) => index.name === 'ix_live_channel_metadata',
        ),
      ).toBe(false);
    } finally {
      await models.LiveSession.createIndexes();
    }
    await bootstrap().run();
  });

  it('does not complete stale or unconfirmed cross-domain cleanup', async () => {
    const input = await seed();
    const boot = bootstrap({
      prepareStaleSession: async (session) => ({
        ...(await confirmed(session, new AbortController().signal)),
        epoch: randomUUID(),
      }),
    });
    await expect(boot.run()).rejects.toThrow();
    expect(boot.isReady()).toBe(false);
    expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDING');
    expect(
      (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
    ).toBeNull();
    await bootstrap().run();
  });

  it('times out cleanup without retrying or accepting its late result', async () => {
    const input = await seed();
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const callback = vi.fn(async (session: Parameters<PrepareStaleSession>[0]) => {
      await wait;
      return confirmed(session, new AbortController().signal);
    });
    const boot = bootstrap({ prepareStaleSession: callback, cleanupTimeoutMs: 5 });
    await expect(boot.run()).rejects.toThrow();
    finish();
    await Promise.resolve();
    await expect(boot.run()).rejects.toThrow();
    expect(callback).toHaveBeenCalledOnce();
    expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDING');
    await bootstrap().run();
  });

  it('keeps uncertain commit denied even when completeEnding really committed', async () => {
    const input = await seed('ENDING');
    const transaction = database.transaction.bind(database);
    const error = new mongo.MongoServerError({ message: 'Injected lost acknowledgement' });
    error.addErrorLabel('UnknownTransactionCommitResult');
    const spy = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
      await transaction(work);
      throw error;
    });
    try {
      const boot = bootstrap();
      await expect(boot.run()).rejects.toThrow();
      expect(boot.isReady()).toBe(false);
      expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDED');
      expect(
        (await models.SessionParticipant.findById(input.participantId).lean())?.leftAt,
      ).toBeInstanceOf(Date);
    } finally {
      spy.mockRestore();
    }
    const next = bootstrap();
    await next.run();
    expect(next.isReady()).toBe(true);
  });

  it('keeps unhandled conversation/frame resources closed to readiness without mutating M2 data', async () => {
    const input = await seed();
    const db = database.connection.db!;
    const conversation = {
      _id: id(),
      kind: 'GROUP',
      scope: { sessionId: input.sessionId },
      closedAt: null,
    };
    const frame = {
      _id: id(),
      purpose: 'FRAME',
      scope: { sessionId: input.sessionId },
      state: 'READY',
      cleanupAfter: null,
    };
    await db.collection('conversations').insertOne(conversation);
    await db.collection('files').insertOne(frame);
    const guard = createColdSessionArtifactGuard(database);
    const first = bootstrap({ prepareStaleSession: guard });
    await expect(first.run()).rejects.toThrow();
    expect(
      (await db.collection('conversations').findOne({ _id: conversation._id }))?.closedAt,
    ).toBeNull();
    expect((await db.collection('files').findOne({ _id: frame._id }))?.state).toBe('READY');
    await db
      .collection('conversations')
      .updateOne({ _id: conversation._id }, { $set: { closedAt: new Date() } });
    const second = bootstrap({ prepareStaleSession: guard });
    await expect(second.run()).rejects.toThrow();
    await db
      .collection('files')
      .updateOne({ _id: frame._id }, { $set: { cleanupAfter: new Date() } });
    await bootstrap({ prepareStaleSession: guard }).run();
    expect((await models.LiveSession.findById(input.sessionId).lean())?.status).toBe('ENDED');
  });
});

function queryFixture() {
  let time = Date.now();
  const auth: AuthenticatedContext = {
    userId: id().toHexString(),
    authSessionId: id().toHexString(),
    expiresAt: new Date(time + 3600_000).toISOString(),
  };
  const target = { workspaceId: id().toHexString(), channelId: id().toHexString() };
  const access: ChannelAccessStamp = {
    ...target,
    channelType: 'LIVE',
    membershipId: id().toHexString(),
    membershipIncarnation: 1,
    membershipRevision: 0,
    channelRevision: 0,
    canReadContent: true,
    canManageChannel: false,
  };
  const authorize = vi.fn<Parameters<typeof createSessionMetadataQuery>[1]['authorize']>(
    async (
      identity: AuthenticatedContext,
      destination: SessionMetadataTarget,
      held: CoordinationContext,
    ) => {
      held.assertHeld({ userId: identity.userId, workspaceId: destination.workspaceId });
      return { ok: true as const, auth: identity, access };
    },
  );
  let ready = true;
  const query = createSessionMetadataQuery(database, {
    coordinator: createOperationCoordinator(),
    authorize,
    isReady: () => ready,
    now: () => time,
  });
  return {
    auth,
    target,
    access,
    authorize,
    query,
    advance: (ms: number) => {
      time += ms;
    },
    unavailable: () => {
      ready = false;
    },
  };
}

describe('SCRUM-80 bounded metadata query', () => {
  it.each(['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'] as const)(
    'preserves M1 %s failures before reading metadata',
    async (errorCode) => {
      const f = queryFixture();
      f.authorize.mockResolvedValueOnce({ ok: false, errorCode });
      const spy = vi.spyOn(models.LiveSession, 'find');
      try {
        await expect(f.query(f.auth, f.target, {})).rejects.toMatchObject({ code: errorCode });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    },
  );
  it('paginates same-time sessions by startedAt/_id, stays in channel and strips private fields', async () => {
    const f = queryFixture();
    const at = new Date();
    const sameTarget = {
      workspaceId: new Types.ObjectId(f.target.workspaceId),
      channelId: new Types.ObjectId(f.target.channelId),
    };
    for (let index = 0; index < 5; index++) await seed('ENDED', sameTarget, at);
    await seed('ENDED', { ...sameTarget, channelId: id() }, at);
    const first = await f.query(f.auth, f.target, { limit: 2 });
    const second = await f.query(f.auth, f.target, { limit: 2, cursor: first.nextCursor });
    const third = await f.query(f.auth, f.target, { limit: 2, cursor: second.nextCursor });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items];
    expect(new Set(all.map((item) => item.sessionId)).size).toBe(5);
    for (const item of all)
      expect(Object.keys(item).sort()).toEqual([
        'endedAt',
        'epoch',
        'sessionId',
        'startedAt',
        'status',
      ]);
    expect(all.map((item) => item.sessionId)).toEqual(
      all
        .map((item) => item.sessionId)
        .sort()
        .reverse(),
    );
    const keys = (await models.LiveSession.collection.indexes()).find(
      (index) => index.name === 'ix_live_channel_metadata',
    )?.key;
    expect(keys).toEqual({ workspaceId: 1, channelId: 1, startedAt: -1, _id: -1 });
    await expect(
      f.query(
        f.auth,
        { ...f.target, workspaceId: id().toHexString() },
        { cursor: first.nextCursor },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it.each([
    { canReadContent: false, canManageChannel: true },
    { channelType: 'TEXT' },
    { channelId: id().toHexString() },
    { workspaceId: id().toHexString() },
  ])('rejects invalid channel authority %j before DB read', async (fields) => {
    const f = queryFixture();
    Object.assign(f.access, fields);
    const spy = vi.spyOn(models.LiveSession, 'find');
    try {
      await expect(f.query(f.auth, f.target, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('never returns fetched rows when access changes during the read', async () => {
    const f = queryFixture();
    f.authorize.mockImplementationOnce(async (identity) => ({
      ok: true,
      auth: identity,
      access: { ...f.access },
    }));
    f.authorize.mockImplementationOnce(async (identity) => ({
      ok: true,
      auth: identity,
      access: { ...f.access, membershipIncarnation: 2 },
    }));
    await expect(f.query(f.auth, f.target, {})).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.authorize).toHaveBeenCalledTimes(2);
  });

  it('checks auth expiry and readiness after awaits', async () => {
    const f = queryFixture();
    f.authorize.mockImplementationOnce(async (identity) => ({
      ok: true,
      auth: identity,
      access: f.access,
    }));
    f.authorize.mockImplementationOnce(async (identity) => {
      f.advance(3600_000);
      return { ok: true, auth: identity, access: f.access };
    });
    await expect(f.query(f.auth, f.target, {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    const g = queryFixture();
    g.unavailable();
    await expect(g.query(g.auth, g.target, {})).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(g.authorize).not.toHaveBeenCalled();
  });
});
