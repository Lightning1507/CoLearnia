import { z } from 'zod';

const r2Config = z.object({
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  R2_ACCESS_KEY_ID: z.string().trim().min(1),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
  R2_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(15_000),
});

export function loadR2Config(input: NodeJS.ProcessEnv = process.env) {
  const parsed = r2Config.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error('Missing or invalid R2 configuration: ' + fields);
  }

  const config = parsed.data;
  return {
    endpoint: 'https://' + config.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    bucket: config.R2_BUCKET,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    timeoutMs: config.R2_TIMEOUT_MS,
  };
}
