import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectSocket } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { Socket as ServerSocket } from 'socket.io';
import request from 'supertest';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { Router } from 'express';
import { conversationModel } from '../src/messaging/conversation.js';
import { textMessageModel } from '../src/messaging/text-message.js';
import { createTextService } from '../src/messaging/text-service.js';
import {
  createTextRouter,
  createTextSocketSend,
  createTextSocketSync,
} from '../src/messaging/text-transport.js';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/auth/auth-routes.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { createLogin } from '../src/auth/login.js';
import { authModels } from '../src/auth/models.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { createRegistration } from '../src/auth/registration.js';
import { authCookie } from '../src/auth/session-credentials.js';
import { createSessionRevocation } from '../src/auth/session-revocation.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { startLiveRuntime } from '../src/live/media/live-runtime.js';
import { createTransportSignaling } from '../src/live/media/transport-signaling.js';
import { createMediaBootstrapComposition } from '../src/live/media/media-bootstrap-composition.js';
import { createMainAuthority } from '../src/live/session-manager/main-authority.js';
import { createMainJoinRegistry } from '../src/live/session-manager/main-join-registry.js';
import { attachMainJoinSocket } from '../src/live/session-manager/main-join-signaling.js';
import { attachMainReconnectSocket } from '../src/live/session-manager/main-reconnect-signaling.js';
import { sessionModels } from '../src/live/session-manager/session-models.js';
import { createSessionRepository } from '../src/live/session-manager/session-repository.js';
import { createRealtime } from '../src/realtime/server.js';
import { createSessionConnections } from '../src/realtime/session-connections.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { createWorkspaceRouter } from '../src/workspaces/workspace-routes.js';
import { createWorkspaceCreator } from '../src/workspaces/create-workspace.js';
import { createChannelCreator } from '../src/workspaces/create-channel.js';
import { createChannelConversationFactory } from '../src/messaging/conversation.js';
import { auditModel } from '../src/workspaces/workspace-audit.js';
import { testReplicaUri } from './replica-uri.js';
import {
  authenticatedResponseSchema,
  csrfResponseSchema,
  textConversationSubscribeAckSchema,
  mediaTransportCreateAckSchema,
  sessionJoinAckSchema,
  mediaHttpContextIssueAckSchema,
  mediaBootstrapResponseSchema,
} from '@colearnia/contracts';
import type { SessionCleanupRequest, SessionCleanupResult } from '@colearnia/contracts';

