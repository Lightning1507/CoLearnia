import { randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { systemStatusSchema } from '@colearnia/contracts';
import type { SystemStatus } from '@colearnia/contracts';
import type { AppConfig } from './config/env.js';
import { logger } from './lib/logger.js';

export function createApp(config: AppConfig, getStatus: () => SystemStatus) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId as string);
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: config.APP_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health/live', (_req, res) => {
    res.json({ data: { status: 'alive' }, requestId: res.locals.requestId });
  });

  app.get('/health/ready', (_req, res) => {
    const status = systemStatusSchema.parse(getStatus());
    res.status(status.ready ? 200 : 503).json({ data: status, requestId: res.locals.requestId });
  });

  app.get('/api/v1/system/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: systemStatusSchema.parse(getStatus()), requestId: res.locals.requestId });
  });

  // No placeholder auth/workspace/media endpoints: feature modules will register verified handlers.
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn.' },
      requestId: res.locals.requestId,
    });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Nội dung JSON không hợp lệ.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large';
    if (tooLarge) {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Nội dung gửi vượt giới hạn.' },
        requestId: res.locals.requestId,
      });
      return;
    }
    logger.error({ requestId: res.locals.requestId }, 'Request failed');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Có lỗi xử lý yêu cầu.' },
      requestId: res.locals.requestId,
    });
  };
  app.use(handleError);
  return app;
}
