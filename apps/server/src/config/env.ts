import { z } from 'zod';
import { messagingBudgetSchema } from '../messaging/budget.js';
import { textSyncLimitsSchema } from '../messaging/text-sync.js';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    MONGO_URI: z
      .string()
      .min(1)
      .default('mongodb://127.0.0.1:27017/colearnia?replicaSet=rs0&directConnection=true'),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(5000),
    MONGO_WAIT_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(5000),
    MONGO_SOCKET_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(15_000),
    COORDINATOR_MAX_PENDING_PER_KEY: z.coerce.number().int().min(1).max(10_000).default(64),
    COORDINATOR_MAX_OPERATIONS: z.coerce.number().int().min(1).max(100_000).default(1024),
    COORDINATOR_WAIT_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(5000),
    MESSAGING_BUDGET_JSON: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined;
        try {
          return messagingBudgetSchema.parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid messaging budget JSON' });
          return z.NEVER;
        }
      }),
    TEXT_SYNC_LIMITS_JSON: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined;
        try {
          return textSyncLimitsSchema.parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid TEXT sync limits JSON' });
          return z.NEVER;
        }
      }),
    TEXT_SEND_RECOVERY_JSON: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined;
        try {
          return z
            .strictObject({
              maxPending: z.number().int().positive(),
              retryDelaysMs: z.array(z.number().int().positive().max(60_000)).min(1).max(8),
            })
            .parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid TEXT send recovery JSON' });
          return z.NEVER;
        }
      }),
    SESSION_SECRET: z.preprocess(
      (value) =>
        value === '' || value === 'replace-with-at-least-32-random-characters' ? undefined : value,
      z.string().min(32).optional(),
    ),
    AUTH_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(604800),
    AUTH_TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    MEDIA_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    MEDIA_LISTEN_IP: z.string().default('127.0.0.1'),
    MEDIA_ANNOUNCED_ADDRESS: z.string().default('127.0.0.1'),
    MEDIA_PORT: z.coerce.number().int().min(1024).max(65535).default(40000),
    MEDIA_LOCAL_DIRECT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TURN_KEY_ID: z.string().trim().optional(),
    TURN_KEY_API_TOKEN: z.string().trim().optional(),
  })
  .superRefine((config, context) => {
    if (config.TEXT_SEND_RECOVERY_JSON) {
      const handlers = config.MESSAGING_BUDGET_JSON?.handlers;
      if (
        !config.SESSION_SECRET ||
        !config.MEDIA_ENABLED ||
        !config.TEXT_SYNC_LIMITS_JSON ||
        !handlers?.text ||
        !handlers.history ||
        !handlers.subscription ||
        config.TEXT_SEND_RECOVERY_JSON.maxPending >= config.MONGO_MAX_POOL_SIZE
      ) {
        context.addIssue({
          code: 'custom',
          path: ['TEXT_SEND_RECOVERY_JSON'],
          message:
            'TEXT send recovery requires auth, MAIN cleanup, all TEXT budgets and a reserved DB slot',
        });
      }
    }
    if (!config.MEDIA_LOCAL_DIRECT) return;
    const loopback = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
    if (
      config.NODE_ENV === 'production' ||
      !loopback.has(config.HOST) ||
      !loopback.has(config.MEDIA_LISTEN_IP) ||
      !loopback.has(config.MEDIA_ANNOUNCED_ADDRESS) ||
      !loopback.has(new URL(config.APP_ORIGIN).hostname)
    )
      context.addIssue({
        code: 'custom',
        path: ['MEDIA_LOCAL_DIRECT'],
        message: 'Local direct ICE requires a non-production, loopback-only app and media listener',
      });
  });

export function loadConfig(input: Record<string, string | undefined> = process.env) {
  return envSchema.parse(input);
}

export type AppConfig = ReturnType<typeof loadConfig>;
