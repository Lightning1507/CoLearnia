import type { AuthenticatedContext } from '@colearnia/contracts';
import {
  textMessageCreatedEventSchema,
  textConversationInvalidatedEventSchema,
} from '@colearnia/contracts';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createCsrf, csrfCookie, readCookie } from '../auth/csrf.js';
import { SessionReadUnavailableError } from '../auth/read-session.js';
import type { createSessionReader } from '../auth/read-session.js';
import { authCookie } from '../auth/session-credentials.js';
import type { AppConfig } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { textMessageForClient } from '../messaging/text-transport.js';

import type {
  createTextSocketSend,
  createTextSocketSync,
  TextSocketEvents,
} from '../messaging/text-transport.js';
import type { createSessionConnections } from './session-connections.js';

type SocketData = { auth: AuthenticatedContext };
type ConnectErrorCode = 'AUTH_REQUIRED' | 'CSRF_INVALID' | 'DEPENDENCY_UNAVAILABLE';

function connectError(code: ConnectErrorCode) {
  return Object.assign(new Error(code), { data: { code } });
}

export function createRealtime(
  httpServer: HttpServer,
  config: AppConfig,
  readSession: ReturnType<typeof createSessionReader>,
  connections?: ReturnType<typeof createSessionConnections>,
  checkCurrent?: (auth: AuthenticatedContext) => boolean,
  textSend?: ReturnType<typeof createTextSocketSend>,
  textSync?: ReturnType<typeof createTextSocketSync>,
) {
  type Outgoing = {
    'message.created': (payload: ReturnType<typeof textMessageCreatedEventSchema.parse>) => void;
    'conversation.invalidated': (
      payload: ReturnType<typeof textConversationInvalidatedEventSchema.parse>,
    ) => void;
  };
  const io = new Server<TextSocketEvents, Outgoing, never, SocketData>(httpServer, {
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

  if (connections || textSend || textSync) {
    io.on('connection', (socket) => {
      const auth = socket.data.auth;
      if (Date.parse(auth.expiresAt) <= Date.now() || checkCurrent?.(auth) === false) {
        socket.disconnect(true);
        return;
      }
      const untrack = connections?.track(auth, () => socket.disconnect(true));
      if (untrack) socket.once('disconnect', untrack);
      const includeSenderNames = socket.handshake.auth?.textSenderNames === true;
      if (textSend) socket.on('message.send', textSend(auth, includeSenderNames));
      if (textSync) {
        const sync = textSync(
          auth,
          socket.id,
          (event, payload) => {
            // Never accumulate private events in Socket.IO's disconnected/slow-client buffer.
            if (!socket.connected || !socket.conn.transport.writable) {
              socket.disconnect(true);
              return false;
            }
            if (event === 'message.created') {
              const parsed = textMessageCreatedEventSchema.parse(payload);
              socket.volatile.emit(event, {
                ...parsed,
                message: textMessageForClient(parsed.message, includeSenderNames),
              });
            } else
              socket.volatile.emit(event, textConversationInvalidatedEventSchema.parse(payload));
            return true;
          },
          socket.handshake.auth?.textPersistentSubscription === true,
        );
        let awaitingAck = false;
        let cancelDrain: (() => void) | undefined;
        socket.once('disconnect', () => {
          cancelDrain?.();
          sync.close();
        });
        socket.on('conversation.subscribe', (input, reply) => {
          if (typeof reply !== 'function') return;
          // At most one pending subscribe ACK per socket; no private engine buffers.
          if (awaitingAck) {
            socket.disconnect(true);
            return;
          }
          awaitingAck = true;
          void sync
            .subscribe(input, (result) => {
              if (!socket.connected) return;
              if (socket.conn.transport.writable) {
                awaitingAck = false;
                reply(result);
                return;
              }
              const waitMs = config.MESSAGING_BUDGET_JSON?.handlers.subscription?.executionMs;
              if (!waitMs) {
                socket.disconnect(true);
                return;
              }
              const finish = () => {
                cancelDrain?.();
                awaitingAck = false;
                if (socket.connected) reply(result);
              };
              const deadline = setTimeout(
                () => socket.disconnect(true),
                Math.min(waitMs, 2_147_483_647),
              ).unref();
              cancelDrain = () => {
                clearTimeout(deadline);
                socket.conn.transport.off('drain', finish);
                cancelDrain = undefined;
              };
              socket.conn.transport.once('drain', finish);
            })
            .catch(() => socket.disconnect(true));
        });
        socket.on('conversation.unsubscribe', (input, reply) => {
          if (!socket.conn.transport.writable) {
            socket.disconnect(true);
            return;
          }
          sync.unsubscribe(input, reply);
        });
      }
    });
  }
  return io;
}
