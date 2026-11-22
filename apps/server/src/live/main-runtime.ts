import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type { AuthenticatedContext } from '@colearnia/contracts';
import {
  liveContextRequestSchema,
  requestIdSchema,
  sameSessionScope,
  sessionLeaveInputSchema,
} from '@colearnia/contracts';
import { CoordinationError } from '../lib/operation-coordinator.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../lib/database.js';
import type { createHttpAuth } from '../auth/http-auth.js';
import type { createWorkspaceAccessService } from '../workspaces/access-service.js';
import type { createMainJoinRegistry } from './session-manager/main-join-registry.js';
import { createMainAuthority } from './session-manager/main-authority.js';
import { MainJoinError } from './session-manager/main-join-registry.js';
import { createSessionRepository } from './session-manager/session-repository.js';
import { createMainTicketRouter } from './session-manager/main-ticket-routes.js';
import { createMainArtifactGuard } from './session-manager/main-artifact-guard.js';
import { attachMainJoinSocket } from './session-manager/main-join-signaling.js';
import { attachMainReconnectSocket } from './session-manager/main-reconnect-signaling.js';
import { attachSessionEndSocket } from './session-manager/session-end-signaling.js';
import { attachScreenShareSocket } from './session-manager/screen-share-signaling.js';
import { createTransportSignaling } from './media/transport-signaling.js';
import { createPausedReadySignaling } from './media/paused-ready-signaling.js';
import { createMediaSourceSync } from './media/media-source-sync.js';
import { createMediaBootstrapComposition } from './media/media-bootstrap-composition.js';
import type { createMediaRuntime } from './media/runtime.js';
import type { AccessRevocationBarrier } from '../workspaces/access-revocation.js';
import { createMainSocketPort } from './main-socket-port.js';

type Registry = ReturnType<typeof createMainJoinRegistry>;
type RegistryOptions = Omit<
  Parameters<typeof createMainJoinRegistry>[0],
  'coordinator' | 'accessRevocations'
> & {
  revocationCleanup: NonNullable<Parameters<typeof createMainJoinRegistry>[0]['revocationCleanup']>;
};

