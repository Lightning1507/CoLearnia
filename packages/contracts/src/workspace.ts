import { z } from 'zod';
import { apiResponseSchema, requestIdSchema } from './common.js';

export const workspaceDocumentIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
export const accessRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const membershipIncarnationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export const channelTypeSchema = z.enum(['TEXT', 'LIVE']);
export const channelAccessSchema = z.enum(['WORKSPACE', 'PRIVATE']);

// Retain scaffold name limits, counting Unicode code points consistently with API conventions.
const nameSchema = (min: number) =>
  z
    .string()
    .trim()
    .refine((value) => [...value].length >= min && [...value].length <= 80);
export const workspaceNameSchema = nameSchema(2);
export const channelNameSchema = nameSchema(1);
export const workspaceParamsSchema = z.strictObject({ workspaceId: workspaceDocumentIdSchema });
export const channelParamsSchema = z.strictObject({ channelId: workspaceDocumentIdSchema });
export const channelAccessParamsSchema = channelParamsSchema.extend({
  userId: workspaceDocumentIdSchema,
});
export const workspaceMemberParamsSchema = workspaceParamsSchema.extend({
  userId: workspaceDocumentIdSchema,
});

// CAS target: workspace rename/delete -> workspace; member role/remove -> target
// membership; channel rename/delete and PRIVATE grant changes -> channel.
// These are independent counters, never the actor's membership or LIVE policyRevision.
export const mutationInputSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedRevision: accessRevisionSchema,
});
export const createWorkspaceSchema = z.strictObject({
  name: workspaceNameSchema,
  requestId: requestIdSchema,
});
export const renameWorkspaceSchema = mutationInputSchema.extend({ name: workspaceNameSchema });
export const createChannelSchema = z.strictObject({
  name: channelNameSchema,
  type: channelTypeSchema,
  accessMode: channelAccessSchema.default('WORKSPACE'),
  requestId: requestIdSchema,
});
// Type/accessMode are immutable; OWNER cannot be assigned through the role endpoint.
export const renameChannelSchema = mutationInputSchema.extend({ name: channelNameSchema });
export const changeMemberRoleSchema = mutationInputSchema.extend({
  role: z.enum(['ADMIN', 'MEMBER']),
});
export const changePrivateAccessSchema = mutationInputSchema;

export const workspaceSummarySchema = z.strictObject({
  id: workspaceDocumentIdSchema,
  name: workspaceNameSchema,
  ownerId: workspaceDocumentIdSchema,
  revision: accessRevisionSchema,
});
export const channelSummarySchema = z.strictObject({
  id: workspaceDocumentIdSchema,
  workspaceId: workspaceDocumentIdSchema,
  name: channelNameSchema,
  type: channelTypeSchema,
  accessMode: channelAccessSchema,
  revision: accessRevisionSchema,
});
export const workspaceResponseSchema = apiResponseSchema(workspaceSummarySchema);
export const channelResponseSchema = apiResponseSchema(channelSummarySchema);
export const workspaceMutationResponseSchema = apiResponseSchema(z.null());

// Server-created snapshot for M2/M4, never authorization supplied by the client.
export const channelAccessSnapshotSchema = z.strictObject({
  workspaceId: workspaceDocumentIdSchema,
  channelId: workspaceDocumentIdSchema,
  channelType: channelTypeSchema,
  membershipId: workspaceDocumentIdSchema,
  membershipIncarnation: membershipIncarnationSchema,
  membershipRevision: accessRevisionSchema,
  channelRevision: accessRevisionSchema,
  canReadContent: z.boolean(),
  canManageChannel: z.boolean(),
});

// Scope-specific revocation prevents accidentally treating an absent field as 'all'.
const revokeBase = { operationId: requestIdSchema, revision: accessRevisionSchema };
export const accessRevocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...revokeBase,
    kind: z.literal('AUTH_SESSION'),
    authSessionId: workspaceDocumentIdSchema,
  }),
  z.strictObject({
    ...revokeBase,
    kind: z.literal('USER_SESSIONS'),
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
    kind: z.literal('PRIVATE_CHANNEL'),
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
export const accessCleanupResultSchema = z.strictObject({
  operationId: requestIdSchema,
  permissionRevoked: z.boolean(),
  pendingInvalidated: z.boolean(),
  cleanupPending: z.boolean(),
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type ChannelType = z.infer<typeof channelTypeSchema>;
export type ChannelAccess = z.infer<typeof channelAccessSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type ChannelSummary = z.infer<typeof channelSummarySchema>;
export type ChannelAccessSnapshot = z.infer<typeof channelAccessSnapshotSchema>;
export type AccessRevocation = z.infer<typeof accessRevocationSchema>;
export type AccessCleanupResult = z.infer<typeof accessCleanupResultSchema>;
export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceSchema>;
export type RenameChannelInput = z.infer<typeof renameChannelSchema>;
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
export type ChangePrivateAccessInput = z.infer<typeof changePrivateAccessSchema>;
export type WorkspaceMutationInput = z.infer<typeof mutationInputSchema>;
