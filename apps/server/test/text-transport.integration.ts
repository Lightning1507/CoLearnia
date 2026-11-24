import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mongo } from 'mongoose';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { textMessageHistoryResponseSchema, textMessageSendAckSchema } from '@colearnia/contracts';
import { createApp } from '../src/app.js';
import { csrfCookie } from '../src/auth/csrf.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { authModels } from '../src/auth/models.js';
import { createSessionRevocation } from '../src/auth/session-revocation.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { loadConfig } from '../src/config/env.js';
import { createProfiledDatabase, scrum42Trial } from './scrum42-db-profile.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import {
  conversationModel,
  createChannelConversationFactory,
} from '../src/messaging/conversation.js';
import { createTextMessageRepository, textMessageModel } from '../src/messaging/text-message.js';
import { createTextSendLedger, textSendLedgerIndex } from '../src/messaging/text-send-ledger.js';
import { createTextService, textErrorCode } from '../src/messaging/text-service.js';
import { createTextRouter, createTextSocketSend } from '../src/messaging/text-transport.js';
import { createRealtime } from '../src/realtime/server.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { createWorkspaceCreator } from '../src/workspaces/create-workspace.js';
import { createChannelCreator } from '../src/workspaces/create-channel.js';
import { auditModel } from '../src/workspaces/workspace-audit.js';
import { testReplicaUri } from './replica-uri.js';

const name = 'colearnia_test_scrum42_' + randomUUID().replaceAll('-', '');
const database = createProfiledDatabase(testReplicaUri(name), 2);
const trialLedger =
  scrum42Trial && process.env.COLEARNIA_TEST_TEXT_DURABLE === '1'
    ? createTextSendLedger(database, 1)
    : undefined;
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const Conversation = conversationModel(database.connection);
const Message = textMessageModel(database.connection);
const trace: { event: string; ms: number }[] = [];
let tracing = false;
const transactionTrace: object[] = [];
let tracingTransactions = false;
let transactionTraceStarted = 0;
let diagnosingTransactions = false;
const transactionTraceMs = () =>
  Math.round((performance.now() - transactionTraceStarted) * 10) / 10;
function mark(event: string) {
  if (tracing) trace.push({ event, ms: Math.round(performance.now() * 10) / 10 });
}
const coordinator = createOperationCoordinator(undefined, (event, kind) =>
  mark(kind + ':' + event),
);
const revocation = createAccessRevocationCoordinator({ coordinator });
const { barrier } = revocation;
const handler = {
  processInFlight: 4,
  processQueued: 0,
  processBytes: 131072,
  perUserInFlight: 2,
  perScopeInFlight: 3,
  payloadBytes: 32768,
  queueWaitMs: 1000,
  executionMs: 5000,
};
const budget = {
  process: { inFlight: 6, queued: 0, bytes: 2600000 },
  database: { maxPoolSize: 10, waitQueueTimeoutMs: 5000, queryTimeoutMs: 1000 },
  revocation: { reservedInFlight: 1, cleanupBatchSize: 1, executionMs: 1000 },
  handlers: { text: handler, history: { ...handler, processBytes: 2600000 } },
};
const secret = randomBytes(32).toString('hex');
const config = loadConfig({
  SESSION_SECRET: secret,
  MESSAGING_BUDGET_JSON: JSON.stringify(budget),
});
const readSession = createSessionReader(database, () => true);
const auth = createHttpAuth(config.APP_ORIGIN, secret, readSession);
const access = createWorkspaceAccessService(database, coordinator, () => true, barrier);
const service = createTextService(database, coordinator, access, () => true, secret, budget);
const app = createApp(
  config,
  () => ({ name: 'CoLearnia', database: 'connected', media: 'disabled', ready: false }),
  undefined,
  undefined,
  undefined,
  createTextRouter(auth, service),
);
const server = createServer(app);
const realtime = createRealtime(
  server,
  config,
  readSession,
  undefined,
  undefined,
  createTextSocketSend(service),
);
let ownsDatabase = false;

beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(name);
  ownsDatabase = true;
  if (scrum42Trial) {
    const client = database.connection.getClient();
    client.on('commandStarted', (event) => mark('start:' + event.commandName));
    client.on('commandSucceeded', (event) => mark('ok:' + event.commandName));
    client.on('commandFailed', (event) => mark('fail:' + event.commandName));
    client.on('commandStarted', ({ command, commandName, requestId }) => {
      if (!tracingTransactions || command.txnNumber === undefined) return;
      transactionTrace.push({
        ms: transactionTraceMs(),
        commandName,
        requestId,
        lsid: command.lsid?.id?.toUUID().toString(),
        txnNumber: command.txnNumber.toString(),
        startTransaction: command.startTransaction === true,
      });
    });
    client.on('commandFailed', ({ commandName, requestId, failure }) => {
      if (!tracingTransactions) return;
      transactionTrace.push({
        ms: transactionTraceMs(),
        commandName,
        requestId,
        error: mongoErrorEvidence(failure),
      });
    });
    client.on('connectionCheckOutStarted', () => mark('checkout:start'));
    client.on('connectionCheckedOut', () => mark('checkout:ok'));
    client.on('connectionCheckOutFailed', () => mark('checkout:failed'));
  }
  for (const model of [
    User,
    AuthSession,
    Workspace,
    Membership,
    Channel,
    ChannelAccessGrant,
    Conversation,
    Message,
    auditModel(database.connection),
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
  if (trialLedger) {
    const { collection, key, name: indexName, unique } = textSendLedgerIndex;
    await database.connection.db!.createCollection(collection);
    await database.connection
      .db!.collection(collection)
      .createIndex(key, { name: indexName, unique });
    await trialLedger.start(() => 5000);
    revocation.bindCleanupAdapters({
      messaging: trialService.syncRevocation!,
      live: { revoke: async ({ operationId }) => confirmedCleanup(operationId) },
    });
  }
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
afterAll(async () => {
  try {
    await realtime.close();
    if (ownsDatabase && database.connection.name === name) await database.connection.dropDatabase();
    if (diagnosingTransactions) console.info('SCRUM42_TEARDOWN drop complete');
  } catch (error) {
    if (diagnosingTransactions) console.info('SCRUM42_TEARDOWN drop', mongoErrorEvidence(error));
    throw error;
  } finally {
    await database.close();
    if (diagnosingTransactions) console.info('SCRUM42_TEARDOWN connection closed');
  }
});

async function account() {
  const user = await User.create({
    emailNormalized: randomUUID() + '@example.test',
    displayName: 'TEXT fixture',
    passwordHash: 'fixture',
  });
  const token = randomBytes(32).toString('base64url');
  const session = await AuthSession.create({
    userId: user._id,
    expiresAt: new Date(Date.now() + 60_000),
    tokenHash: hashAuthToken(token),
  });
  const csrf = auth.issueCsrf(token);
  return {
    user,
    session,
    token: csrf.token,
    authToken: token,
    cookie: authCookie + '=' + token + '; ' + csrfCookie + '=' + csrf.cookie,
  };
}

async function textChannel() {
  const owner = await account();
  const member = await account();
  const workspace = await Workspace.create({ name: 'TEXT workspace', ownerId: owner.user._id });
  for (const actor of [owner, member]) {
    await Membership.create({
      workspaceId: workspace._id,
      userId: actor.user._id,
      role: actor === owner ? 'OWNER' : 'MEMBER',
      status: 'ACTIVE',
      incarnation: 1,
      revision: 0,
      joinedAt: new Date(),
      removedAt: null,
    });
  }
  const channel = await Channel.create({
    workspaceId: workspace._id,
    name: 'General',
    type: 'TEXT',
    accessMode: 'WORKSPACE',
  });
  const conversation = await Conversation.create({
    workspaceId: workspace._id,
    kind: 'CHANNEL',
    scope: { channelId: channel._id },
  });
  return { owner, member, workspace, channel, conversation };
}

function identity(actor: Awaited<ReturnType<typeof account>>) {
  return {
    userId: actor.user.id,
    authSessionId: actor.session.id,
    expiresAt: actor.session.expiresAt.toISOString(),
  };
}

it('shares REST and socket retry keys and enforces current TEXT access for both accounts', async () => {
  const { owner, member, workspace, channel, conversation } = await textChannel();
  const outsider = await account();
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Missing port');
  const socket = connect('http://127.0.0.1:' + addr.port, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: config.APP_ORIGIN, Cookie: member.cookie },
    auth: { csrfToken: member.token },
  });
  const path = '/api/v1/channels/' + channel.id + '/messages';
  const post = (actor: typeof owner, body: object) =>
    request(server)
      .post(path)
      .set('Cookie', actor.cookie)
      .set('Origin', config.APP_ORIGIN)
      .set('X-CSRF-Token', actor.token)
      .send(body);
  const read = (actor: typeof owner) => request(server).get(path).set('Cookie', actor.cookie);
  const send = (body: object) =>
    socket.timeout(3000).emitWithAck('message.send', {
      requestId: randomUUID(),
      payload: { channelId: channel.id, ...body },
    });
  try {
    await new Promise<void>((done, reject) => {
      socket.once('connect', done);
      socket.once('connect_error', reject);
    });

    const first = await post(owner, { clientMessageId: randomUUID(), text: 'Chào từ REST' }).expect(
      201,
    );
    const payload = { clientMessageId: randomUUID(), text: 'Chào từ socket' };
    const second = textMessageSendAckSchema.parse(await send(payload));
    expect(second).toMatchObject({
      data: { outcome: 'created', message: { senderId: member.user.id, commitSeq: 2 } },
    });
    const retry = await post(member, payload).expect(200);
    expect(retry.body.data.message).toEqual('data' in second ? second.data.message : undefined);
    expect(await send({ ...payload, text: 'Khác' })).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(2);

    const page = textMessageHistoryResponseSchema.parse(
      (await read(owner).query({ limit: 1 }).expect(200).expect('Cache-Control', 'no-store')).body,
    ).data;
    expect(page.items[0]?.text).toBe(payload.text);
    expect(page.nextCursor).toBeTruthy();
    const older = await read(member).query({ cursor: page.nextCursor }).expect(200);
    expect(older.body.data.items).toEqual([first.body.data.message]);
    await read(member)
      .query({ cursor: page.nextCursor + 'x' })
      .expect(400);
    await read(outsider).expect(404).expect('Cache-Control', 'no-store');
    await coordinator.run({ workspaceId: workspace.id }, async () => {
      const busy = await read(owner).expect(503);
      expect(busy.body.error.code).toBe('SERVER_BUSY');
    });
    await read(owner).expect(200);
    await request(server).get(path).expect(401).expect('Cache-Control', 'no-store');
    await AuthSession.updateOne({ _id: member.session._id }, { revokedAt: new Date() });
    expect(await send(payload)).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    await read(member).expect(401);
  } finally {
    socket.disconnect();
  }
});

it('reserves history page bytes before queueing another read and frees them after delivery', async () => {
  const { owner, member, workspace, channel, conversation } = await textChannel();
  const text = '😀'.repeat(3999);
  for (let index = 0; index < 2; index++) {
    await Message.create({
      conversationId: conversation._id,
      senderId: owner.user._id,
      clientMessageId: randomUUID(),
      text,
      createdAt: new Date(),
    });
  }
  const bounded = createTextService(database, coordinator, access, () => true, secret, {
    ...budget,
    process: { ...budget.process, queued: 2 },
    handlers: { history: { ...handler, processQueued: 2, processBytes: 300000 } },
  });
  let unlock!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocker = coordinator.run({ workspaceId: workspace.id }, async () => {
    entered();
    await new Promise<void>((resolve) => {
      unlock = resolve;
    });
  });
  await held;
  const first = bounded.history(identity(owner), channel.id, { limit: 2 });
  // Observe the rejection immediately so a failed assertion cannot leave an unhandled promise.
  const observed = first.then(
    (page) => page,
    (error: unknown) => error,
  );
  try {
    await vi.waitFor(() => expect(coordinator.stats().pending).toBe(1));
    await expect(bounded.history(identity(member), channel.id, { limit: 2 })).rejects.toMatchObject(
      { code: 'SERVER_BUSY' },
    );
  } finally {
    unlock();
    await blocker;
    await observed;
  }
  expect((await first).items.map((row) => row.text)).toEqual([text, text]);
  expect((await bounded.history(identity(member), channel.id, { limit: 2 })).items).toHaveLength(2);
});

