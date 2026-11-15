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
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
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
    public readonly code: 'AUTH_REQUIRED' | 'NOT_FOUND' | 'FORBIDDEN' | 'DEPENDENCY_UNAVAILABLE',
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
  async function confirmSession(actor: AuthenticatedContext, session: ClientSession) {
    const current = await AuthSession.findOne({
      _id: actor.authSessionId,
      userId: actor.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select('_id expiresAt')
      .session(session)
      .maxTimeMS(maxTimeMS)
      .lean();
    const user =
      current &&
      (await User.exists({ _id: actor.userId, status: 'ACTIVE' })
        .session(session)
        .maxTimeMS(maxTimeMS));
    if (!current || !user) throw new WorkspaceAccessError('AUTH_REQUIRED');
    return current.expiresAt.getTime();
  }
  async function readState(
    actor: AuthenticatedContext,
    workspaceId: string,
    session: ClientSession,
  ) {
    const workspace = await Workspace.findOne({ _id: workspaceId, deletedAt: null })
      .select('_id name ownerId revision deletedAt')
      .session(session)
      .maxTimeMS(maxTimeMS)
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
        .maxTimeMS(maxTimeMS)
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
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!indexesReady() || !database.isConnected())
      throw new WorkspaceAccessError('DEPENDENCY_UNAVAILABLE');
    try {
      const result = await database.transaction(async (session) => {
        const expiresAt = await confirmSession(actor, session);
        return { value: await work(session), expiresAt };
      });
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
  ) {
    if (!barrier.isCurrent(actor, undefined, context))
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
  async function resolveChannelAccessHeld(input: AccessInput, context: CoordinationContext) {
    const actor = identity(input.identity);
    const workspaceId = id(input.workspaceId);
    const channelId = id(input.channelId);
    context.assertHeld({ userId: actor.userId, workspaceId });
    return read(actor, async (session) => {
      const state = await readState(actor, workspaceId, session);
      checkBarrier(actor, state, context);
      if (!hasWorkspaceAccess(state, actor.userId)) throw new WorkspaceAccessError('NOT_FOUND');
      const channel = await Channel.findOne({ _id: channelId, workspaceId, deletedAt: null })
        .select('_id workspaceId type accessMode revision')
        .session(session)
        .maxTimeMS(maxTimeMS)
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
          .maxTimeMS(maxTimeMS)
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
      checkBarrier(actor, state, context);
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
    });
  }
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
  return {
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
