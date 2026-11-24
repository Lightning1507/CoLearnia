import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io } from 'socket.io-client';
import { textConversationSubscribeAckSchema } from '@colearnia/contracts';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  setup,
  initializeDatabase,
  disposeFixtures,
  closeDatabase,
  database,
  config,
  origin,
  registerDisposer,
} from './main-auth-media-harness.js';
import { workspaceCreationIndexRequirements } from '../src/workspaces/create-workspace.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { conversationModel } from '../src/messaging/conversation.js';
import { createTextMessageRepository } from '../src/messaging/text-message.js';

beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);

it('serves authenticated MAIN and TEXT history through the shared application entry', async () => {
  // This fixture supplies test identities/schema only. All requests below go to
  // a separate main.ts process, not to the fixture's application services.
  const f = await setup();
  const member = await f.signUp();
  const db = database.connection.db!;
  for (const name of ['conversations', 'auditEvents']) {
    if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  }
  for (const { collection, key, ...options } of workspaceCreationIndexRequirements)
    await db.collection(collection).createIndex(key, options);
  const reserve = createServer();
  await new Promise<void>((done) => reserve.listen(0, '127.0.0.1', done));
  const address = reserve.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((done) => reserve.close(() => done()));
  const root = resolve(import.meta.dirname, '..');
  const handler = {
    processInFlight: 4,
    processQueued: 4,
    processBytes: 4_000_000,
    perUserInFlight: 2,
    perScopeInFlight: 4,
    payloadBytes: 32768,
    queueWaitMs: 1000,
    executionMs: 5000,
  };
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(root, 'src/main.ts')], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: origin,
      SESSION_SECRET: config.SESSION_SECRET!,
      MONGO_URI: database.connection.getClient().options.hosts.length
        ? `mongodb://127.0.0.1:${process.env.COLEARNIA_DB_TEST_PORT ?? '27017'}/${database.connection.name}?replicaSet=rs0&directConnection=true`
        : '',
      MEDIA_ENABLED: 'true',
      MEDIA_LISTEN_IP: '127.0.0.1',
      MEDIA_ANNOUNCED_ADDRESS: '127.0.0.1',
      MEDIA_PORT: '40189',
      TEXT_SYNC_LIMITS_JSON: JSON.stringify({
        subscriptions: 32,
        perUser: 4,
        leaseMs: 60_000,
        revocationRecords: 128,
      }),
      MESSAGING_BUDGET_JSON: JSON.stringify({
        process: { inFlight: 8, queued: 8, bytes: 16_000_000 },
        database: { maxPoolSize: 10, waitQueueTimeoutMs: 5000, queryTimeoutMs: 2000 },
        revocation: { reservedInFlight: 1, cleanupBatchSize: 8, executionMs: 1000 },
        handlers: { history: handler, subscription: handler, text: handler },
      }),
      TURN_KEY_ID: '',
      TURN_KEY_API_TOKEN: '',
    },
  });
  // Never print process logs: auth/provider environment may contain secrets.
  child.stdout?.resume();
  child.stderr?.resume();
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  registerDisposer(async () => {
    child.kill();
    await exited;
  });
  const http = request(`http://127.0.0.1:${port}`);
  await vi.waitFor(
    async () => {
      if (child.exitCode !== null) throw new Error(`Application exited: ${child.exitCode}`);
      const response = await http.get('/health/ready');
      expect(response.status).toBe(200);
    },
    { timeout: 15_000, interval: 100 },
  );
  const response = await http
    .post(`/api/v1/channels/${f.channel.id}/live-session/join`)
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({ requestId: randomUUID() })
    .expect(200);
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    extraHeaders: { Origin: origin, Cookie: f.host.cookie },
    auth: { csrfToken: f.host.data.csrfToken },
    reconnection: false,
    autoConnect: false,
  });
  registerDisposer(async () => {
    socket.disconnect();
  });
  await new Promise<void>((done, reject) => {
    socket.once('connect', done);
    socket.once('connect_error', reject);
    socket.connect();
  });

  const workspace = await http
    .post('/api/v1/workspaces')
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({ requestId: randomUUID(), name: 'TEXT entry integration' })
    .expect(201);
  const workspaceId = workspace.body.data.id;
  const { Channel } = channelModels(database.connection);
  const general = await Channel.findOne({ workspaceId, name: 'general', type: 'TEXT' }).orFail();
  const conversation = await conversationModel(database.connection)
    .findOne({ workspaceId, kind: 'CHANNEL', 'scope.channelId': general._id })
    .orFail();
  const { Membership } = workspaceModels(database.connection);
  await Membership.create({
    workspaceId,
    userId: member.auth.userId,
    role: 'MEMBER',
    joinedAt: new Date(),
  });
  // Seed a committed history row in the disposable database. Main's write gate stays closed.
  const seeded = await createTextMessageRepository(database).append({
    conversationId: conversation._id,
    senderId: workspace.body.data.ownerId,
    clientMessageId: randomUUID(),
    text: 'existing general message',
    createdAt: new Date(),
  });
  expect(seeded.outcome).toBe('created');
  const messagesPath = `/api/v1/channels/${general.id}/messages`;
  const subscribed = textConversationSubscribeAckSchema.parse(
    await socket.timeout(5000).emitWithAck('conversation.subscribe', {
      requestId: randomUUID(),
      payload: { channelId: general.id, rootMessageId: null },
    }),
  );
  if ('error' in subscribed) throw new Error(subscribed.error.code);
  const snapshot = await http
    .get(messagesPath)
    .set('Cookie', f.host.cookie)
    .query({
      mode: 'snapshot',
      syncToken: subscribed.data.syncToken,
      throughCheckpoint: subscribed.data.throughCheckpoint,
      limit: 10,
    })
    .expect(200);
  expect(snapshot.body.data.items).toMatchObject([
    { text: 'existing general message', commitSeq: 1 },
  ]);
  const send = { clientMessageId: randomUUID(), text: 'staging feature gate regression' };
  const assertRestSendDenied = (status: number) =>
    http
      .post(messagesPath)
      .set('Origin', origin)
      .set('Cookie', f.host.cookie)
      .set('X-CSRF-Token', f.host.data.csrfToken)
      .send(send)
      .expect(status);
  await assertRestSendDenied(503);
  expect(
    await socket.timeout(5000).emitWithAck('message.send', {
      requestId: randomUUID(),
      payload: { channelId: general.id, ...send },
    }),
  ).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
  const joined = await socket
    .timeout(5000)
    .emitWithAck('session.join', { requestId: randomUUID(), ticket: response.body.data.ticket });
  expect(joined.data?.status).toBe('completed');
  const context = {
    sessionId: response.body.data.sessionId,
    epoch: response.body.data.epoch,
    callGeneration: joined.data.result.callGeneration,
    expectedPolicyRevision: 1,
  };
  const transport = await socket.timeout(5000).emitWithAck('media.transport.create', {
    requestId: randomUUID(),
    ...context,
    payload: { direction: 'SEND' },
  });
  expect(transport.data?.status).toBe('completed');
  const proof = await socket.timeout(5000).emitWithAck('media.httpContext.issue', {
    requestId: randomUUID(),
    ...context,
    payload: {},
  });
  expect(proof.data?.status).toBe('completed');
  await http
    .get(`/api/v1/live-sessions/${context.sessionId}/media/bootstrap`)
    .set('Cookie', f.host.cookie)
    .set('X-Media-Context', proof.data.result.token)
    .query({ epoch: context.epoch, callGeneration: context.callGeneration })
    .expect(200);
  const ice = () =>
    http
      .post(`/api/v1/live-sessions/${context.sessionId}/media/ice-credentials`)
      .set('Origin', origin)
      .set('Cookie', f.host.cookie)
      .set('X-CSRF-Token', f.host.data.csrfToken)
      .send({
        requestId: randomUUID(),
        epoch: context.epoch,
        callGeneration: context.callGeneration,
      });
  await ice().expect(403);
  await ice().set('X-Media-Context', proof.data.result.token).expect(503);
  await http
    .post('/api/v1/auth/logout')
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({})
    .expect(200);
  await vi.waitFor(() => expect(socket.connected).toBe(false));
  await http.get(messagesPath).set('Cookie', f.host.cookie).expect(401);
  await assertRestSendDenied(401);
  const survivor = await http.get(messagesPath).set('Cookie', member.cookie).expect(200);
  expect(survivor.body.data.items).toEqual(snapshot.body.data.items);
}, 30_000);
