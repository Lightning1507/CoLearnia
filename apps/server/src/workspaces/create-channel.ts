import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mongoose, { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import {
  authenticatedContextSchema,
  channelSummarySchema,
  createChannelSchema,
  workspaceDocumentIdSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext, ChannelSummary } from '@colearnia/contracts';
import { authModels } from '../auth/models.js';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
import type { CoordinationContext, OperationCoordinator } from '../lib/operation-coordinator.js';
import { allowsWorkspaceAction, hasWorkspaceAccess } from './access-policy.js';
import type { AccessRevocationBarrier } from './access-revocation.js';
import { channelModels } from './channel-models.js';
import type { CreateChannelConversation } from './ports.js';
import { auditModel } from './workspace-audit.js';
import { workspaceModels } from './workspace-models.js';

export class ChannelCreationError extends Error {
  constructor(
    public readonly code:
      | 'VALIDATION_ERROR'
      | 'AUTH_REQUIRED'
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'CONFLICT'
      | 'CHANNEL_REPLAY_UNAVAILABLE'
      | 'SERVER_BUSY'
      | 'DEPENDENCY_UNAVAILABLE',
    public readonly unconfirmed = false,
  ) {
    super(code);
    this.name = 'ChannelCreationError';
  }
}
const maxTimeMS = 5000;
type Operation = {
  hash: string;
  channelId: Types.ObjectId;
  conversationId: Types.ObjectId;
  auditId: Types.ObjectId;
  createdAt: Date;
  state: 'new' | 'unknown' | 'committed';
  expiresAt: number;
};

// Bootstrap owns one creator, using the same connection, gates and deny ledger as M1/M2.
// Collections/indexes are covered by preflightWorkspaceCreation; never provision here.
export function createChannelCreator(options: {
  database: Database;
  coordinator: OperationCoordinator;
  barrier: AccessRevocationBarrier;
  indexesReady: () => boolean;
  createConversation: CreateChannelConversation;
  replay?: { ttlMs: number; maxEntries: number };
}) {
  const { database, coordinator, barrier, indexesReady, createConversation } = options;
  const { User, AuthSession } = authModels(database.connection);
  const { Workspace, Membership } = workspaceModels(database.connection);
  const { Channel } = channelModels(database.connection);
  const Audit = auditModel(database.connection);
  const limits = { ...(options.replay ?? { ttlMs: 600_000, maxEntries: 10_000 }) };
  if (
    ![limits.ttlMs, limits.maxEntries].every((n) => Number.isSafeInteger(n) && n > 0) ||
    limits.ttlMs > 600_000 ||
    limits.maxEntries > 10_000
  )
    throw new TypeError('Invalid Channel replay limits');
  const records = new Map<string, Operation>();

  return async (raw: unknown, rawWorkspaceId: string, identity: AuthenticatedContext) => {
    const input = createChannelSchema.safeParse(raw);
    if (!input.success) throw new ChannelCreationError('VALIDATION_ERROR');
    const parsedId = workspaceDocumentIdSchema.safeParse(rawWorkspaceId);
    if (!parsedId.success) throw new ChannelCreationError('NOT_FOUND');
    const workspaceId = parsedId.data.toLowerCase();
    const parsed = authenticatedContextSchema.safeParse(identity);
    if (!parsed.success) throw new ChannelCreationError('AUTH_REQUIRED');
    const actor = {
      ...parsed.data,
      userId: parsed.data.userId.toLowerCase(),
      authSessionId: parsed.data.authSessionId.toLowerCase(),
    };
    const request = { ...input.data, requestId: input.data.requestId.toLowerCase() };
    if (!indexesReady() || !database.isConnected())
      throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE');

    return coordinator
      .run({ userId: actor.userId, workspaceId }, async (held) => {
        let expiresAt = Date.parse(actor.expiresAt);
        function current(context: CoordinationContext) {
          context.assertHeld({ userId: actor.userId, workspaceId });
          if (
            Math.min(expiresAt, Date.parse(actor.expiresAt)) <= Date.now() ||
            !barrier.isCurrent(actor, undefined, context)
          )
            throw new ChannelCreationError('AUTH_REQUIRED');
        }
        // Accept the caller's transaction; no nested coordinator or transaction admission.
        async function authorize(session?: ClientSession) {
          current(held);
          const auth = await AuthSession.findOne({
            _id: actor.authSessionId,
            userId: actor.userId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
            .session(session ?? null)
            .maxTimeMS(maxTimeMS)
            .lean();
          const user =
            auth &&
            (await User.findOne({ _id: actor.userId, status: 'ACTIVE' })
              .select('_id')
              .session(session ?? null)
              .maxTimeMS(maxTimeMS)
              .lean());
          if (!auth || !user) throw new ChannelCreationError('AUTH_REQUIRED');
          expiresAt = auth.expiresAt.getTime();
          current(held);
          const workspace = await Workspace.findOne({ _id: workspaceId, deletedAt: null })
            .session(session ?? null)
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
              .session(session ?? null)
              .maxTimeMS(maxTimeMS)
              .lean());
          const state = {
            workspace: workspace
              ? { id: workspaceId, ownerId: workspace.ownerId.toHexString(), deleted: false }
              : null,
            membership: member
              ? {
                  id: member._id.toHexString(),
                  workspaceId,
                  userId: actor.userId,
                  role: member.role,
                  status: member.status,
                  incarnation: member.incarnation,
                  revision: member.revision,
                }
              : null,
          };
          if (!hasWorkspaceAccess(state, actor.userId)) throw new ChannelCreationError('NOT_FOUND');
          if (
            !barrier.isCurrent(
              actor,
              {
                workspaceId,
                membershipId: member!._id.toHexString(),
                membershipIncarnation: member!.incarnation,
                membershipRevision: member!.revision,
              },
              held,
            )
          )
            throw new ChannelCreationError('NOT_FOUND');
          if (!allowsWorkspaceAction(state, actor.userId, 'createChannel'))
            throw new ChannelCreationError('FORBIDDEN');
          return member!;
        }
        // Always authorize before looking up a retry key, including conflicting payloads.
        await authorize();
        for (const [key, entry] of records) {
          if (entry.state === 'committed' && entry.expiresAt <= performance.now())
            records.delete(key);
        }
        const key = `${actor.userId}:${workspaceId}:CHANNEL_CREATE:${request.requestId}`;
        const hash = createHash('sha256')
          .update(
            JSON.stringify({
              name: request.name,
              type: request.type,
              accessMode: request.accessMode,
            }),
          )
          .digest('hex');
        let operation = records.get(key);
        if (operation && operation.hash !== hash) throw new ChannelCreationError('CONFLICT');
        if (!operation) {
          if (request.replayOnly) throw new ChannelCreationError('CHANNEL_REPLAY_UNAVAILABLE');
          if (records.size >= limits.maxEntries) throw new ChannelCreationError('SERVER_BUSY');
          operation = {
            hash,
            channelId: new Types.ObjectId(),
            conversationId: new Types.ObjectId(),
            auditId: new Types.ObjectId(),
            createdAt: new Date(),
            state: 'new',
            expiresAt: Infinity,
          };
          records.set(key, operation);
        }
        const entry = operation;
        const channelId = entry.channelId.toHexString();
        const dto: ChannelSummary = channelSummarySchema.parse({
          id: channelId,
          workspaceId,
          name: request.name,
          type: request.type,
          accessMode: request.accessMode,
          revision: 0,
        });
        async function reconcile() {
          // The preallocated success marker is the last write in the same transaction.
          // Never discover operations from audit requestId after process restart.
          return Boolean(
            await Audit.findOne(
              {
                _id: entry.auditId,
                workspaceId,
                actorUserId: actor.userId,
                action: 'CHANNEL_CREATE',
                'target.kind': 'CHANNEL',
                'target.id': channelId,
                requestId: request.requestId,
                outcome: 'SUCCEEDED',
                revision: 0,
                createdAt: entry.createdAt,
              },
              null,
              { maxTimeMS, readConcern: { level: 'majority' } },
            )
              .read('primary')
              .lean(),
          );
        }
        async function replay() {
          const member = await authorize();
          const channel = await Channel.findOne({
            _id: entry.channelId,
            workspaceId,
            deletedAt: null,
          })
            .maxTimeMS(maxTimeMS)
            .lean();
          if (
            !channel ||
            !barrier.isCurrent(
              actor,
              {
                workspaceId,
                membershipId: member._id.toHexString(),
                membershipIncarnation: member.incarnation,
                membershipRevision: member.revision,
                channelId,
                channelRevision: channel.revision,
              },
              held,
            )
          )
            throw new ChannelCreationError('NOT_FOUND');
          current(held);
          // This is management metadata only; PRIVATE does not gain a grant by replaying.
          return channelSummarySchema.parse({
            id: channelId,
            workspaceId,
            name: channel.name,
            type: channel.type,
            accessMode: channel.accessMode,
            revision: channel.revision,
          });
        }
        try {
          if (entry.state === 'unknown') {
            if (!(await reconcile().catch(() => false)))
              throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE', true);
            entry.state = 'committed';
            entry.expiresAt = performance.now() + limits.ttlMs;
          }
          if (entry.state === 'committed') return await replay();
          try {
            if (!indexesReady() || !database.isConnected())
              throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE');
            await database.transaction(async (session) => {
              await authorize(session);
              await new Channel({
                _id: entry.channelId,
                workspaceId,
                name: dto.name,
                type: dto.type,
                accessMode: dto.accessMode,
                order: 0,
                revision: 0,
                deletedAt: null,
                createdAt: entry.createdAt,
                updatedAt: entry.createdAt,
              }).save({ session, timestamps: false });
              if (request.type === 'TEXT') {
                const result = await createConversation({
                  workspaceId,
                  channelId,
                  conversationId: entry.conversationId.toHexString(),
                  createdAt: entry.createdAt,
                  dbSession: session,
                });
                if (result.conversationId !== entry.conversationId.toHexString())
                  throw new Error('Conversation provider returned an unexpected identity');
              }
              await new Audit({
                _id: entry.auditId,
                actorUserId: actor.userId,
                workspaceId,
                action: 'CHANNEL_CREATE',
                target: { kind: 'CHANNEL', id: channelId },
                sessionId: null,
                requestId: request.requestId,
                revision: 0,
                outcome: 'SUCCEEDED',
                createdAt: entry.createdAt,
              }).save({ session });
              await authorize(session);
            });
          } catch (error) {
            if (
              error instanceof mongoose.mongo.MongoError &&
              error.hasErrorLabel('UnknownTransactionCommitResult')
            ) {
              // Set unknown before read-back so a failed read can never discard the IDs.
              entry.state = 'unknown';
              if (!(await reconcile().catch(() => false)))
                throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE', true);
            } else throw error;
          }
          entry.state = 'committed';
          entry.expiresAt = performance.now() + limits.ttlMs;
          // Recheck time and all deny scopes after commit before reporting success.
          return await replay();
        } catch (error) {
          if (entry.state === 'new') records.delete(key);
          if (isDatabaseUnavailableError(error))
            throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE');
          throw error;
        }
      })
      .catch((error: unknown) => {
        if (isDatabaseUnavailableError(error))
          throw new ChannelCreationError('DEPENDENCY_UNAVAILABLE');
        throw error;
      });
  };
}