// One application-owned composition: the entry supplies the shared M1 registry
// factory and real M2 revocation binding. This module never invents a second ledger.
export function createMainRuntime(options: {
  config: AppConfig;
  database: Database;
  httpAuth: ReturnType<typeof createHttpAuth>;
  access: ReturnType<typeof createWorkspaceAccessService>;
  barrier: AccessRevocationBarrier;
  media: Awaited<ReturnType<typeof createMediaRuntime>>;
  createRegistry(input: RegistryOptions): Registry;
  isReady(): boolean;
  isAuthCurrent(auth: AuthenticatedContext): boolean;
  report(code: string): void;
}) {
  const { media } = options;
  let closed = false;
  const sockets = new Map<string, Socket>();
  const projections = new Map<
    string,
    ReturnType<ReturnType<typeof createMediaSourceSync>['attach']>
  >();
  const withContext: Registry['withContext'] = (...args) => {
    if (!ready()) return Promise.reject(new MainJoinError('DEPENDENCY_UNAVAILABLE'));
    return registry.withContext(...args);
  };
  const transports = createTransportSignaling({
    withContext,
    createTransport: media.createTransport,
    onTransportClosed(socketId, context, transportId, reason) {
      const binding = projections.get(socketId);
      if (binding)
        void binding
          .publish('media.transport.closed', { transportId, reason }, context)
          .catch(() => options.report('DEPENDENCY_UNAVAILABLE'));
    },
  });
  const sources = createPausedReadySignaling({
    ...transports,
    onScreenSource(change) {
      for (const binding of projections.values()) {
        const task = (async () => {
          if (change.type === 'published') {
            await binding.publish('media.source.changed', { source: change.source });
            return;
          }
          const { sourceId, sourceGeneration, sourceRevision, producerId } = change.source;
          const version = {
            sourceId,
            sourceGeneration,
            sourceRevision,
            reason: 'SOURCE_ENDED' as const,
          };
          await binding.publish('media.source.ended', version);
          await binding.publish('media.producer.stateChanged', {
            ...version,
            producerId,
            state: 'CLOSED',
          });
        })();
        void task.catch(() => options.report('DEPENDENCY_UNAVAILABLE'));
      }
    },
  });
  const sync = createMediaSourceSync({ withContext, transports, media: sources });
  const cleanup = {
    media: { revoke: transports.cleanup },
    messaging: createMainArtifactGuard(options.database, 'messaging'),
    board: createMainArtifactGuard(options.database, 'board'),
  };
  const ready = () => !closed && media.isReady() && options.isReady();
  const repository = createSessionRepository(options.database);
  const registry = options.createRegistry({
    repository,
    leaveParticipant: repository.leave,
    publishProjection(socketId, event) {
      sockets.get(socketId)?.emit('session.changed', event);
    },
    projectionFailed(socketId) {
      options.report('DEPENDENCY_UNAVAILABLE');
      sockets.get(socketId)?.disconnect(true);
    },
    publishEnded: (socketId, notice) => {
      const socket = sockets.get(socketId);
      if (socket?.connected) socket.emit('session.ended', notice);
    },
    ...createMainAuthority(options.database, options.access, options.barrier),
    createRouter: media.createSessionRouter,
    revocationCleanup: cleanup,
    reconnectCleanup: cleanup,
    endCleanup: cleanup,
  });
  const bootstrap = createMediaBootstrapComposition(options.config, options.httpAuth, registry);
  const channelRouter = createMainTicketRouter(options.httpAuth, options.database, registry, ready);
  const mediaRouter = Router();
  mediaRouter.use((_req, res, next) => {
    if (!ready()) {
      res.status(503).json({
        requestId: res.locals.requestId,
        error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Cuộc gọi chưa sẵn sàng.' },
      });
      return;
    }
    next();
  }, bootstrap.router);
  const attached = new Set<string>();
  let sweeping = false;
  const timer = setInterval(() => {
    if (closed || sweeping) return;
    sweeping = true;
    void registry
      .sweepExpired()
      .catch(() => options.report('DEPENDENCY_UNAVAILABLE'))
      .finally(() => {
        sweeping = false;
      });
  }, 1000).unref();
  return {
    registry,
    channelRouter,
    mediaRouter,
    attach(socket: Socket & { data: { auth: AuthenticatedContext } }) {
      if (closed || attached.has(socket.id) || !socket.connected) return;
      const rawSocket = socket;
      socket = createMainSocketPort(rawSocket, async (event, input, send) => {
        if (
          !ready() ||
          !options.isAuthCurrent(rawSocket.data.auth) ||
          Date.parse(rawSocket.data.auth.expiresAt) <= Date.now()
        )
          return false;
        // Terminal ACK/notices carry no usable grant and must survive ownership removal.
        const envelope =
          input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
        const response = envelope.response;
        if (
          event === 'session.ended' ||
          event === 'session.end.ack' ||
          event === 'session.leave.ack' ||
          event === 'screen.release.ack' ||
          event === 'media.producer.close.ack' ||
          event === 'media.consumer.close.ack' ||
          (response && typeof response === 'object' && 'error' in response)
        ) {
          send();
          return true;
        }
        if (event.endsWith('.ack')) input = envelope.request;
        const candidate =
          input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
        const parsed = liveContextRequestSchema.safeParse({
          auth: rawSocket.data.auth,
          sessionId: candidate.sessionId,
          epoch: candidate.epoch,
          callGeneration: candidate.callGeneration,
        });
        if (!parsed.success) return false;
        const { auth: _auth, ...context } = parsed.data;
        void _auth;
        if (registry.isContextRetired(rawSocket.id, context)) return 'discard';
        try {
          return await registry.withContext(rawSocket.id, context, (resolved) => {
            if (registry.isContextRetired(rawSocket.id, context)) return 'discard';
            if (!resolved.ok) return false;
            if (
              ((candidate.policyRevision ?? candidate.expectedPolicyRevision) !== undefined &&
                (candidate.policyRevision ?? candidate.expectedPolicyRevision) !==
                  resolved.context.policyRevision) ||
              (candidate.audienceEpoch !== undefined &&
                candidate.audienceEpoch !== resolved.context.audienceEpoch) ||
              (candidate.scope !== undefined &&
                !sameSessionScope(
                  candidate.scope as typeof resolved.context.scope,
                  resolved.context.scope,
                ))
            )
              return false;
            send();
            return true;
          });
        } catch (error) {
          // End/leave can retire this generation while authority awaits its gate.
          // Drop its queued grant, preserving the socket for the terminal ACK.
          if (registry.isContextRetired(rawSocket.id, context)) return 'discard';
          throw error;
        }
      });
      attached.add(socket.id);
      sockets.set(socket.id, socket);
      socket.once('disconnect', () => {
        attached.delete(socket.id);
        sockets.delete(socket.id);
        projections.delete(socket.id);
      });
      const readAuth = () =>
        options.isAuthCurrent(socket.data.auth) &&
        Date.parse(socket.data.auth.expiresAt) > Date.now()
          ? socket.data.auth
          : null;
      attachMainJoinSocket(registry, socket, readAuth);
      attachMainReconnectSocket(registry, socket, readAuth, options.report);
      attachSessionEndSocket(registry, socket, readAuth);
      attachScreenShareSocket(registry, socket, readAuth);
      transports.attach(socket);
      sources.attach(socket);
      projections.set(socket.id, sync.attach(socket));
      bootstrap.attachSocket(socket, readAuth);
      socket.on('session.leave', (raw: unknown, ack?: (value: unknown) => void) => {
        if (typeof ack !== 'function') return;
        const candidate =
          raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
        const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
        const fail = (code: string) =>
          ack({ requestId, error: { code, message: 'Không thể rời cuộc gọi.' } });
        const input = sessionLeaveInputSchema.safeParse(raw);
        const auth = readAuth();
        if (!input.success || !auth) {
          fail(input.success ? 'AUTH_REQUIRED' : 'VALIDATION_ERROR');
          return;
        }
        if (!ready()) {
          fail('DEPENDENCY_UNAVAILABLE');
          return;
        }
        void registry
          .leave({ auth, socketId: socket.id, isConnected: () => socket.connected }, input.data)
          .then(ack, (error: unknown) =>
            fail(
              error instanceof MainJoinError
                ? error.code
                : error instanceof CoordinationError
                  ? 'SERVER_BUSY'
                  : 'DEPENDENCY_UNAVAILABLE',
            ),
          );
      });
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      registry.close();
      attached.clear();
      sockets.clear();
      projections.clear();
    },
  };
}
