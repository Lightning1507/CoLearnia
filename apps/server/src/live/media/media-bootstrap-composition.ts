import type { createHttpAuth } from '../../auth/http-auth.js';
import type { AppConfig } from '../../config/env.js';
import { createCloudflareTurnProvider } from './cloudflare-turn.js';
import { createMediaBootstrap } from './media-bootstrap.js';
import {
  attachMediaBootstrapSocket,
  createMediaBootstrapRouter,
} from './media-bootstrap-routes.js';

export function createMediaBootstrapComposition(
  config: AppConfig,
  auth: ReturnType<typeof createHttpAuth>,
  registry: Parameters<typeof createMediaBootstrap>[0]['registry'],
) {
  const service = createMediaBootstrap({
    registry,
    issueIceServers: createCloudflareTurnProvider(config),
  });
  return {
    router: createMediaBootstrapRouter(auth, service),
    attachSocket: (
      socket: Parameters<typeof attachMediaBootstrapSocket>[0],
      readAuth: Parameters<typeof attachMediaBootstrapSocket>[2],
    ) => attachMediaBootstrapSocket(socket, service, readAuth),
  };
}
