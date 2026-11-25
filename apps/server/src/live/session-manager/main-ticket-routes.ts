import { Router } from 'express';
import { channelParamsSchema, sessionJoinTicketInputSchema } from '@colearnia/contracts';
import { ZodError } from 'zod';
import { authFailure, requireVerifiedSession } from '../../auth/http-auth.js';
import type { AuthResponse, createHttpAuth } from '../../auth/http-auth.js';
import type { Database } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { channelModels } from '../../workspaces/channel-models.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

export function createMainTicketRouter(
  auth: ReturnType<typeof createHttpAuth>,
  database: Database,
  registry: Pick<ReturnType<typeof createMainJoinRegistry>, 'issue' | 'stats' | 'inspectOwnership'>,
  isReady: () => boolean,
) {
  const { Channel } = channelModels(database.connection);
  const router = Router();
  router.get(
    '/:channelId/live-session/ownership',
    auth.requireAuth,
    async (req, res: AuthResponse) => {
      res.setHeader('Cache-Control', 'no-store');
      const actor = requireVerifiedSession(res);
      if (!actor) return;
      try {
        if (!isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
        const { channelId } = channelParamsSchema.parse(req.params);
        const channel = await Channel.findOne({ _id: channelId, deletedAt: null })
          .select('workspaceId')
          .maxTimeMS(2000)
          .lean();
        if (!channel) throw new MainJoinError('NOT_FOUND');
        if (res.destroyed || !isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
        const data = await registry.inspectOwnership(actor.context, {
          workspaceId: channel.workspaceId.toHexString(),
          channelId: channelId.toLowerCase(),
        });
        if (!res.destroyed) res.json({ data, requestId: res.locals.requestId });
      } catch (error) {
        const code =
          error instanceof MainJoinError
            ? error.code
            : error instanceof ZodError
              ? 'VALIDATION_ERROR'
              : error instanceof CoordinationError
                ? 'SERVER_BUSY'
                : 'DEPENDENCY_UNAVAILABLE';
        if (!res.headersSent) authFailure(res, code, 'Không thể kiểm tra cuộc gọi hiện tại.');
      }
    },
  );
  router.post(
    '/:channelId/live-session/join',
    auth.requireAuth,
    auth.requireCsrf,
    async (req, res: AuthResponse) => {
      res.setHeader('Cache-Control', 'no-store');
      const actor = requireVerifiedSession(res);
      if (!actor) return;
      let stage: 'readiness' | 'validation' | 'channel-read' | 'registry-issue' = 'readiness';
      try {
        if (!isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
        stage = 'validation';
        const { channelId } = channelParamsSchema.parse(req.params);
        const input = sessionJoinTicketInputSchema.parse(req.body);
        stage = 'channel-read';
        const channel = await Channel.findOne({ _id: channelId, deletedAt: null })
          .select('workspaceId')
          .maxTimeMS(2000)
          .lean();
        if (!channel) throw new MainJoinError('NOT_FOUND');
        if (res.destroyed || !isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
        stage = 'registry-issue';
        const result = await registry.issue(
          actor.context,
          {
            workspaceId: channel.workspaceId.toHexString(),
            channelId: channelId.toLowerCase(),
          },
          input,
        );
        if (!res.destroyed) res.json({ data: result, requestId: res.locals.requestId });
      } catch (error) {
        const code =
          error instanceof MainJoinError
            ? error.code
            : error instanceof ZodError
              ? 'VALIDATION_ERROR'
              : error instanceof CoordinationError
                ? 'SERVER_BUSY'
                : 'DEPENDENCY_UNAVAILABLE';
        if (code === 'DEPENDENCY_UNAVAILABLE' || code === 'SERVER_BUSY') {
          // Explicit allowlist: never serialize the error, request, auth, or ticket.
          logger.warn(
            {
              requestId: res.locals.requestId,
              code,
              stage,
              registry: registry.stats(),
            },
            'MAIN join ticket unavailable',
          );
        }
        if (!res.headersSent) authFailure(res, code, 'Không thể chuẩn bị tham gia cuộc gọi.');
      }
    },
  );
  return router;
}
