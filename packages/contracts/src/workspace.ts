import { z } from 'zod';
import { requestIdSchema } from './common.js';

export const workspaceDocumentIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
export const accessRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const membershipIncarnationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export const channelTypeSchema = z.enum(['TEXT', 'LIVE']);
export const channelAccessSchema = z.enum(['WORKSPACE', 'RESTRICTED']);

export const createWorkspaceSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
});

export const createChannelSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  type: channelTypeSchema,
  accessMode: channelAccessSchema.default('WORKSPACE'),
});

// Shared M1/M4 boundary; runtime cleanup still binds session and resource generations.
const revokeBase = { operationId: requestIdSchema, revision: accessRevisionSchema };
export const accessRevocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...revokeBase,
    kind: z.literal('AUTH_SESSION'),
    authSessionId: workspaceDocumentIdSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('USER_AUTH_SESSIONS'),
    userId: workspaceDocumentIdSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('WORKSPACE_MEMBERSHIP'),
    workspaceId: workspaceDocumentIdSchema,
    userId: workspaceDocumentIdSchema,
    membershipId: workspaceDocumentIdSchema,
    membershipIncarnation: membershipIncarnationSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('PRIVATE_CHANNEL_ACCESS'),
    workspaceId: workspaceDocumentIdSchema,
    channelId: workspaceDocumentIdSchema,
    userId: workspaceDocumentIdSchema,
    membershipId: workspaceDocumentIdSchema,
    membershipIncarnation: membershipIncarnationSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('CHANNEL_DELETED'),
    workspaceId: workspaceDocumentIdSchema,
    channelId: workspaceDocumentIdSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('WORKSPACE_DELETED'),
    workspaceId: workspaceDocumentIdSchema,
  }),
]);

export type AccessRevocation = z.infer<typeof accessRevocationSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type ChannelType = z.infer<typeof channelTypeSchema>;
