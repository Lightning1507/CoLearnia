import { createServer } from 'node:http';
import { Router } from 'express';
import { createApp } from './app.js';
import { createAuthRouter } from './auth/auth-routes.js';
import { createHttpAuth } from './auth/http-auth.js';
import { createLogin } from './auth/login.js';
import { authIndexRequirements } from './auth/models.js';
import { createSessionReader } from './auth/read-session.js';
import { createRegistration } from './auth/registration.js';
import { loadConfig } from './config/env.js';
import { createDatabase } from './lib/database.js';
import { preflightIndexes } from './lib/database-preflight.js';
import { logger } from './lib/logger.js';
import { operationCoordinator } from './lib/shared-coordination.js';
import { accessRevocations } from './lib/shared-access-revocation.js';
import { createTextService } from './messaging/text-service.js';
import {
  createTextRouter,
  createTextSocketSend,
  createTextSocketSync,
} from './messaging/text-transport.js';
import { textMessageIndexes, textSyncIndexes } from './messaging/text-message.js';
import { createTextSendLedger } from './messaging/text-send-ledger.js';
import { createChannelConversationFactory } from './messaging/conversation.js';
import {
  createWorkspaceCreator,
  preflightWorkspaceCreation,
} from './workspaces/create-workspace.js';
import { createWorkspaceAccessService } from './workspaces/access-service.js';
import { createWorkspaceRouter } from './workspaces/workspace-routes.js';
import { createChannelCreator } from './workspaces/create-channel.js';
import { createSessionRevocation } from './auth/session-revocation.js';
import { createSessionConnections } from './realtime/session-connections.js';
import { createRealtime } from './realtime/server.js';
import {
  createColdSessionArtifactGuard,
  createSessionBootstrap,
} from './live/session-manager/session-bootstrap.js';
import type { createMediaRuntime } from './live/media/runtime.js';
import { createMainRuntime } from './live/main-runtime.js';
import { createApplicationMainRegistry } from './lib/shared-main-registry.js';
import { sessionIndexRequirements } from './live/session-manager/session-models.js';
import type { SystemStatus } from '@colearnia/contracts';

const config = loadConfig();
const database = createDatabase(config.MONGO_URI, {
  maxPoolSize: config.MONGO_MAX_POOL_SIZE,
  serverSelectionTimeoutMS: config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
  waitQueueTimeoutMS: config.MONGO_WAIT_QUEUE_TIMEOUT_MS,
  socketTimeoutMS: config.MONGO_SOCKET_TIMEOUT_MS,
});
const sendRecovery = config.TEXT_SEND_RECOVERY_JSON;
const sendLedger = sendRecovery && createTextSendLedger(database, sendRecovery.maxPending);
let media: Awaited<ReturnType<typeof createMediaRuntime>> | undefined;
let stopping = false;
let authIndexesReady = false;
let workspaceIndexesReady = false;
let textIndexesReady = false;
let textSyncIndexesReady = false;
let textSendReady = !sendLedger;
let acceptingLiveRuntime = false;
let mainRuntime: ReturnType<typeof createMainRuntime> | undefined;
const mediaRouter = Router();
const liveChannelRouter = Router();
liveChannelRouter.use((req, res, next) => {
  if (!mainRuntime && /^\/[^/]+\/live-session\/join\/?$/.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      requestId: res.locals.requestId,
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Cuộc gọi chưa sẵn sàng.' },
    });
    return;
  }
  next();
});
mediaRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!mainRuntime) {
    res.status(503).json({
      requestId: res.locals.requestId,
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Cuộc gọi chưa sẵn sàng.' },
    });
    return;
  }
  next();
});
const sessionBootstrap = createSessionBootstrap(database, {
  isOffline: () => !acceptingLiveRuntime && !stopping,
  prepareStaleSession: createColdSessionArtifactGuard(database),
});

const status = (): SystemStatus => ({
  name: 'CoLearnia',
  database: database.isConnected() ? 'connected' : 'disconnected',
  media: config.MEDIA_ENABLED ? (media?.isReady() ? 'connected' : 'disconnected') : 'disabled',
  ready:
    !stopping &&
    sessionBootstrap.isReady() &&
    textSendReady &&
    database.isConnected() &&
    Boolean(media?.isReady()) &&
    (!config.SESSION_SECRET ||
      (authIndexesReady &&
        workspaceIndexesReady &&
        (!config.TEXT_SYNC_LIMITS_JSON || Boolean(mainRuntime)))),
});

