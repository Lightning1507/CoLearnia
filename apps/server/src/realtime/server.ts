import type { AuthenticatedContext } from '@colearnia/contracts';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createCsrf, csrfCookie, readCookie } from '../auth/csrf.js';
import { SessionReadUnavailableError } from '../auth/read-session.js';
import type { createSessionReader } from '../auth/read-session.js';
import { authCookie } from '../auth/session-credentials.js';
import type { AppConfig } from '../config/env.js';
import { logger } from '../lib/logger.js';

type SocketData = { auth: AuthenticatedContext };
type ConnectErrorCode = 'AUTH_REQUIRED' | 'CSRF_INVALID' | 'DEPENDENCY_UNAVAILABLE';

function connectError(code: ConnectErrorCode) {
  return Object.assign(new Error(code), { data: { code } });
}

export function createRealtime(
  httpServer: HttpServer,
  config: AppConfig,
  readSession: ReturnType<typeof createSessionReader>,
) {
  const io = new Server<never, never, never, SocketData>(httpServer, {
    transports: ['websocket'],
    cors: { origin: config.APP_ORIGIN, credentials: true },
    allowRequest: (request, callback) =>
      callback(null, request.headers.origin === config.APP_ORIGIN),
    maxHttpBufferSize: 32 * 1024,
    // connectionStateRecovery deliberately not enabled for private session data.
  });

  const csrf = config.SESSION_SECRET ? createCsrf(config.SESSION_SECRET) : undefined;
  io.use(async (socket, next) => {
    if (!csrf) return next(connectError('AUTH_REQUIRED'));

    const cookies = socket.request.headers.cookie;
    const authToken = readCookie(cookies, authCookie);
    let session;
    try {
      session = await readSession(authToken);
    } catch (error) {
      if (!(error instanceof SessionReadUnavailableError)) {
        logger.error('Unexpected error while checking a Socket.IO session');
      }
      return next(connectError('DEPENDENCY_UNAVAILABLE'));
    }
    if (!session || Date.parse(session.context.expiresAt) <= Date.now()) {
      return next(connectError('AUTH_REQUIRED'));
    }

    const csrfToken: unknown = socket.handshake.auth?.csrfToken;
    if (
      typeof csrfToken !== 'string' ||
      !csrf.validate(readCookie(cookies, csrfCookie), csrfToken, authToken)
    ) {
      return next(connectError('CSRF_INVALID'));
    }

    socket.data.auth = session.context;
    next();
  });

  return io;
}
