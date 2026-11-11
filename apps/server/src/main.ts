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
import { createRealtime } from './realtime/server.js';
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

const status = (): SystemStatus => ({
  name: 'CoLearnia',
  database: database.isConnected() ? 'connected' : 'disconnected',
  media: config.MEDIA_ENABLED ? (media?.isReady() ? 'connected' : 'disconnected') : 'disabled',
  ready:
    !stopping &&
    database.isConnected() &&
    Boolean(media?.isReady()) &&
    (!config.SESSION_SECRET || authIndexesReady),
});

const canUseAuthIndexes = () => authIndexesReady && !stopping;
const readSession = createSessionReader(database, canUseAuthIndexes);
const authRouter = config.SESSION_SECRET
  ? createAuthRouter(
      createHttpAuth(config.APP_ORIGIN, config.SESSION_SECRET, readSession),
      createRegistration(database, canUseAuthIndexes, config.AUTH_TTL_SECONDS),
      createLogin(database, canUseAuthIndexes, config.AUTH_TTL_SECONDS, operationCoordinator),
    )
  : undefined;
const httpServer = createServer(createApp(config, status, authRouter));
const io = createRealtime(httpServer, config, readSession);

async function start() {
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

  if (config.MEDIA_ENABLED) {
    try {
      const { createMediaRuntime: startMedia } = await import('./live/media/runtime.js');
      media = await startMedia(config);
    } catch {
      logger.error(
        'Media worker unavailable; readiness remains 503. Run media:smoke for diagnosis.',
      );
    }
  }

  httpServer.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, 'CoLearnia server listening');
  });
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
