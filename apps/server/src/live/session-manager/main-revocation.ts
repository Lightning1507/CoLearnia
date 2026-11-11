import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  LiveAccessRevocation,
} from '@colearnia/contracts';

export function mayMatchMainRevocation(
  event: LiveAccessRevocation,
  auth: AuthenticatedContext,
  target: { workspaceId: string; channelId: string },
): boolean {
  switch (event.kind) {
    case 'AUTH_SESSION':
      return auth.authSessionId === event.authSessionId;
    case 'USER_AUTH_SESSIONS':
      return auth.userId === event.userId;
    case 'WORKSPACE_DELETED':
      return target.workspaceId === event.workspaceId;
    case 'CHANNEL_DELETED':
      return target.workspaceId === event.workspaceId && target.channelId === event.channelId;
    case 'WORKSPACE_MEMBERSHIP':
      return auth.userId === event.userId && target.workspaceId === event.workspaceId;
    case 'PRIVATE_CHANNEL_ACCESS':
      return (
        auth.userId === event.userId &&
        target.workspaceId === event.workspaceId &&
        target.channelId === event.channelId
      );
  }
}

// Match the committed generation, not merely the user's latest canReadContent value.
// USER_AUTH_SESSIONS captures known authSession IDs at acceptance; a later login is a new session.
export function matchesMainRevocation(
  event: LiveAccessRevocation,
  auth: AuthenticatedContext,
  access: ChannelAccessStamp,
  authSessions: ReadonlySet<string>,
): boolean {
  switch (event.kind) {
    case 'AUTH_SESSION':
      return auth.authSessionId === event.authSessionId;
    case 'USER_AUTH_SESSIONS':
      return auth.userId === event.userId && authSessions.has(auth.authSessionId);
    case 'WORKSPACE_DELETED':
      return access.workspaceId === event.workspaceId;
    case 'CHANNEL_DELETED':
      return (
        access.workspaceId === event.workspaceId &&
        access.channelId === event.channelId &&
        access.channelRevision <= event.revision
      );
    case 'WORKSPACE_MEMBERSHIP':
    case 'PRIVATE_CHANNEL_ACCESS':
      return (
        auth.userId === event.userId &&
        access.workspaceId === event.workspaceId &&
        access.membershipId === event.membershipId &&
        access.membershipIncarnation === event.membershipIncarnation &&
        (event.kind === 'PRIVATE_CHANNEL_ACCESS'
          ? access.channelId === event.channelId && access.channelRevision <= event.revision
          : access.membershipRevision <= event.revision)
      );
  }
}
