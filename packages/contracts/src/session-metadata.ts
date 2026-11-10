import { z } from 'zod';
import { sessionEpochSchema, sessionIdSchema } from './session.js';
import { workspaceDocumentIdSchema } from './workspace.js';

export const sessionMetadataTargetSchema = z.strictObject({
  workspaceId: workspaceDocumentIdSchema,
  channelId: workspaceDocumentIdSchema,
});
export const sessionMetadataCursorSchema = sessionMetadataTargetSchema.extend({
  startedAt: z.iso.datetime(),
  sessionId: sessionIdSchema,
});
export const sessionMetadataQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: sessionMetadataCursorSchema.optional(),
});
// Historical metadata only; no user IDs, participant scopes, auth stamps or runtime grants.
export const sessionMetadataSummarySchema = z.strictObject({
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  status: z.enum(['ACTIVE', 'ENDING', 'ENDED']),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export const sessionMetadataPageSchema = z.strictObject({
  items: z.array(sessionMetadataSummarySchema).max(50),
  nextCursor: sessionMetadataCursorSchema.nullable(),
});
export type SessionMetadataTarget = z.infer<typeof sessionMetadataTargetSchema>;
export type SessionMetadataPage = z.infer<typeof sessionMetadataPageSchema>;
