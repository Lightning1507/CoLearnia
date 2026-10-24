import { createWorker } from 'mediasoup';
import type { types as MediaTypes } from 'mediasoup';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export const mediaCodecs: MediaTypes.RouterRtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: {} },
];

export async function createMediaRuntime(config: AppConfig) {
  const worker = await createWorker({ logLevel: 'warn' });
  worker.on('died', () => logger.error('mediasoup worker died; calls require a new session'));
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
    isReady: () => !worker.closed && !webRtcServer.closed,
    // The SessionManager will own one Router per authorized LiveSession.
    createSessionRouter: () => worker.createRouter({ mediaCodecs }),
    close: () => worker.close(),
  };
}