const canUseAuthIndexes = () => authIndexesReady && !stopping;
const readPersistedSession = createSessionReader(database, canUseAuthIndexes);
const readSession: typeof readPersistedSession = async (token) => {
  const session = await readPersistedSession(token);
  return session && !accessRevocations.isSessionDenied(session.context) ? session : null;
};
const connections = createSessionConnections(
  (auth) => sessionRevocation.revoke(auth),
  () => logger.warn('Expired session cleanup has not been confirmed'),
);
const sessionRevocation = createSessionRevocation(
  database,
  canUseAuthIndexes,
  accessRevocations,
  connections.close,
  Boolean(sendLedger),
);
const httpAuth = config.SESSION_SECRET
  ? createHttpAuth(config.APP_ORIGIN, config.SESSION_SECRET, readSession)
  : undefined;
const authRouter = httpAuth
  ? createAuthRouter(
      httpAuth,
      createRegistration(database, canUseAuthIndexes, config.AUTH_TTL_SECONDS),
      createLogin(
        database,
        canUseAuthIndexes,
        config.AUTH_TTL_SECONDS,
        operationCoordinator,
        sessionRevocation,
      ),
      sessionRevocation.logout,
    )
  : undefined;
const workspaceAccess = createWorkspaceAccessService(
  database,
  operationCoordinator,
  () => canUseAuthIndexes() && workspaceIndexesReady,
  accessRevocations.barrier,
  config.SESSION_SECRET,
);
// With no explicit recovery settings the default rollout serves history only.
const messagingBudget = config.MESSAGING_BUDGET_JSON;
const textBudget = messagingBudget && {
  ...messagingBudget,
  handlers: {
    ...(messagingBudget.handlers.history && { history: messagingBudget.handlers.history }),
    ...(messagingBudget.handlers.subscription && {
      subscription: messagingBudget.handlers.subscription,
    }),
    ...(sendLedger && messagingBudget.handlers.text && { text: messagingBudget.handlers.text }),
  },
};
const textService: ReturnType<typeof createTextService> | undefined = config.SESSION_SECRET
  ? createTextService(
      database,
      operationCoordinator,
      workspaceAccess,
      () => canUseAuthIndexes() && workspaceIndexesReady && textIndexesReady,
      config.SESSION_SECRET,
      textBudget,
      undefined,
      Boolean(sendLedger),
      config.TEXT_SYNC_LIMITS_JSON,
      () =>
        Boolean(
          textSyncIndexesReady &&
          textService?.syncRevocation &&
          accessRevocations.isMessagingCleanupBound(textService.syncRevocation),
        ),
      sendRecovery,
      sendLedger,
    )
  : undefined;
const textRouter = httpAuth && textService ? createTextRouter(httpAuth, textService) : undefined;
const workspaceRouter = httpAuth
  ? createWorkspaceRouter(
      httpAuth,
      createWorkspaceCreator({
        database,
        coordinator: operationCoordinator,
        barrier: accessRevocations.barrier,
        indexesReady: () => canUseAuthIndexes() && workspaceIndexesReady,
        createConversation: createChannelConversationFactory(database.connection).create,
      }),
      workspaceAccess,
      createChannelCreator({
        database,
        coordinator: operationCoordinator,
        barrier: accessRevocations.barrier,
        indexesReady: () => canUseAuthIndexes() && workspaceIndexesReady,
        createConversation: createChannelConversationFactory(database.connection).create,
      }),
    )
  : undefined;
const httpServer = createServer(
  createApp(
    config,
    status,
    authRouter,
    workspaceRouter,
    mediaRouter,
    textRouter,
    liveChannelRouter,
  ),
);
const io = createRealtime(
  httpServer,
  config,
  readSession,
  connections,
  (auth) => !accessRevocations.isSessionDenied(auth),
  textService && createTextSocketSend(textService),
  textService && createTextSocketSync(textService),
);
io.on('connection', (socket) => mainRuntime?.attach(socket));