const databaseName = `colearnia_test_scrum88_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const { LiveSession, SessionParticipant } = sessionModels(database.connection);
const Conversation = conversationModel(database.connection);
const Message = textMessageModel(database.connection);
let ownsDatabase = false;
const disposers: (() => Promise<void>)[] = [];
export const origin = 'https://colearnia.example.test';
const baseConfig = loadConfig({
  NODE_ENV: 'test',
  APP_ORIGIN: origin,
  SESSION_SECRET: randomBytes(32).toString('hex'),
  MEDIA_LISTEN_IP: '127.0.0.1',
  MEDIA_ANNOUNCED_ADDRESS: '127.0.0.1',
  MEDIA_PORT: '40188',
});

export async function initializeDatabase() {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  expect((await database.connection.db!.admin().command({ hello: 1 })).setName).toBe('rs0');
  expect(await database.connection.db!.listCollections().toArray()).toHaveLength(0);
  ownsDatabase = true;
  for (const model of [
    User,
    AuthSession,
    Workspace,
    Membership,
    Channel,
    ChannelAccessGrant,
    LiveSession,
    SessionParticipant,
    Conversation,
    Message,
    auditModel(database.connection),
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
}
export async function disposeFixtures() {
  for (const close of disposers.splice(0).reverse()) await close();
}
export async function closeDatabase() {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum88_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
}

function cookies(response: Response) {
  const values = response.headers['set-cookie'] as string[] | undefined;
  if (!values) throw new Error('Missing session cookies');
  return values.map((value) => value.split(';', 1)[0]!).join('; ');
}

// These two test doubles are intentionally NOT used by main.ts. Auth/ACL, Mongo,
// Socket.IO and M3 cleanup are real; M2/M5 cleanup is not integration evidence.
async function isolatedDomainCleanup(value: SessionCleanupRequest): Promise<SessionCleanupResult> {
  const { reason, ...identity } = value;
  void reason;
  return {
    ...identity,
    outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending: false },
  };
}

export async function setup(options: { text?: boolean; origin?: string; port?: number } = {}) {
  const config = { ...baseConfig, APP_ORIGIN: options.origin ?? baseConfig.APP_ORIGIN };
  const origin = config.APP_ORIGIN;
  const coordinator = createOperationCoordinator();
  const revocations = createAccessRevocationCoordinator({ coordinator });
  const access = createWorkspaceAccessService(
    database,
    coordinator,
    () => true,
    revocations.barrier,
    config.SESSION_SECRET,
  );
  const authority = createMainAuthority(database, access, revocations.barrier);
  const readPersisted = createSessionReader(database, () => true);
  const readSession: typeof readPersisted = async (token) => {
    const value = await readPersisted(token);
    return value && !revocations.isSessionDenied(value.context) ? value : null;
  };
  const connections = createSessionConnections((auth) => logout.revoke(auth));
  const logout = createSessionRevocation(database, () => true, revocations, connections.close);
  const httpAuth = createHttpAuth(origin, config.SESSION_SECRET!, readSession);
  const authRouter = createAuthRouter(
    httpAuth,
    createRegistration(database, () => true, 3600),
    createLogin(database, () => true, 3600, coordinator, logout),
    logout.logout,
  );
  const mediaRouter = Router();
  const creation = {
    database,
    coordinator,
    barrier: revocations.barrier,
    indexesReady: () => true,
    createConversation: createChannelConversationFactory(database.connection).create,
  };
  const workspaces = options.text
    ? createWorkspaceRouter(
        httpAuth,
        createWorkspaceCreator(creation),
        access,
        createChannelCreator(creation),
      )
    : undefined;
  const textHandler = {
    processInFlight: 4,
    processQueued: 4,
    processBytes: 4_000_000,
    perUserInFlight: 4,
    perScopeInFlight: 4,
    payloadBytes: 32768,
    queueWaitMs: 1000,
    executionMs: 5000,
  };
  const textService: ReturnType<typeof createTextService> | undefined = options.text
    ? createTextService(
        database,
        coordinator,
        access,
        () => true,
        config.SESSION_SECRET!,
        {
          process: { inFlight: 8, queued: 8, bytes: 16_000_000 },
          database: { maxPoolSize: 10, waitQueueTimeoutMs: 5000, queryTimeoutMs: 2000 },
          revocation: { reservedInFlight: 1, cleanupBatchSize: 8, executionMs: 1000 },
          handlers: { text: textHandler, history: textHandler, subscription: textHandler },
        },
        undefined,
        false,
        { subscriptions: 16, perUser: 4, leaseMs: 60_000, revocationRecords: 16 },
        () =>
          Boolean(
            textService?.syncRevocation &&
            revocations.isMessagingCleanupBound(textService.syncRevocation),
          ),
      )
    : undefined;
  const server = createServer(
    createApp(
      config,
      () => ({ name: 'CoLearnia', database: 'connected', media: 'connected', ready: true }),
      authRouter,
      workspaces,
      mediaRouter,
      textService && createTextRouter(httpAuth, textService),
    ),
  );
  const io = createRealtime(
    server,
    config,
    readSession,
    connections,
    (auth) => !revocations.isSessionDenied(auth),
    textService && createTextSocketSend(textService),
    textService && createTextSocketSync(textService),
  );
  let registry!: ReturnType<typeof createMainJoinRegistry>;
  let transports!: ReturnType<typeof createTransportSignaling>;
  let delayed = false;
  let entered: (() => void) | undefined;
  let release: (() => void) | undefined;
  const native: Awaited<
    ReturnType<Parameters<typeof createTransportSignaling>[0]['createTransport']>
  >[] = [];
  const cleanupRequests: SessionCleanupRequest[] = [];
  const media = await startLiveRuntime(config, {
    closeAdmission() {},
    report() {},
    mountRegistry(runtime) {
      const cleanup = {
        media: {
          revoke: (value: SessionCleanupRequest) => {
            cleanupRequests.push(structuredClone(value));
            return transports.cleanup(value);
          },
        },
        messaging: isolatedDomainCleanup,
        board: isolatedDomainCleanup,
      };
      registry = createMainJoinRegistry({
        coordinator,
        accessRevocations: revocations,
        repository: createSessionRepository(database),
        ...authority,
        createRouter: runtime.createSessionRouter,
        revocationCleanup: cleanup,
        reconnectCleanup: cleanup,
        endCleanup: cleanup,
      });
      transports = createTransportSignaling({
        withContext: registry.withContext,
        createTransport: async (router) => {
          const value = await runtime.createTransport(router);
          native.push(value);
          if (delayed) {
            const wait = new Promise<void>((resolve) => {
              release = resolve;
            });
            entered?.();
            await wait;
          }
          return value;
        },
      });
      return registry;
    },
  });
  revocations.bindCleanupAdapters({
    messaging: textService?.syncRevocation ?? {
      fence: () => ({ throughResourceGeneration: 0 }),
      revoke: async ({ revocationId }) => ({ revocationId, status: 'completed' }),
    },
    live: registry,
  });
  const bootstrap = createMediaBootstrapComposition(config, httpAuth, registry);
  mediaRouter.use(bootstrap.router);
  const errors: string[] = [];
  const disconnectTasks = new Map<string, ReturnType<typeof registry.disconnect>>();
  const lifecycleRegistry: typeof registry = {
    ...registry,
    disconnect(socketId) {
      const task = registry.disconnect(socketId);
      disconnectTasks.set(socketId, task);
      return task;
    },
  };
  io.on('connection', (socket) => {
    const liveSocket = socket as unknown as ServerSocket;
    const readAuth = () =>
      !revocations.isSessionDenied(socket.data.auth) ? socket.data.auth : null;
    attachMainJoinSocket(registry, liveSocket, readAuth);
    attachMainReconnectSocket(lifecycleRegistry, liveSocket, readAuth, (code) => errors.push(code));
    transports.attach(liveSocket);
    bootstrap.attachSocket(liveSocket, readAuth);
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const http = request(server);
  const clients: ClientSocket[] = [];
  disposers.push(async () => {
    release?.();
    for (const socket of clients) socket.disconnect();
    textService?.stop();
    connections.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    registry.close();
    media.close();
  });
  const credentials = new WeakMap<object, { email: string; password: string }>();
  async function accountFrom(response: Response) {
    const data = authenticatedResponseSchema.parse(response.body).data;
    const cookie = cookies(response);
    const token = cookie
      .split('; ')
      .find((value) => value.startsWith(authCookie + '='))!
      .slice(authCookie.length + 1);
    const auth = (await readSession(token))!.context;
    return { data, cookie, auth };
  }
  async function signUp() {
    const input = {
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    };
    const csrf = await http.get('/api/v1/auth/csrf').expect(200);
    const response = await http
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('Cookie', cookies(csrf))
      .set('X-CSRF-Token', csrfResponseSchema.parse(csrf.body).data.csrfToken)
      .send({ ...input, displayName: 'Sinh viên' })
      .expect(201);
    const account = await accountFrom(response);
    credentials.set(account, input);
    return account;
  }
  function requestLogin(account: Awaited<ReturnType<typeof signUp>>, presented = account) {
    const input = credentials.get(account);
    if (!input) throw new Error('Unknown test account');
    return http
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Cookie', presented.cookie)
      .set('X-CSRF-Token', presented.data.csrfToken)
      .send(input);
  }
  async function loginAgain(account: Awaited<ReturnType<typeof signUp>>, presented = account) {
    const input = credentials.get(account)!;
    const response = await requestLogin(account, presented).expect(200);
    const replacement = await accountFrom(response);
    credentials.set(replacement, input);
    return replacement;
  }
  async function loginStandalone(account: Awaited<ReturnType<typeof signUp>>) {
    const input = credentials.get(account);
    if (!input) throw new Error('Unknown test account');
    const csrf = await http.get('/api/v1/auth/csrf').expect(200);
    const response = await http
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Cookie', cookies(csrf))
      .set('X-CSRF-Token', csrfResponseSchema.parse(csrf.body).data.csrfToken)
      .send(input)
      .expect(200);
    const independent = await accountFrom(response);
    credentials.set(independent, input);
    return independent;
  }
  async function connect(account: Awaited<ReturnType<typeof signUp>>) {
    const socket = connectSocket(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: account.cookie, Origin: origin },
      auth: { csrfToken: account.data.csrfToken },
      reconnection: false,
      autoConnect: false,
      timeout: 3000,
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }
  const host = await signUp();
  const workspace = await Workspace.create({ name: 'MAIN integration', ownerId: host.auth.userId });
  const member = async (account: typeof host) =>
    Membership.create({
      workspaceId: workspace.id,
      userId: account.auth.userId,
      role: account === host ? 'OWNER' : 'MEMBER',
      joinedAt: new Date(),
    });
  await member(host);
  const channel = await Channel.create({
    workspaceId: workspace.id,
    name: 'MAIN',
    type: 'LIVE',
    accessMode: 'WORKSPACE',
  });
  const target = { workspaceId: workspace.id, channelId: channel.id };
  const join = async (account: typeof host, socket: ClientSocket) => {
    const ticket = await registry.issue(account.auth, target, { requestId: randomUUID() });
    const command = { requestId: randomUUID(), ticket: ticket.ticket };
    const ack = sessionJoinAckSchema.parse(
      await socket.timeout(5000).emitWithAck('session.join', command),
    );
    if ('error' in ack) throw new Error(`Join failed: ${ack.error.code}`);
    return { ticket, command, result: ack.data.result };
  };
  const disconnect = async (socket: ClientSocket) => {
    const socketId = socket.id!;
    const serverSocket = io.sockets.sockets.get(socketId)!;
    const disconnected = new Promise<void>((resolve) =>
      serverSocket.once('disconnect', () => resolve()),
    );
    socket.disconnect();
    await disconnected;
    // Observe the production listener; the helper must not start cleanup itself.
    const task = disconnectTasks.get(socketId);
    if (!task) throw new Error('Socket disconnect did not start MAIN lifecycle cleanup');
    await task;
    disconnectTasks.delete(socketId);
  };
  return {
    registry,
    coordinator,
    revocations,
    authority,
    target,
    host,
    member,
    channel,
    signUp,
    loginAgain,
    loginStandalone,
    requestLogin,
    connect,
    join,
    disconnect,
    native,
    errors,
    http,
    textService,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cleanupRequests,
    retryOldCleanup: (value: SessionCleanupRequest) => transports.cleanup(value),
    replaySnapshots: async (client: ClientSocket, packets: readonly unknown[]) => {
      const socket = io.sockets.sockets.get(client.id!) as unknown as ServerSocket;
      const delivered = new Promise<void>((resolve) =>
        client.once('test.snapshots.delivered', resolve),
      );
      for (const packet of packets) socket.emit('session.snapshot', packet);
      socket.emit('test.snapshots.delivered');
      await delivered;
    },
    delayNext: () => {
      delayed = true;
      return new Promise<void>((resolve) => {
        entered = resolve;
      });
    },
    release: () => {
      delayed = false;
      release?.();
    },
  };
}

export {
  User,
  Workspace,
  AuthSession,
  Channel,
  Membership,
  ChannelAccessGrant,
  SessionParticipant,
  Conversation,
  Message,
  sessionJoinAckSchema,
  mediaTransportCreateAckSchema,
  mediaHttpContextIssueAckSchema,
  mediaBootstrapResponseSchema,
};
export { textConversationSubscribeAckSchema };
export function registerDisposer(close: () => Promise<void>) {
  disposers.push(close);
}
