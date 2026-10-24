import { z } from 'zod';

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

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type ChannelType = z.infer<typeof channelTypeSchema>;