async function start() {
  // Health endpoints respond during cold bootstrap; LIVE stays gated by readiness.
  httpServer.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, 'CoLearnia server listening');
  });
  try {
    await database.connect();
  } catch {
    logger.warn('MongoDB unavailable; readiness remains 503. Start the replica set and restart.');
  }

  if (authRouter && database.isConnected()) {
    try {
      const { ready, issues } = await preflightIndexes(database.connection, authIndexRequirements);
      authIndexesReady = ready;
      if (!ready)
        logger.warn({ issues }, 'Authentication requires the auth indexes before startup.');
    } catch {
      logger.warn('Could not check auth indexes; authentication remains unavailable.');
    }
  }

  if (workspaceRouter && database.isConnected()) {
    try {
      workspaceIndexesReady = await preflightWorkspaceCreation(database);
      if (!workspaceIndexesReady)
        logger.warn('Workspace creation requires its collections and indexes before startup.');
      else logger.info('Workspace creation database preflight passed.');
    } catch {
      logger.warn('Could not check Workspace collections/indexes; creation remains unavailable.');
    }
  }

  if (textService && config.MESSAGING_BUDGET_JSON && database.isConnected()) {
    try {
      const { ready, issues } = await preflightIndexes(database.connection, [
        ...textMessageIndexes,
      ]);
      textIndexesReady = ready;
      if (!ready) logger.warn({ issues }, 'TEXT messaging requires its indexes before startup.');
      if (config.TEXT_SYNC_LIMITS_JSON) {
        textSyncIndexesReady = (await preflightIndexes(database.connection, textSyncIndexes)).ready;
        if (!textSyncIndexesReady)
          logger.warn('TEXT subscriptions require the commit-order index.');
      }
    } catch {
      logger.warn('Could not check TEXT indexes; messaging remains unavailable.');
    }
  }

  if (
    sendLedger &&
    authIndexesReady &&
    workspaceIndexesReady &&
    textIndexesReady &&
    textSyncIndexesReady
  ) {
    const deadline = performance.now() + 30_000;
    try {
      await sendLedger.start(() => {
        const ms = Math.floor(deadline - performance.now());
        if (ms < 1 || stopping) throw new Error('TEXT ledger startup exceeded its deadline');
        return ms;
      });
      textSendReady = true;
    } catch {
      logger.warn('TEXT send ledger is unavailable; write admission and readiness remain closed.');
    }
  }

  if (database.isConnected()) {
    try {
      await sessionBootstrap.run();
      logger.info({ sessions: sessionBootstrap.stats() }, 'Cold session metadata checked.');
    } catch {
      logger.warn(
        'Cold session reconciliation is incomplete; readiness remains 503. Check session indexes and M2/M5 cleanup before restarting.',
      );
    }
  }

  if (!stopping && config.MEDIA_ENABLED && sessionBootstrap.isReady()) {
    acceptingLiveRuntime = true;
    try {
      const { startLiveRuntime } = await import('./live/media/live-runtime.js');
      media = await startLiveRuntime(config, {
        ...(httpAuth && config.TEXT_SYNC_LIMITS_JSON
          ? {
              async mountRegistry(runtime: Awaited<ReturnType<typeof createMediaRuntime>>) {
                if (
                  !httpAuth ||
                  !textService?.syncRevocation ||
                  !authIndexesReady ||
                  !workspaceIndexesReady
                )
                  throw new Error('MAIN requires auth, Workspace indexes and real TEXT cleanup');
                if (!(await preflightIndexes(database.connection, sessionIndexRequirements)).ready)
                  throw new Error('MAIN session indexes must be provisioned before startup');
                mainRuntime = createMainRuntime({
                  config,
                  database,
                  httpAuth,
                  access: workspaceAccess,
                  barrier: accessRevocations.barrier,
                  media: runtime,
                  createRegistry: (input) =>
                    createApplicationMainRegistry(input, textService.syncRevocation!),
                  isReady: () =>
                    acceptingLiveRuntime &&
                    !stopping &&
                    sessionBootstrap.isReady() &&
                    database.isConnected() &&
                    authIndexesReady &&
                    workspaceIndexesReady,
                  isAuthCurrent: (auth) => !accessRevocations.isSessionDenied(auth),
                  report: (code) => logger.warn({ code }, 'MAIN lifecycle requires reconciliation'),
                });
                mediaRouter.use(mainRuntime.mediaRouter);
                liveChannelRouter.use(mainRuntime.channelRouter);
                for (const socket of io.sockets.sockets.values()) mainRuntime.attach(socket);
                return mainRuntime.registry;
              },
            }
          : {}),
        closeAdmission() {
          acceptingLiveRuntime = false;
          logger.error(
            'LIVE runtime admission closed after media worker failure; restart requires cold session reconciliation.',
          );
        },
        report(result) {
          if (result === 'FAILED') logger.error('Worker failure lifecycle could not settle');
        },
      });
      if (stopping) media.close();
    } catch {
      acceptingLiveRuntime = false;
      logger.error(
        'Media worker unavailable; readiness remains 503. Run media:smoke for diagnosis.',
      );
    }
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  textService?.stop();
  const deadline = setTimeout(() => process.exit(1), 10_000).unref();
  connections.stop();
  mainRuntime?.close();
  media?.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await database.close();
  logger.info(
    { coordination: operationCoordinator.stats() },
    'Coordination statistics at shutdown',
  );
  clearTimeout(deadline);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
start().catch(() => {
  logger.fatal('Server startup failed');
  process.exitCode = 1;
});
