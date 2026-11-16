import { AsyncResource } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { channelResponseSchema } from '@colearnia/contracts';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { authModels } from '../src/auth/models.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { csrfCookie } from '../src/auth/csrf.js';
import { createProfiledDatabase } from './scrum42-db-profile.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import {
  conversationModel,
  createChannelConversationFactory,
} from '../src/messaging/conversation.js';
import { channelModels, channelCollectionValidators } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { auditModel } from '../src/workspaces/workspace-audit.js';
import {
  createWorkspaceCreator,
  preflightWorkspaceCreation,
} from '../src/workspaces/create-workspace.js';
import { createChannelCreator } from '../src/workspaces/create-channel.js';
import { createWorkspaceRouter } from '../src/workspaces/workspace-routes.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum35_${randomUUID().replaceAll('-', '')}`;
const database = createProfiledDatabase(testReplicaUri(databaseName));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const Conversation = conversationModel(database.connection);
const Audit = auditModel(database.connection);
const coordinator = createOperationCoordinator();
const revocations = createAccessRevocationCoordinator({ coordinator });
const factory = createChannelConversationFactory(database.connection);
const options = {
  database,
  coordinator,
  barrier: revocations.barrier,
  indexesReady: () => true,
  createConversation: factory.create,
};
const createWorkspace = createWorkspaceCreator(options);
const create = createChannelCreator(options);
let ownsDatabase = false;
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  ownsDatabase = true;
  for (const model of [
    User,
    AuthSession,
    Workspace,
    Membership,
    Channel,
    ChannelAccessGrant,
    Conversation,
    Audit,
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
  await database.connection.db!.command({
    collMod: 'channels',
    validator: channelCollectionValidators.channels,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  expect(await preflightWorkspaceCreation(database)).toBe(true);
});
afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === databaseName)
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});
async function actor() {
  const user = await User.create({
    emailNormalized: `${randomUUID()}@example.test`,
    displayName: 'Channel test',
    passwordHash: 'test-only-unusable-hash',
  });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 120_000);
  const session = await AuthSession.create({
    userId: user._id,
    tokenHash: hashAuthToken(token),
    expiresAt,
  });
  return {
    user,
    session,
    token,
    identity: { userId: user.id, authSessionId: session.id, expiresAt: expiresAt.toISOString() },
  };
}
async function fixture() {
  const owner = await actor();
  const workspace = await createWorkspace(
    { name: 'Workspace', requestId: randomUUID() },
    owner.identity,
  );
  return {
    ...owner,
    workspace,
    input: {
      name: '  Thảo luận 🍀  ',
      type: 'TEXT' as const,
      accessMode: 'WORKSPACE' as const,
      requestId: randomUUID(),
    },
  };
}
const denied = (code: string) => expect.objectContaining({ name: 'ChannelCreationError', code });
async function graph(workspaceId: string) {
  return [
    await Channel.countDocuments({ workspaceId }),
    await Conversation.countDocuments({ workspaceId }),
    await Audit.countDocuments({ workspaceId, action: 'CHANNEL_CREATE' }),
  ];
}

