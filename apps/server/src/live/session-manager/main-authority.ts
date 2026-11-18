import { authModels } from '../../auth/models.js';
import type { Database } from '../../lib/database.js';
import { databaseQueryOptions } from '../../lib/database.js';
import { WorkspaceAccessError } from '../../workspaces/access-service.js';
import type { createWorkspaceAccessService } from '../../workspaces/access-service.js';
import type { AccessRevocationBarrier } from '../../workspaces/access-revocation.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

type AuthorityPorts = Pick<
  Parameters<typeof createMainJoinRegistry>[0],
  'resolveAuthority' | 'isAuthorityCurrent'
>;

// Composition-owned bridge. Identity is already verified by HTTP/Socket.IO;
// M1 rechecks its persisted session and channel ACL on every MAIN resolution.
export function createMainAuthority(
  database: Database,
  access: Pick<ReturnType<typeof createWorkspaceAccessService>, 'resolvePeerChannelAccessHeld'>,
  barrier: AccessRevocationBarrier,
): AuthorityPorts {
  const { User } = authModels(database.connection);
  const isAuthorityCurrent: AuthorityPorts['isAuthorityCurrent'] = (value, held, committed) => {
    held.assertHeld({ workspaceId: value.access.workspaceId });
    return (
      Date.parse(value.auth.expiresAt) > Date.now() &&
      barrier.isCurrent(value.auth, value.access, held) &&
      (!committed || barrier.isCurrent(value.auth, committed, held))
    );
  };
  return {
    isAuthorityCurrent,
    async resolveAuthority(auth, target, held, remaining) {
      held.assertHeld({ workspaceId: target.workspaceId });
      try {
        const stamp = await access.resolvePeerChannelAccessHeld(
          { identity: auth, ...target },
          held,
          remaining,
        );
        if (stamp.channelType !== 'LIVE' || !stamp.canReadContent)
          throw new MainJoinError('FORBIDDEN');
        const user = await User.findOne({ _id: auth.userId, status: 'ACTIVE' })
          .select('displayName')
          .setOptions(databaseQueryOptions(remaining))
          .lean();
        remaining();
        if (!user) throw new MainJoinError('AUTH_REQUIRED');
        const value = { auth: { ...auth }, access: stamp, displayName: user.displayName };
        if (!isAuthorityCurrent(value, held)) throw new MainJoinError('FORBIDDEN');
        return value;
      } catch (error) {
        if (error instanceof MainJoinError) throw error;
        if (error instanceof WorkspaceAccessError) throw new MainJoinError(error.code);
        throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
      }
    },
  };
}
