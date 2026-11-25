import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  channelParamsSchema,
  requestIdSchema,
  textMessageHistoryQuerySchema,
  textMessageSendBodySchema,
  textMessageSendInputSchema,
  textSenderNamesHeader,
  textConversationSubscribeInputSchema,
  textConversationUnsubscribeInputSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext, TextHistoryMessage } from '@colearnia/contracts';
import { authFailure, requireVerifiedSession } from '../auth/http-auth.js';
import type { AuthResponse, createHttpAuth } from '../auth/http-auth.js';
import { logger } from '../lib/logger.js';
import { textErrorCode } from './text-service.js';
import type { createTextService } from './text-service.js';

type Service = ReturnType<typeof createTextService>;

// Older web builds use a strict message schema, so only send names to opted-in clients.
export function textMessageForClient<T extends TextHistoryMessage>(
  message: T,
  includeSenderNames: boolean,
): T {
  if (includeSenderNames) return message;
  const legacyMessage = { ...message };
  delete legacyMessage.senderDisplayName;
  return legacyMessage;
}
export type TextSocketEvents = {
  'message.send': (input: unknown, reply?: (result: unknown) => void) => void;
  'conversation.subscribe': (input: unknown, reply?: (result: unknown) => void) => void;
  'conversation.unsubscribe': (input: unknown, reply?: (result: unknown) => void) => void;
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
      res.status(data.outcome === 'created' ? 201 : 200).json({
        data: {
          ...data,
          message: textMessageForClient(data.message, req.get(textSenderNamesHeader) === '1'),
        },
        requestId: res.locals.requestId,
      });
    } catch (error) {
      reject(res, error);
    }
  });
  router.get(
    path,
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    auth.requireAuth,
    async (req, res: AuthResponse) => {
      const actor = requireVerifiedSession(res);
      if (!actor) return;
      try {
        const { channelId } = channelParamsSchema.parse(req.params);
        const query = textMessageHistoryQuerySchema.parse(req.query);
        const data = await service.history(
          actor.context,
          channelId.toLowerCase(),
          query,
          req.get(textSenderNamesHeader) === '1',
        );
        res.json({ data, requestId: res.locals.requestId });
      } catch (error) {
        reject(res, error);
      }
    },
  );
  return router;
}

function correlationId(input: unknown) {
  const parsed = requestIdSchema.safeParse(
    input && typeof input === 'object' && 'requestId' in input ? input.requestId : undefined,
  );
  return parsed.success ? parsed.data : randomUUID();
}

export function createTextSocketSync(service: Service) {
  return (
    actor: AuthenticatedContext,
    owner: string,
    emit: Parameters<Service['subscribe']>[3],
  ) => {
    let closed = false;
    return {
      close() {
        closed = true;
        service.closeSubscriptions(owner);
      },
      subscribe: (async (input, reply) => {
        if (typeof reply !== 'function' || closed) return;
        const parsed = textConversationSubscribeInputSchema.safeParse(input);
        const requestId = parsed.success ? parsed.data.requestId : correlationId(input);
        if (!parsed.success) {
          reply({ error: failure(parsed.error), requestId });
          return;
        }
        const { channelId, rootMessageId, afterCheckpoint } = parsed.data.payload;
        try {
          if (rootMessageId !== null)
            throw Object.assign(new Error(), { code: 'VALIDATION_ERROR' });
          const data = await service.subscribe(
            actor,
            channelId.toLowerCase(),
            owner,
            emit,
            afterCheckpoint,
          );
          if (closed) {
            service.closeSubscriptions(owner);
            return;
          }
          reply({ data, requestId });
        } catch (error) {
          if (!closed)
            reply({
              error:
                rootMessageId !== null
                  ? { code: 'VALIDATION_ERROR', message: 'Chỉ hỗ trợ timeline TEXT.' }
                  : failure(error, requestId),
              requestId,
            });
        }
      }) satisfies TextSocketEvents['conversation.subscribe'],
      unsubscribe: ((input, reply) => {
        if (typeof reply !== 'function' || closed) return;
        const parsed = textConversationUnsubscribeInputSchema.safeParse(input);
        if (!parsed.success) {
          reply({ error: failure(parsed.error), requestId: correlationId(input) });
          return;
        }
        service.unsubscribe(parsed.data.payload.subscriptionId, owner);
        reply({ data: null, requestId: parsed.data.requestId });
      }) satisfies TextSocketEvents['conversation.unsubscribe'],
    };
  };
}

export function createTextSocketSend(service: Service) {
  return (
      actor: AuthenticatedContext,
      includeSenderNames = false,
    ): TextSocketEvents['message.send'] =>
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
        const data = await service.send(actor, channelId.toLowerCase(), body);
        reply({
          data: { ...data, message: textMessageForClient(data.message, includeSenderNames) },
          requestId,
        });
      } catch (error) {
        reply({ error: failure(error, requestId), requestId });
      }
    };
}