it.runIf(!scrum42Trial && process.env.COLEARNIA_TEST_DB_FAILPOINTS === '1')(
  'releases the Workspace gate after a slow Mongo ACL read within the request budget',
  async () => {
    const { owner, workspace, channel } = await textChannel();
    const deadlineMs = 650;
    const timed = createTextService(database, coordinator, access, () => true, secret, {
      ...budget,
      handlers: { history: { ...budget.handlers.history, executionMs: deadlineMs } },
    });
    const admin = database.connection.db!.admin();
    // Enable only on a dedicated disposable mongod with enableTestCommands.
    // The first find resolves the channel before taking the shared gate.
    await admin.command({
      configureFailPoint: 'failCommand',
      mode: { skip: 1 },
      data: {
        failCommands: ['find'],
        blockConnection: true,
        blockTimeMS: 2000,
      },
    });
    const t0 = performance.now();
    try {
      const error = await timed.history(identity(owner), channel.id, { limit: 1 }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(textErrorCode(error)).toBe('DEPENDENCY_UNAVAILABLE');
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeGreaterThan(200);
      expect(elapsed).toBeLessThan(deadlineMs + 400);
      console.info('Slow Mongo ACL request released its gate after %d ms', Math.round(elapsed));
      await coordinator.run({ workspaceId: workspace.id }, () => undefined, { noWait: true });
    } finally {
      await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
    }
    expect((await timed.history(identity(owner), channel.id, { limit: 1 })).items).toEqual([]);
  },
);

it.runIf(!scrum42Trial && process.env.COLEARNIA_TEST_DB_FAILPOINTS === '1')(
  'characterizes the deadline overrun and preserves the gate, slot and message retry',
  async () => {
    const { owner, workspace, channel, conversation } = await textChannel();
    const other = await textChannel();
    const deadlineMs = 650;
    const timed = createTextService(database, coordinator, access, () => true, secret, {
      ...budget,
      handlers: {
        text: {
          ...handler,
          executionMs: deadlineMs,
          processInFlight: 1,
          perUserInFlight: 1,
          perScopeInFlight: 1,
        },
      },
    });
    const admin = database.connection.db!.admin();

    for (const phase of ['commitTransaction', 'abortTransaction'] as const) {
      const payload = { clientMessageId: randomUUID(), text: phase };
      // Force a write failure after the conversation counter update, so endSession
      // needs to abort an active transaction. Do not modify the Mongo collection.
      const insert =
        phase === 'abortTransaction'
          ? vi
              .spyOn(Message.collection, 'insertOne')
              .mockRejectedValueOnce(new Error('fixture insert failure'))
          : undefined;
      const fault = await admin.command({
        configureFailPoint: 'failCommand',
        mode: phase === 'commitTransaction' ? { skip: 1 } : { times: 1 },
        data: { failCommands: [phase], blockConnection: true, blockTimeMS: 2000 },
      });
      const t0 = performance.now();
      const pending = timed.send(identity(owner), channel.id, payload).then(
        (result) => ({ result, elapsed: performance.now() - t0 }),
        (error: unknown) => ({ error, elapsed: performance.now() - t0 }),
      );
      try {
        // The first commit belongs to ACL. Synchronize on the delayed command itself.
        await admin.command({
          waitForFailPoint: 'failCommand',
          timesEntered: Number(fault.count) + 1,
          maxTimeMS: 1500,
        });
        await new Promise((resolve) => setTimeout(resolve, 900));
        await expect(
          coordinator.run({ workspaceId: workspace.id }, () => undefined, { noWait: true }),
        ).rejects.toMatchObject({ code: 'BUSY' });
        await expect(
          timed.send(identity(other.owner), other.channel.id, payload),
        ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
        const settled = await pending;
        expect(settled.elapsed).toBeGreaterThan(deadlineMs);
        expect(settled).toHaveProperty('error');
        if (phase === 'commitTransaction' && 'error' in settled) {
          expect(textErrorCode(settled.error)).toBe('DEPENDENCY_UNAVAILABLE');
        }
        console.info('%s fault: TEXT settled after %d ms', phase, Math.round(settled.elapsed));
      } finally {
        await pending;
        insert?.mockRestore();
        await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
      }

      await coordinator.run({ workspaceId: workspace.id }, () => undefined, { noWait: true });
      const key = { conversationId: conversation._id, clientMessageId: payload.clientMessageId };
      const stored = await Message.exists(key);
      if (phase === 'abortTransaction') expect(stored).toBeNull();
      const retry = await timed.send(identity(owner), channel.id, payload);
      expect(retry.outcome).toBe(stored ? 'existing' : 'created');
      expect((await timed.send(identity(owner), channel.id, payload)).outcome).toBe('existing');
      expect(
        await Message.countDocuments({
          conversationId: conversation._id,
          clientMessageId: payload.clientMessageId,
        }),
      ).toBe(1);
    }
    expect((await Conversation.findById(conversation._id).orFail()).lastMessageCommitSeq).toBe(2);
  },
);

it.each([true, false])(
  'uses majority proof for an unknown message commit (committed=%s)',
  async (committed) => {
    const { owner, channel, conversation } = await textChannel();
    const payload = { clientMessageId: randomUUID(), text: 'lost acknowledgement' };
    const original = mongo.ClientSession.prototype.commitTransaction;
    let commits = 0;
    const spy = vi
      .spyOn(mongo.ClientSession.prototype, 'commitTransaction')
      .mockImplementation(async function (this: mongo.ClientSession, ...args) {
        if (++commits !== 2) return original.apply(this, args);
        if (!committed) throw new mongo.MongoNetworkError('fixture no commit acknowledgement');
        await original.apply(this, args);
        throw new mongo.MongoWriteConcernError({
          ok: 1,
          writeConcernError: { code: 64, errmsg: 'fixture lost ACK' },
        });
      });
    try {
      if (committed) {
        await expect(service.send(identity(owner), channel.id, payload)).resolves.toMatchObject({
          outcome: 'created',
          message: { commitSeq: 1 },
        });
      } else {
        const failure = await service
          .send(identity(owner), channel.id, payload)
          .catch((error: unknown) => error);
        expect(textErrorCode(failure)).toBe('DEPENDENCY_UNAVAILABLE');
        expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(0);
      }
    } finally {
      spy.mockRestore();
    }
    const replay = await service.send(identity(owner), channel.id, payload);
    expect(replay).toMatchObject({
      outcome: committed ? 'existing' : 'created',
      message: { commitSeq: 1 },
    });
    await expect(
      service.send(identity(owner), channel.id, { ...payload, text: 'different' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
  },
);

const trialWithFaults = scrum42Trial && process.env.COLEARNIA_TEST_DB_FAILPOINTS === '1';
const recoveryTrial = process.env.COLEARNIA_TEST_TEXT_COMMIT_RECOVERY === '1';
const recoveryOptions = recoveryTrial
  ? { maxPending: 1, retryDelaysMs: [2500, 500, 1000, 1500] }
  : undefined;
const trialService: ReturnType<typeof createTextService> = createTextService(
  database,
  coordinator,
  access,
  () => true,
  secret,
  {
    ...budget,
    handlers: { text: { ...handler, executionMs: 650, processInFlight: 1 } },
  },
  mark,
  false,
  trialLedger
    ? { subscriptions: 16, perUser: 4, leaseMs: 60_000, revocationRecords: 16 }
    : undefined,
  () =>
    Boolean(
      trialService.syncRevocation &&
      revocation.isMessagingCleanupBound(trialService.syncRevocation),
    ),
  recoveryOptions,
  trialLedger,
);

function beginTrace() {
  trace.length = 0;
  tracing = true;
  const t0 = performance.now();
  return (label: string) => {
    tracing = false;
    console.info(
      'SCRUM42_TRACE %s %s',
      label,
      JSON.stringify(trace.map(({ event, ms }) => [event, Math.round((ms - t0) * 10) / 10])),
    );
  };
}

it('keeps one write admission pending until the original commit is acknowledged', async () => {
  const { owner, conversation } = await textChannel();
  const other = await textChannel();
  const repo = createTextMessageRepository(database, { maxPending: 1, retryDelaysMs: [0] });
  const actor = identity(owner);
  const input = {
    conversationId: conversation._id,
    senderId: owner.user._id,
    fenceAuthSessionId: actor.authSessionId,
    clientMessageId: randomUUID(),
    text: 'Pending send',
    createdAt: new Date(),
  };
  // Hold an application-level retry while using Mongo for the original insert
  // and commit, so race checks do not depend on the timing of a server failpoint.
  let release!: () => void;
  const mayRetry = new Promise<void>((resolve) => {
    release = resolve;
  });
  let startRetry!: () => void;
  const retryStarted = new Promise<void>((resolve) => {
    startRetry = resolve;
  });
  let firstCommit = true;
  const originalSession = new WeakSet<mongo.ClientSession>();
  const commit = mongo.ClientSession.prototype.commitTransaction;
  const spy = vi
    .spyOn(mongo.ClientSession.prototype, 'commitTransaction')
    .mockImplementation(async function (this: mongo.ClientSession) {
      if (firstCommit) {
        firstCommit = false;
        originalSession.add(this);
        throw new mongo.MongoNetworkError('No commit acknowledgement');
      }
      if (originalSession.has(this)) {
        startRetry();
        await mayRetry;
      }
      await commit.call(this);
    });
  const send = (payload = input) => repo.append(payload, () => 1000);
  try {
    expect(textErrorCode(await send().catch((error: unknown) => error))).toBe(
      'DEPENDENCY_UNAVAILABLE',
    );
    await retryStarted;
    expect(textErrorCode(await send().catch((error: unknown) => error))).toBe(
      'DEPENDENCY_UNAVAILABLE',
    );
    await expect(send({ ...input, text: 'Changed payload' })).resolves.toEqual({
      outcome: 'conflict',
    });
    for (const conversationId of [conversation._id, other.conversation._id]) {
      const failure = await send({ ...input, conversationId, clientMessageId: randomUUID() }).catch(
        (error: unknown) => error,
      );
      expect(textErrorCode(failure)).toBe('SERVER_BUSY');
    }
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(0);
    release();
    await vi.waitFor(async () => {
      expect(await send()).toMatchObject({ outcome: 'existing', message: { commitSeq: 1 } });
    });
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
  } finally {
    release();
    spy.mockRestore();
  }
});

type MongoErrorEvidence = {
  name: string;
  code?: string | number | undefined;
  labels?: string[] | undefined;
  cause?: MongoErrorEvidence | undefined;
};

function mongoErrorEvidence(error: unknown): MongoErrorEvidence {
  if (!(error instanceof Error)) return { name: typeof error };
  const mongoError = error instanceof mongo.MongoError ? error : undefined;
  return {
    name: error.name,
    code: mongoError?.code,
    labels: mongoError?.errorLabels,
    cause: error.cause instanceof Error ? mongoErrorEvidence(error.cause) : undefined,
  };
}

it.runIf(trialWithFaults).each(['commitTransaction', 'abortTransaction'] as const)(
  'measures commit and cleanup with the shared trial pool: %s',
  async (phase) => {
    const { owner, workspace, channel, conversation } = await textChannel();
    const admin = database.connection.db!.admin();
    diagnosingTransactions = true;
    // A test-only observer stays independent of the application pool under fault.
    const observer = new mongo.MongoClient(testReplicaUri(name), {
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 1000,
      socketTimeoutMS: 1000,
    });
    async function observe(point: string) {
      try {
        const operations = await observer
          .db('admin')
          .aggregate(
            [
              { $currentOp: { allUsers: true, idleSessions: true } },
              { $match: { transaction: { $exists: true } } },
              {
                $project: {
                  _id: 0,
                  active: 1,
                  waitingForLock: 1,
                  lsid: 1,
                  'transaction.parameters.txnNumber': 1,
                  'transaction.timeOpenMicros': 1,
                  'transaction.timeInactiveMicros': 1,
                },
              },
            ],
            { maxTimeMS: 700 },
          )
          .toArray();
        console.info('SCRUM42_MONGOD %s %s', point, JSON.stringify(operations));
      } catch (error) {
        console.info('SCRUM42_MONGOD %s %s', point, JSON.stringify(mongoErrorEvidence(error)));
      }
    }
    const originalEnd = mongo.ClientSession.prototype.endSession;
    const sessionSpy = vi
      .spyOn(mongo.ClientSession.prototype, 'endSession')
      .mockImplementation(async function (this: mongo.ClientSession, ...args) {
        mark('endSession:start');
        try {
          await originalEnd.apply(this, args);
        } catch (error) {
          if (tracingTransactions)
            transactionTrace.push({
              ms: transactionTraceMs(),
              endSession: mongoErrorEvidence(error),
            });
          throw error;
        } finally {
          mark('endSession:done');
        }
      });
    try {
      const payload = { clientMessageId: randomUUID(), text: phase };
      const insert =
        phase === 'abortTransaction'
          ? vi
              .spyOn(Message.collection, 'insertOne')
              .mockRejectedValueOnce(new Error('fixture insert failure'))
          : undefined;
      await admin.command({
        configureFailPoint: 'failCommand',
        mode: phase === 'commitTransaction' ? { skip: 1 } : { times: 1 },
        data: { failCommands: [phase], blockConnection: true, blockTimeMS: 2000 },
      });
      transactionTrace.length = 0;
      transactionTraceStarted = performance.now();
      tracingTransactions = true;
      const finishTrace = beginTrace();
      try {
        await expect(trialService.send(identity(owner), channel.id, payload)).rejects.toThrow();
      } finally {
        finishTrace(phase);
        insert?.mockRestore();
        // A local socket timeout can happen while the synthetic server delay is
        // still active. Let the fault drain before touching the test harness.
        await observe(phase + ':local-settled');
        await delay(2100);
        await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
      }
      await observe(phase + ':fault-off');
      const commandCount = trace.filter(({ event }) => event === 'start:' + phase).length;
      expect(commandCount).toBeGreaterThanOrEqual(phase === 'commitTransaction' ? 2 : 1);
      await coordinator.run({ workspaceId: workspace.id }, () => undefined, { noWait: true });
      expect(coordinator.stats().operations).toBe(0);
      expect(trace.at(-1)?.event).toBe('slot-released');
      const key = { conversationId: conversation._id, clientMessageId: payload.clientMessageId };
      const retryAt = performance.now();
      let transientFailures = 0;
      let reply: Awaited<ReturnType<typeof trialService.send>> | undefined;
      for (let attempt = 0; attempt < 16; attempt++) {
        try {
          reply = await trialService.send(identity(owner), channel.id, payload);
          break;
        } catch (error) {
          if (textErrorCode(error) !== 'DEPENDENCY_UNAVAILABLE') throw error;
          transientFailures++;
          transactionTrace.push({
            ms: transactionTraceMs(),
            attempt: attempt + 1,
            error: mongoErrorEvidence(error),
          });
          if (attempt === 0 || attempt === 15) await observe(phase + ':retry-' + (attempt + 1));
          await delay(750);
        }
      }
      console.info(
        'SCRUM42_RETRY %s failures=%d settled=%dms outcome=%s',
        phase,
        transientFailures,
        Math.round(performance.now() - retryAt),
        reply?.outcome,
      );
      console.info('SCRUM42_TRANSACTIONS %s %s', phase, JSON.stringify(transactionTrace));
      tracingTransactions = false;
      expect(reply).toBeDefined();
      if (recoveryTrial && phase === 'commitTransaction') {
        const commits = transactionTrace.flatMap((event) =>
          'commandName' in event &&
          event.commandName === 'commitTransaction' &&
          'lsid' in event &&
          'txnNumber' in event &&
          typeof event.lsid === 'string'
            ? [{ lsid: event.lsid, txnNumber: event.txnNumber }]
            : [],
        );
        const writeCommit = commits[1];
        expect(writeCommit).toBeDefined();
        expect(commits.slice(2)).toEqual(expect.arrayContaining([writeCommit]));
        expect(reply?.outcome).toBe('existing');
      }
      expect(await trialService.send(identity(owner), channel.id, payload)).toEqual({
        outcome: 'existing',
        message: reply?.message,
      });
      expect(await Message.countDocuments(key)).toBe(1);
      expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
      expect((await Conversation.findById(conversation._id).orFail()).lastMessageCommitSeq).toBe(1);
      if (trialLedger) {
        expect(
          await database.connection
            .db!.collection(textSendLedgerIndex.collection)
            .countDocuments({ conversationId: conversation._id }),
        ).toBe(0);
      }
    } finally {
      tracingTransactions = false;
      sessionSpy.mockRestore();
      await observer.close();
    }
  },
  45_000,
);

it.runIf(trialWithFaults)(
  'retries the original commit on the live driver session before ending it',
  async () => {
    const { owner, channel, conversation } = await textChannel();
    const payload = { clientMessageId: randomUUID(), text: 'same transaction commit retry' };
    const admin = database.connection.db!.admin();
    const commit = mongo.ClientSession.prototype.commitTransaction;
    const client = database.connection.getClient();
    const commits: { session: string; transaction: string; majority: boolean }[] = [];
    const recordCommit = ({ command, commandName }: mongo.CommandStartedEvent) => {
      if (commandName !== 'commitTransaction') return;
      commits.push({
        session: command.lsid.id.toUUID().toString(),
        transaction: command.txnNumber.toString(),
        majority: command.writeConcern?.w === 'majority',
      });
    };
    let retried = false;
    let calls = 0;
    const spy = vi
      .spyOn(mongo.ClientSession.prototype, 'commitTransaction')
      .mockImplementation(async function (this: mongo.ClientSession) {
        if (++calls === 2) {
          await admin.command({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { failCommands: ['commitTransaction'], closeConnection: true },
          });
        }
        try {
          await commit.call(this);
        } catch (error) {
          expect(error).toBeInstanceOf(mongo.MongoNetworkError);
          expect(this.hasEnded).toBe(false);
          expect(this.inTransaction()).toBe(false);
          expect(retried).toBe(false);
          retried = true;
          const started = performance.now();
          await commit.call(this);
          console.info(
            'SCRUM42_SAME_COMMIT retry acknowledged in %d ms',
            Math.round(performance.now() - started),
          );
        }
      });
    client.on('commandStarted', recordCommit);
    try {
      const sent = await trialService.send(identity(owner), channel.id, payload);
      expect(retried).toBe(true);
      expect(commits).toHaveLength(3);
      expect(commits[1]).toEqual(commits[2]);
      expect(commits[0]).not.toEqual(commits[1]);
      expect(commits[2]?.majority).toBe(true);
      expect(sent).toMatchObject({ outcome: 'created', message: { commitSeq: 1 } });
      expect(
        await Message.countDocuments({ conversationId: conversation._id }).readConcern('majority'),
      ).toBe(1);
      expect(await trialService.send(identity(owner), channel.id, payload)).toMatchObject({
        outcome: 'existing',
        message: { commitSeq: 1 },
      });
    } finally {
      client.off('commandStarted', recordCommit);
      spy.mockRestore();
      await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
    }
  },
  15_000,
);

it.runIf(trialWithFaults)('measures pool saturation without holding a Workspace gate', async () => {
  const { owner, channel } = await textChannel();
  const admin = database.connection.db!.admin();
  await admin.command({
    configureFailPoint: 'failCommand',
    mode: { times: 2 },
    data: { failCommands: ['find'], blockConnection: true, blockTimeMS: 1000 },
  });
  const finishTrace = beginTrace();
  const fillers = Promise.allSettled([User.findOne().exec(), User.findOne().exec()]);
  try {
    await vi.waitFor(
      () => expect(trace.filter(({ event }) => event === 'start:find')).toHaveLength(2),
      { interval: 5 },
    );
    const failure = await trialService
      .send(identity(owner), channel.id, {
        clientMessageId: randomUUID(),
        text: 'pool fixture',
      })
      .catch((error: unknown) => error);
    expect(textErrorCode(failure)).toBe('DEPENDENCY_UNAVAILABLE');
    expect(trace.some(({ event }) => event === 'checkout:failed')).toBe(true);
    expect(trace.some(({ event }) => event === 'workspace:acquired')).toBe(false);
    expect(trace.at(-1)?.event).toBe('slot-released');
  } finally {
    finishTrace('checkout');
    await fillers;
    await delay(1100);
    await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
  }
  expect(
    await trialService.send(identity(owner), channel.id, {
      clientMessageId: randomUUID(),
      text: 'pool recovered',
    }),
  ).toMatchObject({ outcome: 'created' });
});

it.runIf(scrum42Trial)(
  'measures real session deny behind FIFO work while requests continue arriving',
  async () => {
    const { owner, workspace, channel } = await textChannel();
    const actor = identity(owner);
    const revoke = createSessionRevocation(
      database,
      () => true,
      revocation,
      () => undefined,
    );
    const scope = { userId: owner.user.id, workspaceId: workspace.id };
    const order: string[] = [];
    const finishTrace = beginTrace();
    let unblock!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocker = coordinator.run(scope, async () => {
      entered();
      await new Promise<void>((resolve) => {
        unblock = resolve;
      });
    });
    await entry;
    const queued = [1, 2, 3].map((i) =>
      coordinator.run(scope, async () => {
        await User.exists({ _id: owner.user._id });
        await delay(60);
        order.push('before-' + i);
      }),
    );
    const allQueued = Promise.allSettled(queued);
    let request: Promise<unknown> | undefined;
    let arrivalsSettled: Promise<unknown> | undefined;
    try {
      await vi.waitFor(() => expect(coordinator.stats().pending).toBe(3), { interval: 5 });
      const requestedAt = performance.now();
      mark('revoke:requested');
      request = revoke.revoke(actor).catch((error: unknown) => error);
      await vi.waitFor(() => expect(coordinator.stats().pending).toBe(4), { interval: 5 });
      const queuedService = createTextService(
        database,
        coordinator,
        access,
        () => true,
        secret,
        {
          ...budget,
          process: { ...budget.process, queued: 3 },
          handlers: { text: { ...handler, processQueued: 3, perUserInFlight: 3 } },
        },
        mark,
      );
      const allArrivals = Promise.allSettled(
        [1, 2, 3].map((i) =>
          delay(20 * i).then(async () => {
            await expect(
              queuedService.send(actor, channel.id, {
                clientMessageId: randomUUID(),
                text: 'arriving during revoke',
              }),
            ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
            order.push('after-' + i);
          }),
        ),
      );
      arrivalsSettled = allArrivals;
      unblock();
      await vi.waitFor(() => expect(revocation.isSessionDenied(actor)).toBe(true), { interval: 5 });
      mark('revoke:deny-observed');
      console.info('SCRUM42_DENY after %d ms', Math.round(performance.now() - requestedAt));
      expect((await allArrivals).map(({ status }) => status)).toEqual([
        'fulfilled',
        'fulfilled',
        'fulfilled',
      ]);
      expect(order).toEqual(['before-1', 'before-2', 'before-3', 'after-1', 'after-2', 'after-3']);
      await expect(
        trialService.send(actor, channel.id, { clientMessageId: randomUUID(), text: 'denied' }),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    } finally {
      unblock();
      await blocker;
      await allQueued;
      await request;
      await arrivalsSettled;
      finishTrace('revoke-fifo');
    }
    expect(coordinator.stats().operations).toBe(0);
  },
);

// Characterization only: observing an old send after deny confirms the open P2.
it.runIf(trialWithFaults && process.env.COLEARNIA_TEST_REVOKE_COMMIT_RACE === '1')(
  'reproduces a write appearing after session deny when commit loses its ACK',
  async () => {
    const admin = database.connection.db!.admin();
    const summaries = [];
    const { transactionLifetimeLimitSeconds } = await admin.command({
      getParameter: 1,
      transactionLifetimeLimitSeconds: 1,
    });
    expect(transactionLifetimeLimitSeconds).toBe(60);
    {
      const blockTimeMS = 900;
      const executionMs = 5000;
      const queryTimeoutMs = 5000;
      const { owner, channel, conversation } = await textChannel();
      const actor = identity(owner);
      const revoke = createSessionRevocation(
        database,
        () => true,
        revocation,
        () => undefined,
      );
      const sends = createTextService(
        database,
        coordinator,
        access,
        () => true,
        secret,
        {
          ...budget,
          database: { ...budget.database, queryTimeoutMs },
          handlers: { text: { ...handler, executionMs } },
        },
        mark,
      );
      const payload = { clientMessageId: randomUUID(), text: 'revoke during pending commit' };
      const key = { conversationId: conversation._id, clientMessageId: payload.clientMessageId };
      await admin.command({
        configureFailPoint: 'failCommand',
        mode: { skip: 1 },
        data: { failCommands: ['commitTransaction'], blockConnection: true, blockTimeMS },
      });
      const finish = beginTrace();
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started);
      const send = sends.send(actor, channel.id, payload).then(
        (result) => ({ result, ms: elapsed() }),
        (error: unknown) => ({ code: textErrorCode(error), ms: elapsed() }),
      );
      let revokeTask: Promise<unknown> | undefined;
      try {
        await vi.waitFor(
          () =>
            expect(trace.filter(({ event }) => event === 'start:commitTransaction')).toHaveLength(
              2,
            ),
          { interval: 5 },
        );
        const revokeRequestedMs = elapsed();
        mark('revoke:requested');
        revokeTask = revoke.revoke(actor).catch((error: unknown) => error);
        await vi.waitFor(() => expect(revocation.isSessionDenied(actor)).toBe(true), {
          interval: 5,
        });
        const denyObservedMs = elapsed();
        mark('revoke:deny-observed');
        const original = await send;
        expect(original).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
        const atDeny = await Message.findOne(key).readConcern('majority').lean();
        await expect(sends.send(actor, channel.id, payload)).rejects.toMatchObject({
          code: 'AUTH_REQUIRED',
        });
        await expect(
          sends.send(actor, channel.id, { ...payload, clientMessageId: randomUUID() }),
        ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
        const observations = [{ ms: elapsed(), visible: Boolean(atDeny) }];
        // Observe the majority-visible result, then check count/sequence again
        // after the default transaction lifetime has elapsed.
        for (let i = 0; i < 16 && !observations.at(-1)?.visible; i++) {
          await delay(250);
          observations.push({
            ms: elapsed(),
            visible: Boolean(await Message.findOne(key).readConcern('majority').lean()),
          });
        }
        const firstVisible = observations.find(({ visible }) => visible);
        await delay(Math.max(0, transactionLifetimeLimitSeconds * 1000 + 5000 - elapsed()));
        const count = await Message.countDocuments(key).readConcern('majority');
        const seq =
          (await Conversation.findById(conversation._id).readConcern('majority').lean())
            ?.lastMessageCommitSeq ?? 0;
        expect(atDeny).toBeNull();
        expect(firstVisible?.ms).toBeGreaterThan(denyObservedMs);
        expect(count).toBe(1);
        expect(seq).toBe(1);
        expect(coordinator.stats().operations).toBe(0);
        summaries.push({
          blockTimeMS,
          executionMs,
          queryTimeoutMs,
          revokeRequestedMs,
          denyObservedMs,
          original,
          visibleAtDeny: Boolean(atDeny),
          count,
          seq,
          observations,
          finalReadMs: elapsed(),
          transactionLifetimeLimitSeconds,
        });
      } finally {
        await send;
        await revokeTask;
        await delay(blockTimeMS + 100);
        await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
        finish('revoke-during-commit-' + blockTimeMS);
      }
    }
    console.info('SCRUM42_REVOKE_COMMIT %s', JSON.stringify(summaries));
  },
  85_000,
);

const fenceTrial = trialWithFaults && process.env.COLEARNIA_TEST_AUTH_SESSION_FENCE === '1';

function fencedSessionTrial(cleanupTimeoutMs = 500) {
  const control = createAccessRevocationCoordinator({
    coordinator,
    cleanupTimeoutMs,
    maxOperations: 1,
  });
  const policy = createWorkspaceAccessService(database, coordinator, () => true, control.barrier);
  const closed = vi.fn();
  const revoke = createSessionRevocation(database, () => true, control, closed, true);
  const send = createTextService(
    database,
    coordinator,
    policy,
    () => true,
    secret,
    {
      ...budget,
      database: { ...budget.database, queryTimeoutMs: 5000 },
    },
    mark,
    true,
    undefined,
    undefined,
    recoveryOptions,
  );
  return { control, closed, revoke, send };
}

function confirmedCleanup(operationId: string) {
  return { operationId, permissionRevoked: true, pendingInvalidated: true, cleanupPending: false };
}

it.runIf(fenceTrial)(
  'serializes an unacknowledged send before majority-confirmed session revoke',
  async () => {
    const { owner, channel, conversation } = await textChannel();
    const actor = identity(owner);
    const trial = fencedSessionTrial();
    trial.control.bindCleanupAdapters({
      messaging: {
        fence: () => ({ throughResourceGeneration: 1 }),
        revoke: async ({ revocationId }) => ({ status: 'completed', revocationId }),
      },
      live: { revoke: async (event) => confirmedCleanup(event.operationId) },
    });
    const admin = database.connection.db!.admin();
    const lifetime = await admin.command({ getParameter: 1, transactionLifetimeLimitSeconds: 1 });
    expect(lifetime.transactionLifetimeLimitSeconds).toBe(60);
    const payload = { clientMessageId: randomUUID(), text: 'send wins' };
    const key = { conversationId: conversation._id, clientMessageId: payload.clientMessageId };
    await admin.command({
      configureFailPoint: 'failCommand',
      mode: { skip: 1 },
      data: { failCommands: ['commitTransaction'], blockConnection: true, blockTimeMS: 1000 },
    });
    const finish = beginTrace();
    const started = performance.now();
    const send = trial.send.send(actor, channel.id, payload).catch((error: unknown) => error);
    let revoking: Promise<boolean> | undefined;
    try {
      await vi.waitFor(
        () =>
          expect(trace.filter(({ event }) => event === 'start:commitTransaction')).toHaveLength(2),
        { interval: 5 },
      );
      mark('fence-revoke:requested');
      revoking = trial.revoke.revoke(actor);
      await vi.waitFor(() => expect(trial.control.isSessionDenied(actor)).toBe(true), {
        interval: 5,
      });
      mark('fence-revoke:pending-deny');
      expect(textErrorCode(await send)).toBe('DEPENDENCY_UNAVAILABLE');
      const completed = await revoking;
      if (completed) {
        // This observation is made at the first successful response, before polling for the old write.
        expect(await Message.countDocuments(key).readConcern('majority')).toBe(1);
      }
      await vi.waitFor(
        async () => expect(await Message.countDocuments(key).readConcern('majority')).toBe(1),
        { interval: 100, timeout: 4500 },
      );
      expect(await trial.revoke.revoke(actor)).toBe(true);
      mark('fence-revoke:completed-observed');
      expect(
        await AuthSession.findById(owner.session._id)
          .select('+textWriteSerial +textRevokeOperationId')
          .readConcern('majority')
          .lean(),
      ).toMatchObject({
        textWriteSerial: 1,
        textRevokeOperationId: expect.any(String),
        revokedAt: expect.any(Date),
      });
      await expect(trial.send.send(actor, channel.id, payload)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
      expect(
        (await Conversation.findById(conversation._id).readConcern('majority').lean())
          ?.lastMessageCommitSeq,
      ).toBe(1);
      expect(coordinator.stats().operations).toBe(0);
      console.info(
        'SCRUM42_FENCE_SEND_WINS firstRevoke=%s final=%dms pending=%d',
        completed,
        Math.round(performance.now() - started),
        trial.control.metrics().pending,
      );
    } finally {
      await send;
      await revoking?.catch(() => false);
      await delay(1100);
      await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
      finish('session-fence-send-wins');
    }
  },
);

it.runIf(fenceTrial)(
  'keeps deny during cleanup and lost revoke ACK, then blocks stale DB sends',
  async () => {
    const { owner, member, channel, conversation } = await textChannel();
    const actor = identity(owner);
    const trial = fencedSessionTrial(90);
    const resources = new Map([
      [actor.authSessionId, 1],
      [member.session.id, 1],
    ]);
    let releaseOld!: () => void;
    let startedOld!: () => void;
    const entered = new Promise<void>((resolve) => {
      startedOld = resolve;
    });
    const old = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const fence = vi.fn(() => ({ throughResourceGeneration: 1 }));
    const live = vi.fn(async (event: { operationId: string }) => {
      startedOld();
      await old;
      return confirmedCleanup(event.operationId);
    });
    trial.control.bindCleanupAdapters({
      messaging: {
        fence,
        revoke: async ({ revocationId, target, throughResourceGeneration }) => {
          await old;
          if (
            target.kind === 'AUTH_SESSION' &&
            (resources.get(target.authSessionId) ?? Infinity) <= throughResourceGeneration
          )
            resources.delete(target.authSessionId);
          return { status: 'completed', revocationId };
        },
      },
      live: { revoke: live },
    });
    const first = trial.revoke.revoke(actor);
    try {
      await entered;
      expect(await first).toBe(false);
      expect(trial.control.isSessionDenied(actor)).toBe(true);
      expect(trial.control.metrics().pending).toBe(1);
      await expect(trial.revoke.revoke(identity(member))).rejects.toMatchObject({
        code: 'SERVER_BUSY',
      });
      expect(trial.control.isSessionDenied(identity(member))).toBe(false);
      expect(
        await AuthSession.findById(owner.session._id).readConcern('majority').lean(),
      ).toMatchObject({ revokedAt: null });
      const replacement = await AuthSession.create({
        userId: owner.user._id,
        tokenHash: hashAuthToken(randomBytes(32).toString('base64url')),
        expiresAt: new Date(Date.now() + 60_000),
      });
      resources.set(replacement.id, 2);
      releaseOld();
      const update = AuthSession.collection.updateOne.bind(AuthSession.collection);
      const fault = vi
        .spyOn(AuthSession.collection, 'updateOne')
        .mockImplementationOnce(async (...args) => {
          await update(...args);
          throw new mongo.MongoNetworkError('fixture lost revoke ACK');
        });
      try {
        expect(await trial.revoke.logout(owner.authToken)).toBe(false);
      } finally {
        fault.mockRestore();
      }
      const durable = await AuthSession.findById(owner.session._id)
        .select('+textRevokeOperationId')
        .readConcern('majority')
        .lean();
      expect(durable).toMatchObject({
        revokedAt: expect.any(Date),
        textRevokeOperationId: expect.any(String),
      });
      expect(await trial.revoke.logout(owner.authToken)).toBe(true);
      expect(fence).toHaveBeenCalledTimes(1);
      expect(live).toHaveBeenCalledTimes(1);
      expect(trial.control.metrics().pending).toBe(0);
      expect(resources.has(actor.authSessionId)).toBe(false);
      expect(resources.has(replacement.id)).toBe(true);
      expect(resources.has(member.session.id)).toBe(true);
      expect(trial.closed.mock.calls.every(([id]) => id === actor.authSessionId)).toBe(true);
      const payload = { clientMessageId: randomUUID(), text: 'revoke wins' };
      await expect(trial.send.send(actor, channel.id, payload)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
      // Probe the DB fence using a stale admission snapshot, without a second client.
      const repo = createTextMessageRepository(database);
      expect(
        await repo.append({
          ...payload,
          conversationId: conversation._id,
          senderId: owner.user._id,
          createdAt: new Date(),
          fenceAuthSessionId: actor.authSessionId,
        }),
      ).toEqual({ outcome: 'session-denied' });
      expect(
        await Message.countDocuments({ conversationId: conversation._id }).readConcern('majority'),
      ).toBe(0);
      expect(
        (await Conversation.findById(conversation._id).readConcern('majority').lean())
          ?.lastMessageCommitSeq,
      ).toBeUndefined();
      const newActor = {
        ...actor,
        authSessionId: replacement.id,
        expiresAt: replacement.expiresAt.toISOString(),
      };
      expect(await trial.send.send(newActor, channel.id, payload)).toMatchObject({
        outcome: 'created',
        message: { commitSeq: 1 },
      });
      expect(await trial.send.send(newActor, channel.id, payload)).toMatchObject({
        outcome: 'existing',
        message: { commitSeq: 1 },
      });
    } finally {
      releaseOld();
      await first.catch(() => false);
    }
  },
);

it.runIf(fenceTrial)(
  'measures fenced sends alongside shared auth and Workspace reads',
  async () => {
    const { owner, member, workspace, channel, conversation } = await textChannel();
    const setupCreator = {
      database,
      coordinator,
      barrier,
      indexesReady: () => true,
      createConversation: createChannelConversationFactory(database.connection).create,
    };
    const createWorkspace = createWorkspaceCreator(setupCreator);
    const createChannel = createChannelCreator(setupCreator);
    const creator = await account();
    const measured = (fence: boolean) =>
      createTextService(
        database,
        coordinator,
        access,
        () => true,
        secret,
        {
          ...budget,
          process: { ...budget.process, queued: 4 },
          handlers: { text: { ...handler, processQueued: 4 } },
        },
        mark,
        fence,
      );
    for (const [fenced, actors] of [
      [false, [owner, owner]],
      [true, [owner, owner]],
      [false, [owner, member]],
      [true, [owner, member]],
    ] as const) {
      const service = measured(fenced);
      const finish = beginTrace();
      const started = performance.now();
      try {
        const [messages, session, selection, createdChannel] = await Promise.all([
          Promise.all(
            actors.map((actor) =>
              service.send(identity(actor), channel.id, {
                clientMessageId: randomUUID(),
                text: 'shared pool sample',
              }),
            ),
          ),
          readSession(owner.authToken),
          access.openWorkspace(identity(member), workspace.id),
          (async () => {
            const created = await createWorkspace(
              { name: 'Mixed workload', requestId: randomUUID() },
              identity(creator),
            );
            return createChannel(
              {
                name: 'Mixed TEXT',
                type: 'TEXT',
                accessMode: 'WORKSPACE',
                requestId: randomUUID(),
              },
              created.id,
              identity(creator),
            );
          })(),
        ] as const);
        expect(messages).toMatchObject([{ outcome: 'created' }, { outcome: 'created' }]);
        expect(createdChannel).toMatchObject({ name: 'Mixed TEXT', type: 'TEXT' });
        expect(session).toMatchObject({ context: { authSessionId: owner.session.id } });
        expect(selection).toMatchObject({ id: workspace.id });
        console.info(
          'SCRUM42_FENCE_LOAD fenced=%s sameSession=%s elapsed=%dms updates=%d',
          fenced,
          actors[0] === actors[1],
          Math.round(performance.now() - started),
          trace.filter(({ event }) => event === 'start:update').length,
        );
      } finally {
        finish('session-fence-load');
      }
    }
    expect(
      await Message.countDocuments({ conversationId: conversation._id }).readConcern('majority'),
    ).toBe(8);
    expect(
      (await Conversation.findById(conversation._id).readConcern('majority').lean())
        ?.lastMessageCommitSeq,
    ).toBe(8);
    expect(coordinator.stats().operations).toBe(0);
  },
);

it.each([false, true])(
  'boots history-only configuration and rejects both send transports (text budget supplied=%s)',
  async (textBudgetSupplied) => {
    const { owner, member, channel, conversation } = await textChannel();
    const outsider = await account();
    await Message.create({
      conversationId: conversation._id,
      senderId: owner.user._id,
      clientMessageId: randomUUID(),
      text: 'Existing history',
      createdAt: new Date(),
      commitSeq: 1,
    });
    await Conversation.updateOne({ _id: conversation._id }, { lastMessageCommitSeq: 1 });
    const socketPort = createServer();
    socketPort.listen(0, '127.0.0.1');
    await once(socketPort, 'listening');
    const address = socketPort.address();
    if (!address || typeof address === 'string') throw new Error('Missing reserved port');
    const port = address.port;
    await new Promise<void>((done) => socketPort.close(() => done()));
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(new URL('../src/main.ts', import.meta.url))],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(port),
          SESSION_SECRET: secret,
          MONGO_URI: testReplicaUri(name),
          MEDIA_ENABLED: 'false',
          APP_ORIGIN: config.APP_ORIGIN,
          MESSAGING_BUDGET_JSON: JSON.stringify({
            ...budget,
            handlers: {
              history: budget.handlers.history,
              ...(textBudgetSupplied ? { text: handler } : {}),
            },
          }),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let startupError = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      startupError += chunk;
    });
    const base = 'http://127.0.0.1:' + port;
    const path = '/api/v1/channels/' + channel.id + '/messages';
    const socket = connect(base, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: config.APP_ORIGIN, Cookie: member.cookie },
      auth: { csrfToken: member.token },
    });
    const read = () => request(base).get(path).set('Cookie', member.cookie);
    try {
      await vi.waitFor(
        async () => {
          expect(child.exitCode, startupError).toBeNull();
          const response = await read();
          expect(response.status).toBe(200);
        },
        { timeout: 12_000, interval: 100 },
      );
      const page = await read().expect(200).expect('Cache-Control', 'no-store');
      expect(page.body.data.items[0]?.text).toBe('Existing history');
      await read().query({ cursor: 'tampered' }).expect(400).expect('Cache-Control', 'no-store');
      await request(base).get(path).set('Cookie', outsider.cookie).expect(404);
      const payload = { clientMessageId: randomUUID(), text: 'Must stay disabled' };
      const post = await request(base)
        .post(path)
        .set('Cookie', member.cookie)
        .set('Origin', config.APP_ORIGIN)
        .set('X-CSRF-Token', member.token)
        .send(payload)
        .expect(503);
      expect(post.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
      const connected = new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      socket.connect();
      await connected;
      expect(
        await socket.timeout(3000).emitWithAck('message.send', {
          requestId: randomUUID(),
          payload: { channelId: channel.id, ...payload },
        }),
      ).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
      expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
      expect((await Conversation.findById(conversation._id).orFail()).lastMessageCommitSeq).toBe(1);
      const privateChannel = await Channel.create({
        workspaceId: channel.workspaceId,
        name: 'Private history',
        type: 'TEXT',
        accessMode: 'PRIVATE',
      });
      await request(base)
        .get('/api/v1/channels/' + privateChannel.id + '/messages')
        .set('Cookie', owner.cookie)
        .expect(403)
        .expect('Cache-Control', 'no-store');
    } finally {
      socket.disconnect();
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    }
  },
  20_000,
);

it
  .runIf(!scrum42Trial && process.env.COLEARNIA_TEST_DB_FAILPOINTS === '1')
  .each(['commitTransaction', 'abortTransaction'])(
  'history snapshot avoids blocked %s and releases its gate',
  async (command) => {
    const { owner, workspace, channel } = await textChannel();
    const executionMs = 650;
    const historyOnly = createTextService(
      database,
      coordinator,
      access,
      () => true,
      secret,
      {
        ...budget,
        handlers: { history: { ...budget.handlers.history, executionMs } },
      },
      mark,
    );
    const admin = database.connection.db!.admin();
    const fault = await admin.command({
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: { failCommands: [command], blockConnection: true, blockTimeMS: 2000 },
    });
    const commit = vi.spyOn(mongo.ClientSession.prototype, 'commitTransaction');
    const abort = vi.spyOn(mongo.ClientSession.prototype, 'abortTransaction');
    const end = vi.spyOn(mongo.ClientSession.prototype, 'endSession');
    const started = performance.now();
    try {
      expect((await historyOnly.history(identity(owner), channel.id, { limit: 1 })).items).toEqual(
        [],
      );
      const finished = performance.now() - started;
      await coordinator.run({ workspaceId: workspace.id }, () => undefined, { noWait: true });
      const gate = performance.now() - started;
      expect(gate).toBeLessThan(executionMs + 400);
      expect(commit).not.toHaveBeenCalled();
      expect(abort).not.toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
      expect(coordinator.stats().operations).toBe(0);
      const stopped = await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
      expect(Number(stopped.count)).toBe(Number(fault.count));
      console.info(
        'HISTORY_SNAPSHOT %s response=%dms gate=%dms no transaction command',
        command,
        Math.round(finished),
        Math.round(gate),
      );
    } finally {
      commit.mockRestore();
      abort.mockRestore();
      end.mockRestore();
      await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
    }
  },
);

it('history snapshot keeps one read timestamp across ACL document changes', async () => {
  const { workspace } = await textChannel();
  const expires = performance.now() + 1000;
  await database.snapshotRead(
    async (session) => {
      const first = await Workspace.findById(workspace._id).session(session).lean().orFail();
      await Workspace.updateOne(
        { _id: workspace._id },
        { name: 'Updated after snapshot' },
        { writeConcern: { w: 'majority' } },
      );
      const second = await Workspace.findById(workspace._id).session(session).lean().orFail();
      expect(second.name).toBe(first.name);
    },
    () => Math.max(1, expires - performance.now()),
  );
  expect((await Workspace.findById(workspace._id).orFail()).name).toBe('Updated after snapshot');
});
