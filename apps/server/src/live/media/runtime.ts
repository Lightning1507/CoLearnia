import { createWorker } from 'mediasoup';
import { randomUUID } from 'node:crypto';
import type { types as MediaTypes } from 'mediasoup';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export const mediaCodecs: MediaTypes.RouterRtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: {} },
];

export type MediaRuntimeFailure = Readonly<{ runtimeId: string; routerIds: readonly string[] }>;

export async function createMediaRuntime(
  config: AppConfig,
  dependencies: {
    createWorker?: () => Promise<MediaTypes.Worker>;
  } = {},
) {
  const worker = await (dependencies.createWorker?.() ?? createWorker({ logLevel: 'warn' }));
  const runtimeId = randomUUID();
  const routers = new Set<string>();
  const listeners = new Set<(event: MediaRuntimeFailure) => void>();
  let failure: MediaRuntimeFailure | undefined;
  let stopping = false;
  function notify(listener: (event: MediaRuntimeFailure) => void) {
    try {
      listener(failure!);
    } catch {
      logger.error('Media failure listener did not accept lifecycle notification');
    }
  }
  worker.observer.on('newrouter', (router) => {
    routers.add(router.id);
    router.observer.once('close', () => {
      // Worker marks itself closed and closes Routers before emitting died.
      // Retain affected IDs until that notification is captured.
      if (!worker.closed) routers.delete(router.id);
    });
  });
  worker.on('died', () => {
    if (stopping || failure) return;
    failure = Object.freeze({ runtimeId, routerIds: Object.freeze([...routers]) });
    logger.error('mediasoup worker died; calls require a new session');
    for (const listener of listeners) notify(listener);
  });
  let webRtcServer: MediaTypes.WebRtcServer;
  try {
    webRtcServer = await worker.createWebRtcServer({
      listenInfos: [
        {
          protocol: 'udp',
          ip: config.MEDIA_LISTEN_IP,
          announcedAddress: config.MEDIA_ANNOUNCED_ADDRESS,
          port: config.MEDIA_PORT,
        },
        {
          protocol: 'tcp',
          ip: config.MEDIA_LISTEN_IP,
          announcedAddress: config.MEDIA_ANNOUNCED_ADDRESS,
          port: config.MEDIA_PORT,
        },
      ],
    });
  } catch (error) {
    worker.close();
    throw error;
  }

  return {
    isReady: () => !stopping && !failure && !worker.closed && !webRtcServer.closed,
    onFailure(listener: (event: MediaRuntimeFailure) => void) {
      listeners.add(listener);
      if (failure) notify(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // The SessionManager will own one Router per authorized LiveSession.
    async createSessionRouter() {
      if (stopping || failure || worker.closed) throw new Error('Media runtime unavailable');
      const router = await worker.createRouter({ mediaCodecs });
      if (stopping || failure || worker.closed) {
        router.close();
        throw new Error('Media runtime unavailable');
      }
      return router;
    },
    createTransport: (router: MediaTypes.Router) =>
      router.createWebRtcTransport({ webRtcServer, enableSctp: false }),
    close() {
      stopping = true;
      listeners.clear();
      worker.close();
      routers.clear();
    },
  };
}
