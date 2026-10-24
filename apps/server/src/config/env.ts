import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  MONGO_URI: z
    .string()
    .min(1)
    .default('mongodb://127.0.0.1:27017/colearnia?replicaSet=rs0&directConnection=true'),
  MEDIA_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MEDIA_LISTEN_IP: z.string().default('127.0.0.1'),
  MEDIA_ANNOUNCED_ADDRESS: z.string().default('127.0.0.1'),
  MEDIA_PORT: z.coerce.number().int().min(1024).max(65535).default(40000),
});

export function loadConfig(input: Record<string, string | undefined> = process.env) {
  return envSchema.parse(input);
}

export type AppConfig = ReturnType<typeof loadConfig>;