it.each(['TEXT', 'LIVE'] as const)(
  'creates %s with both access modes using the real M2 transaction',
  async (type) => {
    for (const accessMode of ['WORKSPACE', 'PRIVATE'] as const) {
      const f = await fixture();
      const provider = vi.fn(async (input: Parameters<typeof factory.create>[0]) => {
        expect(input.dbSession.inTransaction()).toBe(true);
        expect(await Channel.findById(input.channelId).session(input.dbSession)).not.toBeNull();
        // Uncommitted M1 write is invisible outside the caller's session.
        expect(await Channel.findById(input.channelId)).toBeNull();
        return factory.create(input);
      });
      const dto = await createChannelCreator({ ...options, createConversation: provider })(
        { ...f.input, type, accessMode },
        f.workspace.id,
        f.identity,
      );
      expect(dto).toEqual({
        id: expect.any(String),
        workspaceId: f.workspace.id,
        name: 'Thảo luận 🍀',
        type,
        accessMode,
        revision: 0,
      });
      expect(await graph(f.workspace.id)).toEqual([2, type === 'TEXT' ? 2 : 1, 1]);
      expect(provider).toHaveBeenCalledTimes(type === 'TEXT' ? 1 : 0);
      expect(await ChannelAccessGrant.countDocuments({ channelId: dto.id })).toBe(0);
      if (accessMode === 'PRIVATE') {
        const access = createWorkspaceAccessService(
          database,
          coordinator,
          () => true,
          revocations.barrier,
        );
        expect(
          await access.resolveChannelAccess({
            identity: f.identity,
            workspaceId: f.workspace.id,
            channelId: dto.id,
          }),
        ).toMatchObject({ canReadContent: false, canManageChannel: true });
      }
    }
  },
);
it('allows ADMIN but rejects MEMBER, outsiders, removed members and deleted workspaces', async () => {
  const f = await fixture();
  const admin = await actor();
  const member = await Membership.create({
    workspaceId: f.workspace.id,
    userId: admin.user.id,
    role: 'ADMIN',
    status: 'ACTIVE',
    incarnation: 1,
    revision: 0,
    joinedAt: new Date(),
    removedAt: null,
  });
  await expect(create(f.input, f.workspace.id, admin.identity)).resolves.toMatchObject({
    type: 'TEXT',
  });
  await member.updateOne({ role: 'MEMBER' });
  await expect(create(f.input, f.workspace.id, admin.identity)).rejects.toEqual(
    denied('FORBIDDEN'),
  );
  const outsider = await actor();
  await expect(create(f.input, f.workspace.id, outsider.identity)).rejects.toEqual(
    denied('NOT_FOUND'),
  );
  await member.updateOne({ status: 'REMOVED', removedAt: new Date() });
  await expect(create(f.input, f.workspace.id, admin.identity)).rejects.toEqual(
    denied('NOT_FOUND'),
  );
  await Workspace.updateOne({ _id: f.workspace.id }, { deletedAt: new Date() });
  await expect(create(f.input, f.workspace.id, f.identity)).rejects.toEqual(denied('NOT_FOUND'));
});
it('checks expired/revoked sessions and pending membership denial before creation or replay', async () => {
  const f = await fixture();
  await create(f.input, f.workspace.id, f.identity);
  await expect(
    create(f.input, f.workspace.id, { ...f.identity, expiresAt: new Date(0).toISOString() }),
  ).rejects.toEqual(denied('AUTH_REQUIRED'));
  await AuthSession.updateOne({ _id: f.session.id }, { revokedAt: new Date() });
  await expect(create(f.input, f.workspace.id, f.identity)).rejects.toEqual(
    denied('AUTH_REQUIRED'),
  );
  await AuthSession.updateOne({ _id: f.session.id }, { revokedAt: null });
  const membership = await Membership.findOne({ workspaceId: f.workspace.id }).orFail();
  await revocations.revoke({
    event: {
      kind: 'WORKSPACE_MEMBERSHIP',
      operationId: randomUUID(),
      revision: 0,
      workspaceId: f.workspace.id,
      userId: f.user.id,
      membershipId: membership.id,
      membershipIncarnation: 1,
    },
    userId: f.user.id,
    persistence: {
      prepareHeld: async () => ({ authSessionIds: [] }),
      commitHeld: async () => 'committed',
      reconcileHeld: async () => 'committed',
    },
  });
  await expect(create(f.input, f.workspace.id, f.identity)).rejects.toEqual(denied('NOT_FOUND'));
  expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
});
it('serializes permission changes ahead of a queued create', async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((done) => {
    entered = done;
  });
  const wait = new Promise<void>((done) => {
    release = done;
  });
  const runOutside = AsyncResource.bind(() => create(f.input, f.workspace.id, f.identity));
  const removal = coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, async () => {
    entered();
    await wait;
    await Membership.updateOne(
      { workspaceId: f.workspace.id },
      { status: 'REMOVED', removedAt: new Date() },
    );
  });
  await ready;
  const queued = runOutside();
  const check = expect(queued).rejects.toEqual(denied('NOT_FOUND'));
  release();
  await removal;
  await check;
  expect(await graph(f.workspace.id)).toEqual([1, 1, 0]);
});
it.each(['before', 'after', 'identity'] as const)(
  'rolls back channel and conversation for provider failure: %s',
  async (stage) => {
    const f = await fixture();
    const broken = createChannelCreator({
      ...options,
      createConversation: async (input) => {
        if (stage === 'before') throw new Error('injected before M2');
        const result = await factory.create(input);
        if (stage === 'after') throw new Error('injected after M2');
        return { conversationId: `${result.conversationId.slice(0, 23)}z` };
      },
    });
    await expect(broken(f.input, f.workspace.id, f.identity)).rejects.toThrow();
    expect(await graph(f.workspace.id)).toEqual([1, 1, 0]);
    await expect(create(f.input, f.workspace.id, f.identity)).resolves.toMatchObject({
      type: 'TEXT',
    });
  },
);
it('rolls back M1/M2 if the success audit cannot be saved', async () => {
  const f = await fixture();
  const save = vi.spyOn(Audit.prototype, 'save').mockRejectedValueOnce(new Error('audit failed'));
  try {
    await expect(create(f.input, f.workspace.id, f.identity)).rejects.toThrow('audit failed');
  } finally {
    save.mockRestore();
  }
  expect(await graph(f.workspace.id)).toEqual([1, 1, 0]);
});
it('deduplicates concurrent requests and rejects payload changes, but allows duplicate names with a new key', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    create(f.input, f.workspace.id, f.identity),
    create({ ...f.input, requestId: f.input.requestId.toUpperCase() }, f.workspace.id, f.identity),
  ]);
  expect(a).toEqual(b);
  await expect(create({ ...f.input, name: 'Khác' }, f.workspace.id, f.identity)).rejects.toEqual(
    denied('CONFLICT'),
  );
  await expect(
    create({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
  ).resolves.toEqual(a);
  expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
  await create({ ...f.input, requestId: randomUUID() }, f.workspace.id, f.identity);
  expect(await graph(f.workspace.id)).toEqual([3, 3, 2]);
});
it('does not create a new channel when a replay entry was lost, expired or capacity is exhausted', async () => {
  const f = await fixture();
  // Freeze only the ledger's monotonic clock; MongoDB/socket timers remain real.
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  try {
    const creator = createChannelCreator({ ...options, replay: { ttlMs: 100, maxEntries: 1 } });
    await creator(f.input, f.workspace.id, f.identity);
    await expect(
      creator({ ...f.input, requestId: randomUUID() }, f.workspace.id, f.identity),
    ).rejects.toEqual(denied('SERVER_BUSY'));
    clock.mockReturnValue(1100);
    await expect(
      creator({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
    ).rejects.toEqual(denied('CHANNEL_REPLAY_UNAVAILABLE'));
    const restarted = createChannelCreator(options);
    await expect(
      restarted({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
    ).rejects.toEqual(denied('CHANNEL_REPLAY_UNAVAILABLE'));
    expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
  } finally {
    clock.mockRestore();
  }
});
it('reconciles a lost commit acknowledgement without running M2 twice', async () => {
  const f = await fixture();
  const transaction = database.transaction.bind(database);
  const provider = vi.fn(factory.create);
  const creator = createChannelCreator({ ...options, createConversation: provider });
  const lost = new mongoose.mongo.MongoServerError({
    message: 'injected lost ACK',
    errorLabels: ['UnknownTransactionCommitResult'],
  });
  const call = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
    await transaction(work);
    throw lost;
  });
  try {
    await creator(f.input, f.workspace.id, f.identity);
  } finally {
    call.mockRestore();
  }
  await creator({ ...f.input, replayOnly: true }, f.workspace.id, f.identity);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
});
it('retains unresolved IDs under capacity pressure and never reruns a still unknown transaction', async () => {
  const f = await fixture();
  const provider = vi.fn(factory.create);
  const creator = createChannelCreator({
    ...options,
    createConversation: provider,
    replay: { ttlMs: 1, maxEntries: 1 },
  });
  const lost = new mongoose.mongo.MongoServerError({
    message: 'injected unknown result',
    errorLabels: ['UnknownTransactionCommitResult'],
  });
  const call = vi.spyOn(database, 'transaction').mockRejectedValueOnce(lost);
  try {
    await expect(creator(f.input, f.workspace.id, f.identity)).rejects.toMatchObject({
      unconfirmed: true,
    });
  } finally {
    call.mockRestore();
  }
  await expect(
    creator({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
  ).rejects.toMatchObject({ unconfirmed: true });
  await expect(
    creator({ ...f.input, requestId: randomUUID() }, f.workspace.id, f.identity),
  ).rejects.toEqual(denied('SERVER_BUSY'));
  expect(provider).not.toHaveBeenCalled();
  expect(await graph(f.workspace.id)).toEqual([1, 1, 0]);
});

it('exposes HTTP 201 with strict DTO, cookie/Origin/CSRF checks and mapped errors', async () => {
  const f = await fixture();
  const config = loadConfig({});
  const auth = createHttpAuth(
    config.APP_ORIGIN,
    randomBytes(32).toString('hex'),
    createSessionReader(database, () => true),
  );
  const app = createApp(
    config,
    () => ({ name: 'CoLearnia', database: 'connected', media: 'disabled', ready: false }),
    undefined,
    createWorkspaceRouter(auth, createWorkspace, undefined, create),
  );
  const csrf = auth.issueCsrf(f.token);
  const path = `/api/v1/workspaces/${f.workspace.id}/channels`;
  function post(
    body: Record<string, unknown> = f.input,
    origin = config.APP_ORIGIN,
    csrfToken = csrf.token,
  ) {
    return request(app)
      .post(path)
      .set('Cookie', `${authCookie}=${f.token}; ${csrfCookie}=${csrf.cookie}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }
  expect((await request(app).post(path).send(f.input)).status).toBe(401);
  expect((await post(f.input, 'https://other.example')).status).toBe(403);
  expect((await post(f.input, config.APP_ORIGIN, 'bad')).status).toBe(403);
  for (const body of [
    { ...f.input, actorId: f.user.id },
    { ...f.input, type: 'VOICE' },
    { ...f.input, accessMode: 'RESTRICTED' },
    { ...f.input, name: ' ' },
    { ...f.input, name: 'a'.repeat(81) },
  ]) {
    expect((await post(body)).status).toBe(400);
  }
  const res = await post();
  expect(res.status).toBe(201);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(channelResponseSchema.parse(res.body).data).toMatchObject({
    name: 'Thảo luận 🍀',
    type: 'TEXT',
  });
  expect((await post({ ...f.input, replayOnly: true, requestId: randomUUID() })).status).toBe(410);
  expect((await post({ ...f.input, name: 'Khác' })).status).toBe(409);
});

it('retries a transient transaction with stable M1/M2 identities and one audit', async () => {
  const f = await fixture();
  const ids: string[] = [];
  const dates: number[] = [];
  const provider = vi.fn(async (input: Parameters<typeof factory.create>[0]) => {
    ids.push(`${input.channelId}:${input.conversationId}`);
    dates.push(input.createdAt.getTime());
    const result = await factory.create(input);
    if (ids.length === 1)
      throw new mongoose.mongo.MongoServerError({
        message: 'retry snapshot',
        errorLabels: ['TransientTransactionError'],
      });
    return result;
  });
  const dto = await createChannelCreator({ ...options, createConversation: provider })(
    f.input,
    f.workspace.id,
    f.identity,
  );
  expect(provider).toHaveBeenCalledTimes(2);
  expect(ids[0]).toBe(ids[1]);
  expect(dates[0]).toBe(dates[1]);
  expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
  expect(await Conversation.findOne({ 'scope.channelId': dto.id })).not.toBeNull();
});
it('refuses replay during pending channel deletion and does not recreate a deleted channel', async () => {
  const f = await fixture();
  const dto = await create(f.input, f.workspace.id, f.identity);
  await revocations.revoke({
    event: {
      kind: 'CHANNEL_DELETED',
      workspaceId: f.workspace.id,
      channelId: dto.id,
      revision: 0,
      operationId: randomUUID(),
    },
    userId: f.user.id,
    persistence: {
      prepareHeld: async () => ({ authSessionIds: [] }),
      commitHeld: async () => 'committed',
      reconcileHeld: async () => 'committed',
    },
  });
  await expect(
    create({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
  ).rejects.toEqual(denied('NOT_FOUND'));
  await Channel.updateOne({ _id: dto.id }, { deletedAt: new Date() });
  await expect(
    create({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
  ).rejects.toEqual(denied('NOT_FOUND'));
  expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
});
it('keeps retry keys isolated by actor and workspace', async () => {
  const f = await fixture();
  const otherWorkspace = await createWorkspace(
    { name: 'Other', requestId: randomUUID() },
    f.identity,
  );
  const admin = await actor();
  await Membership.create({
    workspaceId: f.workspace.id,
    userId: admin.user.id,
    role: 'ADMIN',
    status: 'ACTIVE',
    incarnation: 1,
    revision: 0,
    joinedAt: new Date(),
  });
  const a = await create(f.input, f.workspace.id, f.identity);
  const b = await create(f.input, otherWorkspace.id, f.identity);
  const c = await create(f.input, f.workspace.id, admin.identity);
  expect(new Set([a.id, b.id, c.id]).size).toBe(3);
});

it('rejects creation while the database preflight is not ready', async () => {
  const f = await fixture();
  await expect(
    createChannelCreator({ ...options, indexesReady: () => false })(
      f.input,
      f.workspace.id,
      f.identity,
    ),
  ).rejects.toEqual(denied('DEPENDENCY_UNAVAILABLE'));
  expect(await graph(f.workspace.id)).toEqual([1, 1, 0]);
});
it('handles mixed workspace reads and channel writes through the shared gates', async () => {
  const fixtures = await Promise.all(Array.from({ length: 4 }, () => fixture()));
  const access = createWorkspaceAccessService(
    database,
    coordinator,
    () => true,
    revocations.barrier,
  );
  const values = await Promise.all(
    fixtures.map(async (f) => {
      const [channel, selection] = await Promise.all([
        create(f.input, f.workspace.id, f.identity),
        access.openWorkspace(f.identity, f.workspace.id),
      ]);
      expect(selection.id).toBe(f.workspace.id);
      expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
      return channel.id;
    }),
  );
  expect(new Set(values).size).toBe(4);
});

it('reconciles a committed channel after an unlabeled acknowledgement failure and a failed commit retry', async () => {
  const f = await fixture();
  const startSession = database.connection.startSession.bind(database.connection);
  const opened = vi.spyOn(database.connection, 'startSession').mockImplementationOnce(async () => {
    const session = await startSession();
    const commit = session.commitTransaction.bind(session);
    vi.spyOn(session, 'commitTransaction')
      .mockImplementationOnce(async () => {
        await commit();
        throw new mongoose.mongo.MongoNetworkError('Commit acknowledgement was lost');
      })
      .mockRejectedValueOnce(new mongoose.mongo.MongoNetworkError('Commit retry failed'));
    return session;
  });
  try {
    const channel = await create(f.input, f.workspace.id, f.identity);
    await expect(
      create({ ...f.input, replayOnly: true }, f.workspace.id, f.identity),
    ).resolves.toEqual(channel);
    await expect(create(f.input, f.workspace.id, f.identity)).resolves.toEqual(channel);
    expect(await graph(f.workspace.id)).toEqual([2, 2, 1]);
  } finally {
    opened.mockRestore();
  }
});
