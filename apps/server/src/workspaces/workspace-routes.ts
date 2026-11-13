import { Router } from 'express';
import { createWorkspaceSchema, workspaceResponseSchema } from '@colearnia/contracts';
import { authFailure, requireVerifiedSession } from '../auth/http-auth.js';
import type { createHttpAuth } from '../auth/http-auth.js';
import { logger } from '../lib/logger.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import { WorkspaceCreationError } from './create-workspace.js';
import type { createWorkspaceCreator } from './create-workspace.js';

export function createWorkspaceRouter(
  auth: ReturnType<typeof createHttpAuth>,
  create: ReturnType<typeof createWorkspaceCreator>,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post('/', auth.requireAuth, auth.requireCsrf, async (req, res, next) => {
    const verified = requireVerifiedSession(res);
    if (!verified) return;
    const parsed = createWorkspaceSchema.safeParse(req.body);
    const trace = {
      traceRequestId: res.locals.requestId,
      operationRequestId: parsed.success ? parsed.data.requestId : undefined,
      actorUserId: verified.context.userId,
    };
    if (parsed.success) logger.info(trace, 'Workspace creation requested');
    try {
      const data = await create(req.body, verified.context);
      logger.info({ ...trace, workspaceId: data.id }, 'Workspace creation committed');
      res
        .status(201)
        .json(workspaceResponseSchema.parse({ data, requestId: res.locals.requestId }));
    } catch (error) {
      if (error instanceof WorkspaceCreationError) {
        if (error.unconfirmed)
          logger.warn(
            trace,
            'Workspace creation commit remains unconfirmed; do not replay POST automatically',
          );
        if (error.committed)
          logger.warn(
            { ...trace, committed: true },
            'Workspace creation committed but authentication expired; do not replay POST',
          );
        const messages = {
          AUTH_REQUIRED: error.committed
            ? 'Workspace đã được tạo. Phiên đăng nhập đã hết hạn; đăng nhập lại và kiểm tra danh sách Workspace trước khi tạo lại.'
            : 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
          VALIDATION_ERROR: 'Tên Workspace hoặc thông tin yêu cầu không hợp lệ.',
          DEPENDENCY_UNAVAILABLE: error.unconfirmed
            ? 'Chưa xác nhận được kết quả tạo Workspace. Kiểm tra danh sách trước khi tạo lại.'
            : 'Không thể tạo Workspace lúc này.',
        };
        authFailure(res, error.code, messages[error.code]);
      } else if (error instanceof CoordinationError && error.code !== 'INVALID_CONTEXT') {
        authFailure(res, 'SERVER_BUSY', 'Hệ thống đang bận. Vui lòng thử lại sau.');
      } else next(error);
    }
  });
  return router;
}
