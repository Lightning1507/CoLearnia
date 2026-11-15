import type { ChannelAccess, ChannelType, WorkspaceRole } from '@colearnia/contracts';

export type WorkspaceAccessState = {
  workspace: { id: string; ownerId: string; deleted: boolean } | null;
  membership: {
    id: string;
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    status: 'ACTIVE' | 'REMOVED';
    incarnation: number;
    revision: number;
  } | null;
};
export type ChannelAccessState = WorkspaceAccessState & {
  channel: {
    id: string;
    workspaceId: string;
    type: ChannelType;
    accessMode: ChannelAccess;
    revision: number;
    deleted: boolean;
  } | null;
  grant: {
    workspaceId: string;
    channelId: string;
    membershipId: string;
    membershipIncarnation: number;
    revoked: boolean;
  } | null;
};
export type WorkspaceAction =
  | 'read'
  | 'rename'
  | 'delete'
  | 'createChannel'
  | 'manageInvitation'
  | 'changeRole'
  | 'removeMember';
export type TargetMembership = NonNullable<WorkspaceAccessState['membership']>;

// Only server-loaded state. No transport, database or call-host role in this policy.
export function hasWorkspaceAccess(state: WorkspaceAccessState, userId: string): boolean {
  const { workspace, membership } = state;
  return !!(
    workspace &&
    !workspace.deleted &&
    membership &&
    membership.status === 'ACTIVE' &&
    (membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MEMBER') &&
    membership.workspaceId === workspace.id &&
    membership.userId === userId &&
    (membership.role !== 'OWNER' || workspace.ownerId === userId)
  );
}

export function allowsWorkspaceAction(
  state: WorkspaceAccessState,
  userId: string,
  action: WorkspaceAction,
  target?: TargetMembership,
): boolean {
  if (!hasWorkspaceAccess(state, userId)) return false;
  const role = state.membership!.role;
  switch (action) {
    case 'read':
      return true;
    case 'rename':
    case 'createChannel':
    case 'manageInvitation':
      return role === 'OWNER' || role === 'ADMIN';
    case 'delete':
      return role === 'OWNER';
    case 'changeRole':
    case 'removeMember': {
      if (
        !target ||
        target.workspaceId !== state.workspace!.id ||
        target.status !== 'ACTIVE' ||
        target.role === 'OWNER' ||
        target.userId === state.workspace!.ownerId ||
        target.userId === userId
      )
        return false;
      return (
        role === 'OWNER' ||
        (action === 'removeMember' && role === 'ADMIN' && target.role === 'MEMBER')
      );
    }
    default:
      return false;
  }
}

export function channelPermissions(state: ChannelAccessState, userId: string) {
  const { channel, membership, grant } = state;
  if (
    !hasWorkspaceAccess(state, userId) ||
    !channel ||
    channel.deleted ||
    (channel.type !== 'TEXT' && channel.type !== 'LIVE') ||
    (channel.accessMode !== 'WORKSPACE' && channel.accessMode !== 'PRIVATE') ||
    channel.workspaceId !== state.workspace!.id
  ) {
    return { canKnowChannel: false, canReadContent: false, canManageChannel: false };
  }
  const canManageChannel = membership!.role === 'OWNER' || membership!.role === 'ADMIN';
  const canReadContent =
    channel.accessMode === 'WORKSPACE' ||
    !!(
      grant &&
      !grant.revoked &&
      grant.workspaceId === channel.workspaceId &&
      grant.channelId === channel.id &&
      grant.membershipId === membership!.id &&
      grant.membershipIncarnation === membership!.incarnation
    );
  return { canKnowChannel: canManageChannel || canReadContent, canReadContent, canManageChannel };
}
