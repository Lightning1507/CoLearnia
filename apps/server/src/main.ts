import { createServer } from 'node:http';
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
import { createChannelConversationFactory } from './messaging/conversation.js';
import {
  createWorkspaceCreator,
  preflightWorkspaceCreation,
} from './workspaces/create-workspace.js';
import { createWorkspaceRouter } from './workspaces/workspace-routes.js';
import { createRealtime } from './realtime/server.js';
import {
  createColdSessionArtifactGuard,
  createSessionBootstrap,
} from './live/session-manager/session-bootstrap.js';
import type { createMediaRuntime } from './live/media/runtime.js';
import type { SystemStatus } from '@colearnia/contracts';

const config = loadConfig();
const database = createDatabase(config.MONGO_URI, {
  maxPoolSize: config.MONGO_MAX_POOL_SIZE,
  serverSelectionTimeoutMS: config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
  waitQueueTimeoutMS: config.MONGO_WAIT_QUEUE_TIMEOUT_MS,
  socketTimeoutMS: config.MONGO_SOCKET_TIMEOUT_MS,
});
let media: Awaited<ReturnType<typeof createMediaRuntime>> | undefined;
let stopping = false;
let authIndexesReady = false;
let workspaceIndexesReady = false;
let acceptingLiveRuntime = false;
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
    database.isConnected() &&
    Boolean(media?.isReady()) &&
    (!config.SESSION_SECRET || (authIndexesReady && workspaceIndexesReady)),
});

const canUseAuthIndexes = () => authIndexesReady && !stopping;
const readSession = createSessionReader(database, canUseAuthIndexes);
const httpAuth = config.SESSION_SECRET
  ? createHttpAuth(config.APP_ORIGIN, config.SESSION_SECRET, readSession)
  : undefined;
const authRouter = httpAuth
  ? createAuthRouter(
      httpAuth,
      createRegistration(database, canUseAuthIndexes, config.AUTH_TTL_SECONDS),
      createLogin(database, canUseAuthIndexes, config.AUTH_TTL_SECONDS, operationCoordinator),
    )
  : undefined;
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
    )
  : undefined;
const httpServer = createServer(createApp(config, status, authRouter, workspaceRouter));
const io = createRealtime(httpServer, config, readSession);

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
        // SCRUM-88 supplies mountRegistry with real M1/M2/M3/M5 ports through
        // createApplicationMainRegistry (shared deny/cohort and one-time binding).
        // Never substitute a fake authority/cleanup here.
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
  const deadline = setTimeout(() => process.exit(1), 10_000).unref();
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
