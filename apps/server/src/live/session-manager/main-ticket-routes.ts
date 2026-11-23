import { Router } from 'express';
import { channelParamsSchema, sessionJoinTicketInputSchema } from '@colearnia/contracts';
import { ZodError } from 'zod';
import { authFailure, requireVerifiedSession } from '../../auth/http-auth.js';
import type { AuthResponse, createHttpAuth } from '../../auth/http-auth.js';
import type { Database } from '../../lib/database.js';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { channelModels } from '../../workspaces/channel-models.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

export function createMainTicketRouter(
  auth: ReturnType<typeof createHttpAuth>,
  database: Database,
  registry: Pick<ReturnType<typeof createMainJoinRegistry>, 'issue'>,
  isReady: () => boolean,
) {
  const { Channel } = channelModels(database.connection);
  const router = Router();
  router.post(
    '/:channelId/live-session/join',
    auth.requireAuth,
    auth.requireCsrf,
    async (req, res: AuthResponse) => {
      res.setHeader('Cache-Control', 'no-store');
      const actor = requireVerifiedSession(res);
      if (!actor) return;
      try {
        if (!isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
        const { channelId } = channelParamsSchema.parse(req.params);
        const input = sessionJoinTicketInputSchema.parse(req.body);
        const channel = await Channel.findOne({ _id: channelId, deletedAt: null })
          .select('workspaceId')
          .maxTimeMS(2000)
          .lean();
        if (!channel) throw new MainJoinError('NOT_FOUND');
        if (res.destroyed || !isReady()) throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
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
        if (!res.headersSent) authFailure(res, code, 'Không thể chuẩn bị tham gia cuộc gọi.');
      }
    },
  );
  return router;
}
