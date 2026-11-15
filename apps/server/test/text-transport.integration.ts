import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { textMessageHistoryResponseSchema, textMessageSendAckSchema } from '@colearnia/contracts';
import { createApp } from '../src/app.js';
import { csrfCookie } from '../src/auth/csrf.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { authModels } from '../src/auth/models.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { conversationModel } from '../src/messaging/conversation.js';
import { textMessageModel } from '../src/messaging/text-message.js';
import { createTextService } from '../src/messaging/text-service.js';
import { createTextRouter, createTextSocketSend } from '../src/messaging/text-transport.js';
import { createRealtime } from '../src/realtime/server.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { testReplicaUri } from './replica-uri.js';

const name = 'colearnia_test_scrum42_' + randomUUID().replaceAll('-', '');
const database = createDatabase(testReplicaUri(name));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const Conversation = conversationModel(database.connection);
const Message = textMessageModel(database.connection);
const coordinator = createOperationCoordinator();
const { barrier } = createAccessRevocationCoordinator({ coordinator });
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
  process: { inFlight: 6, queued: 0, bytes: 262144 },
  database: { maxPoolSize: 10, waitQueueTimeoutMs: 5000, queryTimeoutMs: 1000 },
  revocation: { reservedInFlight: 1, cleanupBatchSize: 1, executionMs: 1000 },
  handlers: { text: handler, history: handler },
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
  for (const model of [
    User,
    AuthSession,
    Workspace,
    Membership,
    Channel,
    ChannelAccessGrant,
    Conversation,
    Message,
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
afterAll(async () => {
  try {
    await realtime.close();
    if (ownsDatabase && database.connection.name === name) await database.connection.dropDatabase();
  } finally {
    await database.close();
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
    cookie: authCookie + '=' + token + '; ' + csrfCookie + '=' + csrf.cookie,
  };
}

it('shares REST and socket retry keys and enforces current TEXT access for both accounts', async () => {
  const owner = await account();
  const member = await account();
  const outsider = await account();
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
      (await read(owner).query({ limit: 1 }).expect(200)).body,
    ).data;
    expect(page.items[0]?.text).toBe(payload.text);
    expect(page.nextCursor).toBeTruthy();
    const older = await read(member).query({ cursor: page.nextCursor }).expect(200);
    expect(older.body.data.items).toEqual([first.body.data.message]);
    await read(member)
      .query({ cursor: page.nextCursor + 'x' })
      .expect(400);
    await read(outsider).expect(404);
    await coordinator.run({ workspaceId: workspace.id }, async () => {
      const busy = await read(owner).expect(503);
      expect(busy.body.error.code).toBe('SERVER_BUSY');
    });
    await read(owner).expect(200);
    await request(server).get(path).expect(401);
    await AuthSession.updateOne({ _id: member.session._id }, { revokedAt: new Date() });
    expect(await send(payload)).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    await read(member).expect(401);
  } finally {
    socket.disconnect();
  }
});
