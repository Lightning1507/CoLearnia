import { z } from 'zod';
import { requestIdSchema, resourceIdSchema } from './common.js';

export const sessionModeSchema = z.enum(['FREE', 'MODERATED']);
export const mediaSourceSchema = z.enum(['MIC', 'CAMERA', 'SCREEN', 'SCREEN_AUDIO']);

// A starting envelope, not permission to execute a command. Server policy must run after validation.
export const sessionCommandEnvelopeSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: resourceIdSchema,
  epoch: resourceIdSchema,
  callGeneration: z.number().int().positive(),
  expectedPolicyRevision: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export type SessionMode = z.infer<typeof sessionModeSchema>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;
