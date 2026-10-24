import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDatabase } from './lib/database.js';
import { logger } from './lib/logger.js';
import { createRealtime } from './realtime/server.js';
import type { createMediaRuntime } from './live/media/runtime.js';
import type { SystemStatus } from '@colearnia/contracts';

const config = loadConfig();
const database = createDatabase(config.MONGO_URI);
let media: Awaited<ReturnType<typeof createMediaRuntime>> | undefined;
let stopping = false;

const status = (): SystemStatus => ({
  name: 'CoLearnia',
  database: database.isConnected() ? 'connected' : 'disconnected',
  media: config.MEDIA_ENABLED ? (media?.isReady() ? 'connected' : 'disconnected') : 'disabled',
  ready: !stopping && database.isConnected() && Boolean(media?.isReady()),
});

const httpServer = createServer(createApp(config, status));
const io = createRealtime(httpServer, config);

async function start() {
  try {
    await database.connect();
  } catch {
    logger.warn('MongoDB unavailable; readiness remains 503. Start the replica set and restart.');
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
  clearTimeout(deadline);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
start().catch(() => {
  logger.fatal('Server startup failed');
  process.exitCode = 1;
});
