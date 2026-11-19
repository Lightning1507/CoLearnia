import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, expect } from 'vitest';
import { textConversationSubscribeAckSchema, type TextHistoryMessage } from '@colearnia/contracts';
import { createApp } from '../src/app.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { authModels } from '../src/auth/models.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { createSessionRevocation } from '../src/auth/session-revocation.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { csrfCookie } from '../src/auth/csrf.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase, defaultDatabaseOptions } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { conversationModel } from '../src/messaging/conversation.js';
import { createTextMessageRepository, textMessageModel } from '../src/messaging/text-message.js';
import { createTextService } from '../src/messaging/text-service.js';
import {
  createTextRouter,
  createTextSocketSend,
  createTextSocketSync,
} from '../src/messaging/text-transport.js';
import { createRealtime } from '../src/realtime/server.js';
import { createSessionConnections } from '../src/realtime/session-connections.js';
import { testReplicaUri } from './replica-uri.js';
import { auditModel } from '../src/workspaces/workspace-audit.js';

const name = 'colearnia_test_scrum43_' + randomUUID().replaceAll('-', '');
const database = createDatabase(testReplicaUri(name), {
  ...defaultDatabaseOptions,
  maxPoolSize: 4,
});
const coordinator = createOperationCoordinator();
const control = createAccessRevocationCoordinator({ coordinator });
const access = createWorkspaceAccessService(database, coordinator, () => true, control.barrier);
const secret = randomBytes(32).toString('hex');
const handler = {
  processInFlight: 4,
  processQueued: 4,
  processBytes: 8_000_000,
  perUserInFlight: 4,
  perScopeInFlight: 4,
  payloadBytes: 32768,
  queueWaitMs: 1000,
  executionMs: 5000,
};
const budget = {
  process: { inFlight: 8, queued: 8, bytes: 16_000_000 },
  database: { maxPoolSize: 4, waitQueueTimeoutMs: 5000, queryTimeoutMs: 2000 },
  revocation: { reservedInFlight: 1, cleanupBatchSize: 8, executionMs: 1000 },
  handlers: { history: handler, subscription: handler },
};
const syncLimits = { subscriptions: 16, perUser: 4, leaseMs: 60_000, revocationRecords: 16 };
const service: ReturnType<typeof createTextService> = createTextService(
  database,
  coordinator,
  access,
  () => true,
  secret,
  budget,
  undefined,
  false,
  syncLimits,
  () => Boolean(service.syncRevocation && control.isMessagingCleanupBound(service.syncRevocation)),
);
// Native messaging cleanup; LIVE authority/resources are explicitly outside this TEXT fixture.
control.bindCleanupAdapters({
  messaging: service.syncRevocation!,
  live: {
    async revoke(event) {
      return {
        operationId: event.operationId,
        permissionRevoked: true,
        pendingInvalidated: true,
        cleanupPending: false,
      };
    },
  },
});
const sessions = createSessionConnections((actor) => revoke.revoke(actor));
const revoke = createSessionRevocation(database, () => true, control, sessions.close);
const config = loadConfig({
  SESSION_SECRET: secret,
  MESSAGING_BUDGET_JSON: JSON.stringify(budget),
});
const readSession = createSessionReader(database, () => true);
const auth = createHttpAuth(config.APP_ORIGIN, secret, readSession);
const server = createServer(
  createApp(
    config,
    () => ({ name: 'CoLearnia', database: 'connected', media: 'disabled', ready: false }),
    undefined,
    undefined,
    undefined,
    createTextRouter(auth, service),
  ),
);
const realtime = createRealtime(
  server,
  config,
  readSession,
  sessions,
  (identity) => !control.isSessionDenied(identity),
  createTextSocketSend(service),
  createTextSocketSync(service),
);
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const Conversation = conversationModel(database.connection);
const Message = textMessageModel(database.connection);
const repository = createTextMessageRepository(database);
let ownsDatabase = false;
const sockets = new Set<Socket>();
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(name);
  ownsDatabase = true;
  expect(await database.connection.db!.admin().command({ hello: 1 })).toMatchObject({
    setName: 'rs0',
    isWritablePrimary: true,
  });
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
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  service.stop();
  sessions.stop();
  await realtime.close();
  try {
    if (ownsDatabase && database.connection.name === name) await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

async function fixture(privateChannel = false) {
  const user = await User.create({
    emailNormalized: randomUUID() + '@example.test',
    displayName: 'Sync fixture',
    passwordHash: 'fixture',
  });
  const token = randomBytes(32).toString('base64url');
  const session = await AuthSession.create({
    userId: user._id,
    tokenHash: hashAuthToken(token),
    expiresAt: new Date(Date.now() + 120_000),
  });
  const identity = {
    userId: user.id,
    authSessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
  };
  const workspace = await Workspace.create({ name: 'Sync test', ownerId: user._id });
  const member = await Membership.create({
    workspaceId: workspace._id,
    userId: user._id,
    role: 'OWNER',
    status: 'ACTIVE',
    incarnation: 1,
    revision: 0,
    joinedAt: new Date(),
    removedAt: null,
  });
  const channel = await Channel.create({
    workspaceId: workspace._id,
    name: 'General',
    type: 'TEXT',
    accessMode: privateChannel ? 'PRIVATE' : 'WORKSPACE',
  });
  const conversation = await Conversation.create({
    workspaceId: workspace._id,
    kind: 'CHANNEL',
    scope: { channelId: channel._id },
  });
  const csrf = auth.issueCsrf(token);
  const cookie = authCookie + '=' + token + '; ' + csrfCookie + '=' + csrf.cookie;
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No port');
  const socket = connect('http://127.0.0.1:' + addr.port, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: config.APP_ORIGIN, Cookie: cookie },
    auth: { csrfToken: csrf.token },
  });
  sockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  async function subscribe(afterCheckpoint?: string) {
    const ack = textConversationSubscribeAckSchema.parse(
      await socket.timeout(5000).emitWithAck('conversation.subscribe', {
        requestId: randomUUID(),
        payload: {
          channelId: channel.id,
          rootMessageId: null,
          ...(afterCheckpoint && { afterCheckpoint }),
        },
      }),
    );
    if ('error' in ack) throw ack.error;
    return ack.data;
  }
  const read = (query: object) =>
    request(server)
      .get('/api/v1/channels/' + channel.id + '/messages')
      .set('Cookie', cookie)
      .query(query);
  // Controlled writer uses the real persistence + shared gate, not enabled production send.
  async function commit(text: string, notify = true) {
    const result = await coordinator.run({ userId: user.id, workspaceId: workspace.id }, () =>
      repository.append({
        conversationId: conversation._id,
        senderId: user._id,
        clientMessageId: randomUUID(),
        text,
        createdAt: new Date('2026-11-18T00:00:00Z'),
      }),
    );
    if (result.outcome !== 'created') throw new Error('Fixture write failed');
    const row = result.message;
    const message: TextHistoryMessage = {
      channelId: channel.id,
      conversationId: conversation.id,
      rootMessageId: null,
      id: row._id.toHexString(),
      senderId: user.id,
      clientMessageId: row.clientMessageId,
      text,
      createdAt: row.createdAt.toISOString(),
      replyCount: 0,
      commitSeq: row.commitSeq!,
    };
    if (notify) await service.publishCommitted(message);
    return message;
  }
  return {
    user,
    session,
    identity,
    workspace,
    member,
    channel,
    conversation,
    cookie,
    csrf,
    authToken: token,
    socket,
    subscribe,
    read,
    commit,
  };
}

export {
  fixture,
  service,
  revoke,
  AuthSession,
  ChannelAccessGrant,
  Message,
  Conversation,
  database,
  coordinator,
  access,
  secret,
  budget,
  syncLimits,
  server,
  config,
  control,
  readSession,
};
