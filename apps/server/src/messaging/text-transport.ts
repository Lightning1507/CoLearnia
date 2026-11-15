import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  channelParamsSchema,
  requestIdSchema,
  textMessageHistoryQuerySchema,
  textMessageSendBodySchema,
  textMessageSendInputSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { authFailure, requireVerifiedSession } from '../auth/http-auth.js';
import type { AuthResponse, createHttpAuth } from '../auth/http-auth.js';
import { logger } from '../lib/logger.js';
import { textErrorCode } from './text-service.js';
import type { createTextService } from './text-service.js';

type Service = ReturnType<typeof createTextService>;
export type TextSocketEvents = {
  'message.send': (input: unknown, reply?: (result: unknown) => void) => void;
};
function failure(error: unknown, requestId?: string) {
  const code = textErrorCode(error);
  if (code === 'INTERNAL_ERROR') logger.error({ requestId }, 'Text request failed');
  const messages = {
    AUTH_REQUIRED: 'Phiên đăng nhập không hợp lệ.',
    NOT_FOUND: 'Không tìm thấy kênh hoặc hội thoại.',
    FORBIDDEN: 'Bạn không có quyền đọc nội dung kênh.',
    CONFLICT: 'Mã gửi lại đã được dùng với nội dung khác.',
    VALIDATION_ERROR: 'Yêu cầu tin nhắn không hợp lệ.',
    PAYLOAD_TOO_LARGE: 'Nội dung gửi vượt giới hạn.',
    SERVER_BUSY: 'Máy chủ đang bận.',
    RATE_LIMITED: 'Bạn đang gửi tin quá nhanh.',
    DEPENDENCY_UNAVAILABLE: 'Dịch vụ tin nhắn tạm thời chưa sẵn sàng.',
  };
  return {
    code,
    message: Object.hasOwn(messages, code)
      ? messages[code as keyof typeof messages]
      : 'Có lỗi xử lý yêu cầu.',
  };
}

export function createTextRouter(auth: ReturnType<typeof createHttpAuth>, service: Service) {
  const router = Router();
  const path = '/:channelId/messages';
  function reject(res: AuthResponse, error: unknown) {
    const { code, message } = failure(error, res.locals.requestId);
    authFailure(res, code, message);
  }
  router.post(path, auth.requireAuth, auth.requireCsrf, async (req, res: AuthResponse) => {
    const actor = requireVerifiedSession(res);
    if (!actor) return;
    try {
      const { channelId } = channelParamsSchema.parse(req.params);
      const data = await service.send(
        actor.context,
        channelId.toLowerCase(),
        textMessageSendBodySchema.parse(req.body),
      );
      res
        .status(data.outcome === 'created' ? 201 : 200)
        .json({ data, requestId: res.locals.requestId });
    } catch (error) {
      reject(res, error);
    }
  });
  router.get(path, auth.requireAuth, async (req, res: AuthResponse) => {
    const actor = requireVerifiedSession(res);
    if (!actor) return;
    try {
      const { channelId } = channelParamsSchema.parse(req.params);
      const query = textMessageHistoryQuerySchema.parse(req.query);
      if (query.mode !== 'history') {
        authFailure(res, 'VALIDATION_ERROR', 'Chế độ lịch sử chưa được hỗ trợ.');
        return;
      }
      const data = await service.history(actor.context, channelId.toLowerCase(), query);
      res.json({ data, requestId: res.locals.requestId });
    } catch (error) {
      reject(res, error);
    }
  });
  return router;
}

export function createTextSocketSend(service: Service) {
  return (actor: AuthenticatedContext): TextSocketEvents['message.send'] =>
    async (input, reply) => {
      if (typeof reply !== 'function') return;
      const parsed = textMessageSendInputSchema.safeParse(input);
      if (!parsed.success) {
        const id = requestIdSchema.safeParse(
          input && typeof input === 'object' && 'requestId' in input ? input.requestId : undefined,
        );
        reply({
          error: { code: 'VALIDATION_ERROR', message: 'Yêu cầu tin nhắn không hợp lệ.' },
          requestId: id.success ? id.data : randomUUID(),
        });
        return;
      }
      const {
        requestId,
        payload: { channelId, ...body },
      } = parsed.data;
      try {
        reply({ data: await service.send(actor, channelId.toLowerCase(), body), requestId });
      } catch (error) {
        reply({ error: failure(error, requestId), requestId });
      }
    };
}
