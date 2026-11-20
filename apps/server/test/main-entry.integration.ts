import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io } from 'socket.io-client';
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

beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);

it('starts the actual application entry with shared M1/M2 binding and serves authenticated MAIN endpoints', async () => {
  // This fixture supplies test identities/schema only. All requests below go to
  // a separate main.ts process, not to the fixture's application services.
  const f = await setup();
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
      MESSAGING_BUDGET_JSON: '',
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
}, 30_000);
