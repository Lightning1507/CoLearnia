import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { workspaceResponseSchema } from '@colearnia/contracts';
import { createApp } from '../src/app.js';
import { logger } from '../src/lib/logger.js';
import { loadConfig } from '../src/config/env.js';
import { authModels } from '../src/auth/models.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { csrfCookie } from '../src/auth/csrf.js';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import {
  conversationModel,
  createChannelConversationFactory,
} from '../src/messaging/conversation.js';
import {
  workspaceModels,
  workspaceCollectionValidators,
} from '../src/workspaces/workspace-models.js';
import { channelModels, channelCollectionValidators } from '../src/workspaces/channel-models.js';
import { auditModel } from '../src/workspaces/workspace-audit.js';
import {
  createWorkspaceCreator,
  preflightWorkspaceCreation,
} from '../src/workspaces/create-workspace.js';
import { createWorkspaceRouter } from '../src/workspaces/workspace-routes.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum32_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel } = channelModels(database.connection);
const Conversation = conversationModel(database.connection);
const Audit = auditModel(database.connection);
const coordinator = createOperationCoordinator();
// The real unbound barrier used before chat/LIVE cleanup is mounted. No fake
// cleanup adapters: a revoke stays pending and cannot commit permissions.
const revocations = createAccessRevocationCoordinator({ coordinator });
const factory = createChannelConversationFactory(database.connection);
const createConversation = vi.fn(factory.create);
let ready = false;
const create = createWorkspaceCreator({
  database,
  coordinator,
  barrier: revocations.barrier,
  indexesReady: () => ready,
  createConversation,
});
let ownsDatabase = false;
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  expect((await database.connection.db!.admin().command({ hello: 1 })).setName).toBe('rs0');
  ownsDatabase = true;
  expect(await preflightWorkspaceCreation(database)).toBe(false);
  for (const model of [User, AuthSession, Workspace, Membership, Channel, Conversation, Audit]) {
    await model.createCollection();
    await model.createIndexes();
  }
  for (const [collection, validator] of Object.entries({
    workspaces: workspaceCollectionValidators.workspaces,
    memberships: workspaceCollectionValidators.memberships,
    channels: channelCollectionValidators.channels,
  }))
    await database.connection.db!.command({
      collMod: collection,
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  ready = await preflightWorkspaceCreation(database);
  expect(ready).toBe(true);
});
afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum32_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});
async function fixture() {
  const token = randomBytes(32).toString('base64url');
  const user = await User.create({
    emailNormalized: `${randomUUID()}@example.test`,
    displayName: 'Workspace creator fixture',
    passwordHash: 'test-only-unusable-hash',
  });
  const expiresAt = new Date(Date.now() + 120_000);
  const session = await AuthSession.create({
    userId: user._id,
    expiresAt,
    tokenHash: hashAuthToken(token),
  });
  return {
    user,
    session,
    token,
    identity: { userId: user.id, authSessionId: session.id, expiresAt: expiresAt.toISOString() },
    input: { name: `Workspace ${randomUUID()}`, requestId: randomUUID() },
  };
}
// Launch the same entry point as pnpm dev, with an explicit test-only environment.
// Do not inherit MONGO_URI/SESSION_SECRET or read the application's .env.
async function bootWorkspaceServer(expectedMessage: string) {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((done, reject) =>
    reservation.close((error) => (error ? reject(error) : done())),
  );
  const origin = 'https://workspace.example.test';
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: resolve('apps/server'),
    env: {
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: origin,
      MONGO_URI: testReplicaUri(databaseName),
      SESSION_SECRET: randomBytes(32).toString('hex'),
      MEDIA_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((done) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      child.kill('SIGTERM');
    });
  }
  try {
    await new Promise<void>((done, reject) => {
      let output = '';
      const timer = setTimeout(
        () => reject(new Error('Server did not reach Workspace preflight')),
        10000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else done();
      };
      child.once('error', (error) => finish(error));
      child.once('exit', () => finish(new Error('Server exited before Workspace preflight')));
      child.stderr.resume();
      child.stdout.on('data', (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-16000);
        if (output.includes(expectedMessage)) finish();
      });
    });
    return { url: `http://127.0.0.1:${port}`, origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function postWorkspace(f: Awaited<ReturnType<typeof fixture>>) {
  const config = loadConfig({});
  const httpAuth = createHttpAuth(
    config.APP_ORIGIN,
    randomBytes(32).toString('hex'),
    createSessionReader(database, () => ready),
  );
  const app = createApp(
    config,
    () => ({ name: 'CoLearnia', database: 'connected', media: 'disabled', ready: false }),
    undefined,
    createWorkspaceRouter(httpAuth, create),
  );
  const csrf = httpAuth.issueCsrf(f.token);
  return request(app)
    .post('/api/v1/workspaces')
    .set('Cookie', `${authCookie}=${f.token}; ${csrfCookie}=${csrf.cookie}`)
    .set('Origin', config.APP_ORIGIN)
    .set('X-CSRF-Token', csrf.token)
    .send(f.input);
}
const denied = (code: string) => expect.objectContaining({ name: 'WorkspaceCreationError', code });
async function counts() {
  return [
    await Workspace.countDocuments(),
    await Membership.countDocuments(),
    await Channel.countDocuments(),
    await Conversation.countDocuments(),
    await Audit.countDocuments(),
  ];
}

describe('SCRUM-32 Workspace/general with real M1 models and M2 factory', () => {
  it('commits the full graph and audit; the OWNER can resolve general through the shared policy', async () => {
    const f = await fixture();
    const dto = await create({ ...f.input, name: '  Nhóm học 🍀  ' }, f.identity);
    expect(dto).toEqual({
      id: expect.any(String),
      name: 'Nhóm học 🍀',
      ownerId: f.user.id,
      revision: 0,
    });
    const w = await Workspace.findById(dto.id).orFail();
    const m = await Membership.findOne({ workspaceId: w._id }).orFail();
    const c = await Channel.findOne({ workspaceId: w._id }).orFail();
    const conv = await Conversation.findOne({ workspaceId: w._id }).orFail();
    const audit = await Audit.findOne({ workspaceId: w._id }).orFail();
    expect(m).toMatchObject({ role: 'OWNER', status: 'ACTIVE', incarnation: 1, revision: 0 });
    expect(m.userId.equals(w.ownerId)).toBe(true);
    expect(c).toMatchObject({
      name: 'general',
      type: 'TEXT',
      accessMode: 'WORKSPACE',
      order: 0,
      revision: 0,
    });
    expect(conv.kind).toBe('CHANNEL');
    expect(conv.scope.channelId?.equals(c._id)).toBe(true);
    expect(audit).toMatchObject({
      action: 'WORKSPACE_CREATE',
      requestId: f.input.requestId,
      target: { kind: 'WORKSPACE', id: dto.id },
      outcome: 'SUCCEEDED',
      revision: 0,
    });
    expect([m.createdAt, m.joinedAt, c.createdAt, conv.createdAt, audit.createdAt]).toEqual(
      Array(5).fill(w.createdAt),
    );
    const access = createWorkspaceAccessService(
      database,
      coordinator,
      () => ready,
      revocations.barrier,
    );
    expect(
      await access.resolveChannelAccess({
        identity: f.identity,
        workspaceId: dto.id,
        channelId: c.id,
      }),
    ).toMatchObject({ canReadContent: true, canManageChannel: true });
  });

  it('keeps writes invisible outside the exact transaction passed to M2', async () => {
    const f = await fixture();
    createConversation.mockImplementationOnce(async (input) => {
      expect(input.dbSession.inTransaction()).toBe(true);
      expect(
        await Workspace.countDocuments({ _id: input.workspaceId }).session(input.dbSession),
      ).toBe(1);
      expect(
        await Membership.countDocuments({ workspaceId: input.workspaceId }).session(
          input.dbSession,
        ),
      ).toBe(1);
      expect(await Channel.countDocuments({ _id: input.channelId }).session(input.dbSession)).toBe(
        1,
      );
      expect(await Workspace.countDocuments({ _id: input.workspaceId })).toBe(0);
      const result = await factory.create(input);
      expect(
        await Conversation.countDocuments({ _id: input.conversationId }).session(input.dbSession),
      ).toBe(1);
      expect(await Conversation.countDocuments({ _id: input.conversationId })).toBe(0);
      return result;
    });
    await create(f.input, f.identity);
  });

  it('propagates a failed M2 insert and leaves no partial graph or success audit', async () => {
    const f = await fixture();
    const before = await counts();
    const failure = new Error('injected M2 failure');
    createConversation.mockImplementationOnce(async () => {
      throw failure;
    });
    await expect(create(f.input, f.identity)).rejects.toBe(failure);
    expect(await counts()).toEqual(before);
    expect(coordinator.stats().operations).toBe(0);
    await expect(create(f.input, f.identity)).resolves.toMatchObject({ ownerId: f.user.id });
  });

  it.each([
    { name: 'x', requestId: randomUUID() },
    { name: 'valid', requestId: 'invalid' },
    { name: 'valid', requestId: randomUUID(), ownerId: '000000000000000000000001' },
    { name: 'valid', requestId: randomUUID(), role: 'OWNER' },
  ])('rejects invalid/forged input before writes (%j)', async (input) => {
    const f = await fixture();
    const before = await counts();
    await expect(create(input, f.identity)).rejects.toEqual(denied('VALIDATION_ERROR'));
    expect(await counts()).toEqual(before);
  });

  it.each(['expired', 'revoked', 'disabled', 'wrong-user'] as const)(
    'rejects %s identity',
    async (kind) => {
      const f = await fixture();
      const before = await counts();
      if (kind === 'expired')
        await AuthSession.updateOne({ _id: f.session._id }, { expiresAt: new Date(0) });
      if (kind === 'revoked')
        await AuthSession.updateOne({ _id: f.session._id }, { revokedAt: new Date() });
      if (kind === 'disabled') await User.updateOne({ _id: f.user._id }, { status: 'DISABLED' });
      if (kind === 'wrong-user') f.identity.userId = '000000000000000000000001';
      await expect(create(f.input, f.identity)).rejects.toEqual(denied('AUTH_REQUIRED'));
      expect(await counts()).toEqual(before);
    },
  );

  it('rejects a valid DB session behind a pending auth deny barrier', async () => {
    const f = await fixture();
    const before = await counts();
    await revocations.revoke({
      userId: f.user.id,
      event: {
        kind: 'AUTH_SESSION',
        authSessionId: f.session.id,
        operationId: randomUUID(),
        revision: 0,
      },
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: async () => 'unknown',
        reconcileHeld: async () => 'unknown',
      },
    });
    await expect(create(f.input, f.identity)).rejects.toEqual(denied('AUTH_REQUIRED'));
    expect(await counts()).toEqual(before);
  });

  it('aborts when the session expires while M2 is preparing the conversation', async () => {
    const f = await fixture();
    const before = await counts();
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    createConversation.mockImplementationOnce(async (input) => {
      const result = await factory.create(input);
      const expiredTime = Date.now() + 200_000;
      clock = vi.spyOn(Date, 'now').mockReturnValue(expiredTime);
      return result;
    });
    try {
      await expect(create(f.input, f.identity)).rejects.toEqual(denied('AUTH_REQUIRED'));
    } finally {
      clock?.mockRestore();
    }
    expect(await counts()).toEqual(before);
    expect(coordinator.stats().operations).toBe(0);
  });

  it('rejects unavailable preflight without writes', async () => {
    const f = await fixture();
    const before = await counts();
    ready = false;
    try {
      await expect(create(f.input, f.identity)).rejects.toEqual(denied('DEPENDENCY_UNAVAILABLE'));
    } finally {
      ready = true;
    }
    expect(await counts()).toEqual(before);
  });

  it('reuses IDs/time on a bounded transient callback retry', async () => {
    const f = await fixture();
    let first: Parameters<typeof factory.create>[0] | undefined;
    createConversation.mockImplementationOnce(async (input) => {
      first = input;
      const error = new mongoose.mongo.MongoServerError({
        message: 'injected transient',
        code: 112,
      });
      error.addErrorLabel('TransientTransactionError');
      throw error;
    });
    createConversation.mockImplementationOnce(async (input) => {
      expect(input).toEqual(first);
      return factory.create(input);
    });
    const dto = await create(f.input, f.identity);
    expect(await Membership.countDocuments({ workspaceId: dto.id })).toBe(1);
    expect(await Conversation.countDocuments({ workspaceId: dto.id })).toBe(1);
    expect(await Audit.countDocuments({ workspaceId: dto.id })).toBe(1);
  });

  it('reconciles a lost commit acknowledgement without a new transaction', async () => {
    const f = await fixture();
    const transaction = database.transaction.bind(database);
    const unknown = new mongoose.mongo.MongoServerError({ message: 'injected unknown commit' });
    unknown.addErrorLabel('UnknownTransactionCommitResult');
    const spy = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
      await transaction(work);
      throw unknown;
    });
    try {
      await expect(create(f.input, f.identity)).resolves.toMatchObject({ ownerId: f.user.id });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not claim rollback/success or retry creation when commit cannot be confirmed', async () => {
    const f = await fixture();
    const before = await counts();
    const unknown = new mongoose.mongo.MongoServerError({ message: 'injected unknown commit' });
    unknown.addErrorLabel('UnknownTransactionCommitResult');
    const spy = vi.spyOn(database, 'transaction').mockRejectedValueOnce(unknown);
    try {
      await expect(create(f.input, f.identity)).rejects.toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
        unconfirmed: true,
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(await counts()).toEqual(before);
  });

  it.each(['acknowledged', 'reconciled'] as const)(
    'reports committed creation when auth expires after %s commit, without returning the DTO',
    async (kind) => {
      const f = await fixture();
      const before = await counts();
      const transaction = database.transaction.bind(database);
      let clock: ReturnType<typeof vi.spyOn> | undefined;
      const tx = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
        const value = await transaction(work);
        const expiredTime = Date.now() + 200_000;
        clock = vi.spyOn(Date, 'now').mockReturnValue(expiredTime);
        if (kind === 'reconciled') {
          const unknown = new mongoose.mongo.MongoServerError({ message: 'injected lost ack' });
          unknown.addErrorLabel('UnknownTransactionCommitResult');
          throw unknown;
        }
        return value;
      });
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      try {
        const response = await postWorkspace(f);
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTH_REQUIRED');
        expect(response.body.error.message).toContain('Workspace đã được tạo');
        expect(response.body.error.message).toContain('kiểm tra danh sách');
        expect(response.body.data).toBeUndefined();
        expect(tx).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          {
            traceRequestId: response.body.requestId,
            operationRequestId: f.input.requestId,
            actorUserId: f.user.id,
            committed: true,
          },
          expect.any(String),
        );
      } finally {
        clock?.mockRestore();
        tx.mockRestore();
        warn.mockRestore();
        info.mockRestore();
      }
      expect(await counts()).toEqual(before.map((n) => n + 1));
      expect(coordinator.stats().operations).toBe(0);
    },
  );

  it('links the server HTTP trace to the operation stored in audit on success', async () => {
    const f = await fixture();
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      const response = await postWorkspace(f);
      expect(response.status).toBe(201);
      const traceRequestId = response.body.requestId;
      expect(traceRequestId).toBe(response.headers['x-request-id']);
      expect(traceRequestId).not.toBe(f.input.requestId);
      const audit = await Audit.findOne({ workspaceId: response.body.data.id }).orFail();
      expect(audit.requestId).toBe(f.input.requestId);
      expect(info).toHaveBeenCalledWith(
        {
          traceRequestId,
          operationRequestId: audit.requestId,
          actorUserId: f.user.id,
          workspaceId: response.body.data.id,
        },
        'Workspace creation committed',
      );
    } finally {
      info.mockRestore();
    }
  });

  it('logs both trace IDs for an unconfirmed commit, with no raw input or credentials', async () => {
    const f = await fixture();
    const before = await counts();
    const unknown = new mongoose.mongo.MongoServerError({ message: 'injected unknown commit' });
    unknown.addErrorLabel('UnknownTransactionCommitResult');
    const tx = vi.spyOn(database, 'transaction').mockRejectedValueOnce(unknown);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      const response = await postWorkspace(f);
      expect(response.status).toBe(503);
      expect(response.body.error.message).toContain('Chưa xác nhận');
      expect(warn).toHaveBeenCalledWith(
        {
          traceRequestId: response.body.requestId,
          operationRequestId: f.input.requestId,
          actorUserId: f.user.id,
        },
        expect.any(String),
      );
    } finally {
      tx.mockRestore();
      warn.mockRestore();
      info.mockRestore();
    }
    expect(await counts()).toEqual(before);
  });

  it('does not promise REST deduplication or uniqueness of Workspace names', async () => {
    const f = await fixture();
    const first = await create(f.input, f.identity);
    const second = await create(f.input, f.identity);
    expect(first.id).not.toBe(second.id);
  });

  it('serves HTTP 201 with real cookie authentication and bound CSRF; rejects missing/invalid credentials', async () => {
    const f = await fixture();
    const config = loadConfig({});
    const httpAuth = createHttpAuth(
      config.APP_ORIGIN,
      randomBytes(32).toString('hex'),
      createSessionReader(database, () => ready),
    );
    const app = createApp(
      config,
      () => ({ name: 'CoLearnia', database: 'connected', media: 'disabled', ready: false }),
      undefined,
      createWorkspaceRouter(httpAuth, create),
    );
    const csrf = httpAuth.issueCsrf(f.token);
    const cookies = `${authCookie}=${f.token}; ${csrfCookie}=${csrf.cookie}`;
    const success = await request(app)
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .set('Origin', config.APP_ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .send(f.input);
    expect(success.status).toBe(201);
    expect(workspaceResponseSchema.safeParse(success.body).success).toBe(true);
    expect(success.body.data.ownerId).toBe(f.user.id);
    expect(success.headers['cache-control']).toBe('no-store');
    const before = await counts();
    expect((await request(app).post('/api/v1/workspaces').send(f.input)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/workspaces')
          .set('Cookie', cookies)
          .set('Origin', 'https://other.example.test')
          .set('X-CSRF-Token', csrf.token)
          .send(f.input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/workspaces')
          .set('Cookie', cookies)
          .set('Origin', config.APP_ORIGIN)
          .send(f.input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/workspaces')
          .set('Cookie', cookies)
          .set('Origin', config.APP_ORIGIN)
          .set('X-CSRF-Token', csrf.token)
          .send({ ...f.input, ownerId: f.user.id })
      ).status,
    ).toBe(400);
    expect(await counts()).toEqual(before);
  });
  it('mounts Workspace creation through the actual main entry point without fake cleanup ports', async () => {
    const f = await fixture();
    const server = await bootWorkspaceServer('Workspace creation database preflight passed.');
    try {
      const auth = `${authCookie}=${f.token}`;
      const csrf = await request(server.url).get('/api/v1/auth/csrf').set('Cookie', auth);
      expect(csrf.status).toBe(200);
      const setCookies = csrf.headers['set-cookie'] as unknown as string[];
      const csrfPair = setCookies
        .map((cookie) => cookie.split(';')[0])
        .find((cookie) => cookie?.startsWith(`${csrfCookie}=`));
      expect(csrfPair).toBeTruthy();
      const response = await request(server.url)
        .post('/api/v1/workspaces')
        .set('Cookie', `${auth}; ${csrfPair}`)
        .set('Origin', server.origin)
        .set('X-CSRF-Token', csrf.body.data.csrfToken)
        .send(f.input);
      expect(response.status).toBe(201);
      expect(workspaceResponseSchema.safeParse(response.body).success).toBe(true);
      const id = response.body.data.id;
      expect(await Workspace.countDocuments({ _id: id })).toBe(1);
      expect(
        await Membership.countDocuments({ workspaceId: id, role: 'OWNER', userId: f.user.id }),
      ).toBe(1);
      expect(await Channel.countDocuments({ workspaceId: id, name: 'general', type: 'TEXT' })).toBe(
        1,
      );
      expect(await Conversation.countDocuments({ workspaceId: id, kind: 'CHANNEL' })).toBe(1);
      expect(await Audit.countDocuments({ workspaceId: id, outcome: 'SUCCEEDED' })).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('keeps the mounted route unavailable when startup finds a missing required index', async () => {
    const f = await fixture();
    const before = await counts();
    await Audit.collection.dropIndex('ix_audit_workspace');
    let server: Awaited<ReturnType<typeof bootWorkspaceServer>> | undefined;
    try {
      server = await bootWorkspaceServer(
        'Workspace creation requires its collections and indexes before startup.',
      );
      const auth = `${authCookie}=${f.token}`;
      const csrf = await request(server.url).get('/api/v1/auth/csrf').set('Cookie', auth);
      const setCookies = csrf.headers['set-cookie'] as unknown as string[];
      const csrfPair = setCookies
        .map((cookie) => cookie.split(';')[0])
        .find((cookie) => cookie?.startsWith(`${csrfCookie}=`));
      const response = await request(server.url)
        .post('/api/v1/workspaces')
        .set('Cookie', `${auth}; ${csrfPair}`)
        .set('Origin', server.origin)
        .set('X-CSRF-Token', csrf.body.data.csrfToken)
        .send(f.input);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(await counts()).toEqual(before);
    } finally {
      await server?.stop();
      await Audit.createIndexes();
    }
  });
});
