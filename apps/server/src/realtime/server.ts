import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AppConfig } from '../config/env.js';

export function createRealtime(httpServer: HttpServer, config: AppConfig) {
  const io = new Server(httpServer, {
    cors: { origin: config.APP_ORIGIN, credentials: true },
    allowRequest: (request, callback) =>
      callback(null, request.headers.origin === config.APP_ORIGIN),
    maxHttpBufferSize: 32 * 1024,
    // connectionStateRecovery deliberately not enabled for private session data.
  });

  // Fail closed until AUTH-01 binds a verified identity and implements session expiration/revocation.
  io.use((_socket, next) => {
    const error = new Error('AUTH_REQUIRED');
    next(error);
  });

  return io;
}
