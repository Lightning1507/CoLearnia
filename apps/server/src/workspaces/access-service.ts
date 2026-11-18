import { createChannelListCursor } from './channel-list-cursor.js';
import type { ChannelListQuery } from '@colearnia/contracts';
import { Types } from 'mongoose';
import {
  authenticatedContextSchema,
  channelAccessSnapshotSchema,
  workspaceDocumentIdSchema,
  workspaceSelectionSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import type { ClientSession } from 'mongoose';
import { authIndexRequirements, authModels } from '../auth/models.js';
import { databaseQueryOptions, isDatabaseUnavailableError } from '../lib/database.js';
import type { Database, DatabaseDeadline } from '../lib/database.js';
import type { CoordinationContext, OperationCoordinator } from '../lib/operation-coordinator.js';
import { channelIndexRequirements, channelModels } from './channel-models.js';
import { workspaceIndexRequirements, workspaceModels } from './workspace-models.js';
import { allowsWorkspaceAction, channelPermissions, hasWorkspaceAccess } from './access-policy.js';
import type { ChannelAccessState, WorkspaceAction } from './access-policy.js';
import type { ResolveChannelAccess } from './ports.js';
import type { AccessRevocationBarrier } from './access-revocation.js';

export const workspaceAccessIndexRequirements = [
  ...authIndexRequirements,
  ...workspaceIndexRequirements.filter((item) => item.collection === 'memberships'),
  ...channelIndexRequirements,
];

export class WorkspaceAccessError extends Error {
  constructor(
    public readonly code:
      'AUTH_REQUIRED' | 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'DEPENDENCY_UNAVAILABLE',
  ) {
    super(code);
    this.name = 'WorkspaceAccessError';
  }
}
type AccessInput = Parameters<ResolveChannelAccess>[0];
type WorkspaceInput = {
  identity: AuthenticatedContext;
  workspaceId: string;
  action: WorkspaceAction;
  targetUserId?: string;
};
const maxTimeMS = 5000;
const id = (value: string) => workspaceDocumentIdSchema.parse(value).toLowerCase();

// Bootstrap supplies the SAME coordinator/connection used by mutation and auth services.
// indexesReady covers auth, membership and channel/grant preflight; never provisions them.
export function createWorkspaceAccessService(
  database: Database,
  coordinator: OperationCoordinator,
  indexesReady: () => boolean,
  barrier: AccessRevocationBarrier,
  cursorSecret?: string,
) {
  const { Workspace, Membership } = workspaceModels(database.connection);
  const { Channel, ChannelAccessGrant } = channelModels(database.connection);
  const { AuthSession, User } = authModels(database.connection);

  function identity(input: AuthenticatedContext) {
    const parsed = authenticatedContextSchema.safeParse(input);
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) {
      throw new WorkspaceAccessError('AUTH_REQUIRED');
    }
    return {
      ...parsed.data,
      userId: id(parsed.data.userId),
      authSessionId: id(parsed.data.authSessionId),
    };
  }
  async function confirmSession(
    actor: AuthenticatedContext,
    session: ClientSession,
    queryTime = () => maxTimeMS,
  ) {
    const current = await AuthSession.findOne({
      _id: actor.authSessionId,
      userId: actor.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select('_id expiresAt')
      .session(session)
      .setOptions(databaseQueryOptions(queryTime))
      .lean();
    const user =
      current &&
      (await User.exists({ _id: actor.userId, status: 'ACTIVE' })
        .session(session)
        .setOptions(databaseQueryOptions(queryTime)));
    if (!current || !user) throw new WorkspaceAccessError('AUTH_REQUIRED');
    return current.expiresAt.getTime();
  }
  async function readState(
    actor: AuthenticatedContext,
    workspaceId: string,
    session: ClientSession,
    queryTime = () => maxTimeMS,
  ) {
    const workspace = await Workspace.findOne({ _id: workspaceId, deletedAt: null })
      .select('_id name ownerId revision deletedAt')
      .session(session)
      .setOptions(databaseQueryOptions(queryTime))
      .lean();
    const member =
      workspace &&
      (await Membership.findOne({
        workspaceId,
        userId: actor.userId,
        status: 'ACTIVE',
        removedAt: null,
      })
        .select('_id workspaceId userId role status incarnation revision')
        .session(session)
        .setOptions(databaseQueryOptions(queryTime))
        .lean());
    const state: ChannelAccessState = {
      workspace: workspace
        ? {
            id: workspace._id.toHexString(),
            ownerId: workspace.ownerId.toHexString(),
            deleted: false,
          }
        : null,
      membership: member
        ? {
            id: member._id.toHexString(),
            workspaceId: member.workspaceId.toHexString(),
            userId: member.userId.toHexString(),
            role: member.role,
            status: member.status,
            incarnation: member.incarnation,
            revision: member.revision,
          }
        : null,
      channel: null,
      grant: null,
    };
    return { ...state, summary: workspace };
  }
  async function read<T>(
    actor: AuthenticatedContext,
    work: (session: ClientSession, queryTime?: DatabaseDeadline) => Promise<T>,
    remaining?: DatabaseDeadline,
    snapshotOnly = false,
  ): Promise<T> {
    if (!indexesReady() || !database.isConnected())
      throw new WorkspaceAccessError('DEPENDENCY_UNAVAILABLE');
    try {
      const resolve = async (session: ClientSession, queryTime?: DatabaseDeadline) => {
        const expiresAt = await confirmSession(actor, session, queryTime);
        return { value: await work(session, queryTime), expiresAt };
      };
      const result =
        snapshotOnly && remaining
          ? await database.snapshotRead(resolve, remaining)
          : await database.transaction(resolve, remaining);
      if (Math.min(Date.parse(actor.expiresAt), result.expiresAt) <= Date.now())
        throw new WorkspaceAccessError('AUTH_REQUIRED');
      return result.value;
    } catch (error) {
      if (!database.isConnected() || isDatabaseUnavailableError(error)) {
        throw new WorkspaceAccessError('DEPENDENCY_UNAVAILABLE');
      }
      throw error;
    }
  }
  function checkBarrier(
    actor: AuthenticatedContext,
    state: ChannelAccessState,
    context: CoordinationContext,
    peer = false,
  ) {
    // A peer read holds only Workspace. The access-stamped barrier below checks
    // auth denies too; do not pretend to hold that peer's User gate.
    if (!peer && !barrier.isCurrent(actor, undefined, context))
      throw new WorkspaceAccessError('AUTH_REQUIRED');
    if (
      state.membership &&
      !barrier.isCurrent(
        actor,
        {
          workspaceId: state.membership.workspaceId,
          membershipId: state.membership.id,
          membershipIncarnation: state.membership.incarnation,
          membershipRevision: state.membership.revision,
          ...(state.channel
            ? { channelId: state.channel.id, channelRevision: state.channel.revision }
            : {}),
        },
        context,
      )
    )
      throw new WorkspaceAccessError('NOT_FOUND');
  }
  async function readChannelAccessHeld(
    input: AccessInput,
    context: CoordinationContext,
    remaining?: DatabaseDeadline,
    snapshotOnly = false,
    peer = false,
  ) {
    const actor = identity(input.identity);
    const workspaceId = id(input.workspaceId);
    const channelId = id(input.channelId);
    context.assertHeld({ workspaceId, ...(peer ? {} : { userId: actor.userId }) });
    return read(
      actor,
      async (session, queryTime = () => maxTimeMS) => {
        const state = await readState(actor, workspaceId, session, queryTime);
        checkBarrier(actor, state, context, peer);
        if (!hasWorkspaceAccess(state, actor.userId)) throw new WorkspaceAccessError('NOT_FOUND');
        const channel = await Channel.findOne({ _id: channelId, workspaceId, deletedAt: null })
          .select('_id workspaceId type accessMode revision')
          .session(session)
          .setOptions(databaseQueryOptions(queryTime))
          .lean();
        if (!channel) throw new WorkspaceAccessError('NOT_FOUND');
        state.channel = {
          id: channelId,
          workspaceId,
          type: channel.type,
          accessMode: channel.accessMode,
          revision: channel.revision,
          deleted: false,
        };
        if (channel.accessMode === 'PRIVATE') {
          const grant = await ChannelAccessGrant.findOne({
            workspaceId,
            channelId,
            membershipId: state.membership!.id,
            membershipIncarnation: state.membership!.incarnation,
            revokedAt: null,
          })
            .select('workspaceId channelId membershipId membershipIncarnation')
            .session(session)
            .setOptions(databaseQueryOptions(queryTime))
            .lean();
          if (grant)
            state.grant = {
              workspaceId: grant.workspaceId.toHexString(),
              channelId: grant.channelId.toHexString(),
              membershipId: grant.membershipId.toHexString(),
              membershipIncarnation: grant.membershipIncarnation,
              revoked: false,
            };
        }
        checkBarrier(actor, state, context, peer);
        const permissions = channelPermissions(state, actor.userId);
        if (!permissions.canKnowChannel) throw new WorkspaceAccessError('NOT_FOUND');
        return channelAccessSnapshotSchema.parse({
          workspaceId,
          channelId,
          channelType: channel.type,
          membershipId: state.membership!.id,
          membershipIncarnation: state.membership!.incarnation,
          membershipRevision: state.membership!.revision,
          channelRevision: channel.revision,
          canReadContent: permissions.canReadContent,
          canManageChannel: permissions.canManageChannel,
        });
      },
      remaining,
      snapshotOnly,
    );
  }
  const resolveChannelAccessHeld = (
    input: AccessInput,
    context: CoordinationContext,
    remaining?: DatabaseDeadline,
    snapshotOnly = false,
  ) => readChannelAccessHeld(input, context, remaining, snapshotOnly);

  async function requireWorkspacePermissionHeld(
    input: WorkspaceInput,
    context: CoordinationContext,
  ) {
    const actor = identity(input.identity);
    const workspaceId = id(input.workspaceId);
    const targetUserId = input.targetUserId === undefined ? undefined : id(input.targetUserId);
    context.assertHeld({ userId: actor.userId, workspaceId });
    return read(actor, async (session) => {
      const state = await readState(actor, workspaceId, session);
      checkBarrier(actor, state, context);
      if (!hasWorkspaceAccess(state, actor.userId)) throw new WorkspaceAccessError('NOT_FOUND');
      const target = targetUserId
        ? await Membership.findOne({
            workspaceId,
            userId: targetUserId,
            status: 'ACTIVE',
            removedAt: null,
          })
            .select('_id workspaceId userId role status incarnation revision')
            .session(session)
            .maxTimeMS(maxTimeMS)
            .lean()
        : null;
      if (targetUserId && !target) throw new WorkspaceAccessError('NOT_FOUND');
      const targetState = target
        ? {
            id: target._id.toHexString(),
            workspaceId,
            userId: target.userId.toHexString(),
            role: target.role,
            status: target.status,
            incarnation: target.incarnation,
            revision: target.revision,
          }
        : undefined;
      if (!allowsWorkspaceAction(state, actor.userId, input.action, targetState))
        throw new WorkspaceAccessError('FORBIDDEN');
      return { membership: state.membership!, targetMembership: targetState ?? null };
    });
  }
  const resolveChannelAccess: ResolveChannelAccess = async (input) => {
    const actor = identity(input.identity);
    return coordinator.run(
      { userId: actor.userId, workspaceId: id(input.workspaceId) },
      (context) => resolveChannelAccessHeld(input, context),
    );
  };
  async function readSelection(
    actor: AuthenticatedContext,
    workspaceId: string,
    held: CoordinationContext,
  ) {
    held.assertHeld({ userId: actor.userId, workspaceId });
    return read(actor, async (session) => {
      const state = await readState(actor, workspaceId, session);
      checkBarrier(actor, state, held);
      if (!hasWorkspaceAccess(state, actor.userId) || !state.summary || !state.membership)
        throw new WorkspaceAccessError('NOT_FOUND');
      return workspaceSelectionSchema.parse({
        id: workspaceId,
        name: state.summary.name,
        ownerId: state.summary.ownerId.toHexString(),
        revision: state.summary.revision,
        role: state.membership.role,
      });
    });
  }
  async function listChannels(
    identityInput: AuthenticatedContext,
    workspaceInput: string,
    query: ChannelListQuery,
    mode: 'content' | 'manage',
  ) {
    const actor = identity(identityInput);
    const workspaceId = id(workspaceInput);
    if (!cursorSecret) throw new WorkspaceAccessError('DEPENDENCY_UNAVAILABLE');
    const cursorCodec = createChannelListCursor(cursorSecret);
    return coordinator.run({ userId: actor.userId, workspaceId }, async (held) => {
      const page = await read(actor, async (session) => {
        const state = await readState(actor, workspaceId, session);
        checkBarrier(actor, state, held);
        if (!hasWorkspaceAccess(state, actor.userId)) throw new WorkspaceAccessError('NOT_FOUND');
        if (mode === 'manage' && !allowsWorkspaceAction(state, actor.userId, 'createChannel'))
          throw new WorkspaceAccessError('FORBIDDEN');
        const membership = state.membership!;
        const scope = {
          workspaceId,
          userId: actor.userId,
          membershipId: membership.id,
          incarnation: membership.incarnation,
          mode,
        };
        let cursor;
        try {
          cursor = query.after ? cursorCodec.decode(query.after, scope) : undefined;
        } catch {
          throw new WorkspaceAccessError('VALIDATION_ERROR');
        }
        const rows = await Channel.find({
          workspaceId,
          deletedAt: null,
          ...(cursor
            ? {
                $or: [
                  { order: { $gt: cursor.order } },
                  { order: cursor.order, _id: { $gt: new Types.ObjectId(cursor.id) } },
                ],
              }
            : {}),
        })
          .select('_id workspaceId name type accessMode revision order')
          .sort({ order: 1, _id: 1 })
          .limit(query.limit + 1)
          .session(session)
          .maxTimeMS(maxTimeMS)
          .lean();
        const candidates = rows.slice(0, query.limit);
        const grants = await ChannelAccessGrant.find({
          workspaceId,
          membershipId: membership.id,
          membershipIncarnation: membership.incarnation,
          revokedAt: null,
          channelId: {
            $in: candidates.filter((row) => row.accessMode === 'PRIVATE').map((row) => row._id),
          },
        })
          .select('channelId')
          .session(session)
          .maxTimeMS(maxTimeMS)
          .lean();
        const granted = new Set(grants.map((grant) => grant.channelId.toHexString()));
        const items = candidates.map((row) => {
          const channelId = row._id.toHexString();
          const channelState: ChannelAccessState = {
            ...state,
            channel: {
              id: channelId,
              workspaceId,
              type: row.type,
              accessMode: row.accessMode,
              revision: row.revision,
              deleted: false,
            },
            grant: granted.has(channelId)
              ? {
                  workspaceId,
                  channelId,
                  membershipId: membership.id,
                  membershipIncarnation: membership.incarnation,
                  revoked: false,
                }
              : null,
          };
          const permissions = channelPermissions(channelState, actor.userId);
          return {
            state: channelState,
            value: {
              id: channelId,
              workspaceId,
              name: row.name,
              type: row.type,
              accessMode: row.accessMode,
              revision: row.revision,
              canReadContent: permissions.canReadContent,
            },
            visible: mode === 'manage' ? permissions.canManageChannel : permissions.canReadContent,
          };
        });
        const last = candidates.at(-1);
        return {
          state,
          items,
          nextCursor:
            rows.length > query.limit && last
              ? cursorCodec.encode({ ...scope, order: last.order, id: last._id.toHexString() })
              : null,
        };
      });
      // Denies can be installed while the transaction is committing.
      checkBarrier(actor, page.state, held);
      return {
        items: page.items
          .filter((item) => {
            if (!item.visible) return false;
            try {
              checkBarrier(actor, item.state, held);
              return true;
            } catch (error) {
              if (error instanceof WorkspaceAccessError && error.code === 'NOT_FOUND') return false;
              throw error;
            }
          })
          .map((item) => item.value),
        nextCursor: page.nextCursor,
      };
    });
  }
  return {
    async listChannels(actor: AuthenticatedContext, workspaceId: string, query: ChannelListQuery) {
      const page = await listChannels(actor, workspaceId, query, 'content');
      return {
        ...page,
        items: page.items.map(({ id, workspaceId, name, type, accessMode, revision }) => ({
          id,
          workspaceId,
          name,
          type,
          accessMode,
          revision,
        })),
      };
    },
    listManagedChannels(actor: AuthenticatedContext, workspaceId: string, query: ChannelListQuery) {
      return listChannels(actor, workspaceId, query, 'manage');
    },
    async openWorkspace(identityInput: AuthenticatedContext, workspaceId: string) {
      const actor = identity(identityInput);
      const workspace = id(workspaceId);
      return coordinator.run({ userId: actor.userId, workspaceId: workspace }, (held) =>
        readSelection(actor, workspace, held),
      );
    },
    async listWorkspaces(
      identityInput: AuthenticatedContext,
      query: { after?: string | undefined; limit?: number | undefined },
    ) {
      const actor = identity(identityInput);
      const limit = query.limit ?? 10;
      return coordinator.run({ userId: actor.userId }, async (held) => {
        if (!barrier.isCurrent(actor, undefined, held))
          throw new WorkspaceAccessError('AUTH_REQUIRED');
        const candidates = await read(actor, (session) =>
          Membership.find({
            userId: actor.userId,
            status: 'ACTIVE',
            removedAt: null,
            ...(query.after ? { workspaceId: { $gt: new Types.ObjectId(query.after) } } : {}),
          })
            .select('workspaceId')
            .sort({ workspaceId: 1 })
            .limit(limit + 1)
            .session(session)
            .maxTimeMS(maxTimeMS)
            .lean()
            .exec(),
        );
        const items = [];
        for (const candidate of candidates.slice(0, limit)) {
          const workspaceId = candidate.workspaceId.toHexString();
          try {
            items.push(
              await held.withWorkspace(workspaceId, (scope) =>
                readSelection(actor, workspaceId, scope),
              ),
            );
          } catch (error) {
            if (!(error instanceof WorkspaceAccessError && error.code === 'NOT_FOUND')) throw error;
          }
        }
        if (Date.parse(actor.expiresAt) <= Date.now() || !barrier.isCurrent(actor, undefined, held))
          throw new WorkspaceAccessError('AUTH_REQUIRED');
        const denied = barrier.workspaceDeletionDenies(actor.userId, held);
        return {
          items: items.filter((item) => !denied.has(item.id)),
          nextCursor:
            candidates.length > limit ? candidates[limit - 1]!.workspaceId.toHexString() : null,
        };
      });
    },
    resolveChannelAccess,
    resolveChannelAccessHeld,
    // M4 refreshes peers while holding the room's Workspace gate. This read-only
    // port never acquires a peer User gate or authorizes a mutation for that peer.
    // Session, membership, PRIVATE grant and shared deny checks remain identical.
    async resolvePeerChannelAccessHeld(
      input: AccessInput,
      context: CoordinationContext,
      remaining?: DatabaseDeadline,
    ) {
      // Read-only MAIN resolution uses a snapshot session and deadline-aware
      // queries. It needs no transaction commit/abort I/O after the read budget.
      const access = await readChannelAccessHeld(input, context, remaining, !!remaining, true);
      remaining?.();
      // Auth denies use the peer's independent User gate and may be installed
      // while the snapshot transaction is completing under this Workspace gate.
      if (!barrier.isCurrent(identity(input.identity), access, context))
        throw new WorkspaceAccessError('NOT_FOUND');
      return access;
    },
    requireWorkspacePermissionHeld,
    async requireWorkspacePermission(input: WorkspaceInput) {
      const actor = identity(input.identity);
      return coordinator.run(
        { userId: actor.userId, workspaceId: id(input.workspaceId) },
        (context) => requireWorkspacePermissionHeld(input, context),
      );
    },
  };
}
