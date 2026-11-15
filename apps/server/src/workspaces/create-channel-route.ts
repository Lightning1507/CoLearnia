import { channelResponseSchema, workspaceParamsSchema } from '@colearnia/contracts';
import type { Router } from 'express';
import { authFailure, requireVerifiedSession } from '../auth/http-auth.js';
import type { createHttpAuth } from '../auth/http-auth.js';
import { logger } from '../lib/logger.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import { ChannelCreationError } from './create-channel.js';
import type { createChannelCreator } from './create-channel.js';

export function installChannelCreationRoute(
  router: Router,
  auth: ReturnType<typeof createHttpAuth>,
  create: ReturnType<typeof createChannelCreator>,
) {
  router.post(
    '/:workspaceId/channels',
    auth.requireAuth,
    auth.requireCsrf,
    async (req, res, next) => {
      const verified = requireVerifiedSession(res);
      if (!verified) return;
      const params = workspaceParamsSchema.safeParse(req.params);
      if (!params.success) return authFailure(res, 'NOT_FOUND', 'Không tìm thấy Workspace.');
      try {
        const data = await create(req.body, params.data.workspaceId, verified.context);
        res
          .status(201)
          .json(channelResponseSchema.parse({ data, requestId: res.locals.requestId }));
      } catch (error) {
        if (error instanceof ChannelCreationError) {
          if (error.unconfirmed)
            logger.warn({ requestId: res.locals.requestId }, 'Channel creation commit unconfirmed');
          const messages = {
            VALIDATION_ERROR: 'Tên, loại kênh hoặc quyền truy cập không hợp lệ.',
            AUTH_REQUIRED:
              'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Kiểm tra kết quả tạo sau khi đăng nhập lại.',
            NOT_FOUND: 'Không tìm thấy Workspace hoặc kênh còn quyền quản lý.',
            FORBIDDEN: 'Chỉ chủ Workspace hoặc quản trị viên được tạo kênh.',
            CONFLICT: 'Mã yêu cầu đã được sử dụng với nội dung khác.',
            CHANNEL_REPLAY_UNAVAILABLE:
              'Không còn thông tin yêu cầu cũ. Kiểm tra kênh đã tạo trước khi tạo mới.',
            SERVER_BUSY: 'Hệ thống đang bận. Vui lòng thử lại sau.',
            DEPENDENCY_UNAVAILABLE:
              'Chưa xác nhận được kết quả tạo kênh. Giữ yêu cầu cũ để đối chiếu.',
          };
          return authFailure(res, error.code, messages[error.code]);
        }
        if (error instanceof CoordinationError && error.code !== 'INVALID_CONTEXT')
          return authFailure(res, 'SERVER_BUSY', 'Hệ thống đang bận. Vui lòng thử lại sau.');
        next(error);
      }
    },
  );
}
