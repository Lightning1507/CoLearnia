import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mongoose, { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import {
  authenticatedContextSchema,
  createWorkspaceSchema,
  workspaceSummarySchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { authModels, authIndexRequirements } from '../auth/models.js';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
import { preflightIndexes } from '../lib/database-preflight.js';
import type { CoordinationContext, OperationCoordinator } from '../lib/operation-coordinator.js';
import { channelConversationIndex } from '../messaging/conversation.js';
import type { AccessRevocationBarrier } from './access-revocation.js';
import { channelModels, channelIndexRequirements } from './channel-models.js';
import type { CreateChannelConversation } from './ports.js';
import { auditModel, workspaceAuditIndex } from './workspace-audit.js';
import { assertWorkspaceOwner } from './workspace-integrity.js';
import { workspaceModels, workspaceIndexRequirements } from './workspace-models.js';

export class WorkspaceCreationError extends Error {
  constructor(
    public readonly code:
      | 'VALIDATION_ERROR'
      | 'AUTH_REQUIRED'
      | 'DEPENDENCY_UNAVAILABLE'
      | 'CONFLICT'
      | 'WORKSPACE_REPLAY_UNAVAILABLE'
      | 'FORBIDDEN'
      | 'SERVER_BUSY',
    public readonly unconfirmed = false,
    public readonly committed = false,
  ) {
    super(code);
    this.name = 'WorkspaceCreationError';
  }
}
const maxTimeMS = 5000;
export const workspaceCreationIndexRequirements = [
  ...authIndexRequirements,
  ...workspaceIndexRequirements.filter((item) => item.collection === 'memberships'),
  ...channelIndexRequirements.filter((item) => item.collection === 'channels'),
  channelConversationIndex,
  workspaceAuditIndex,
];

// Read-only. Provision collections/indexes separately; never migrate on a request.
export async function preflightWorkspaceCreation(database: Database): Promise<boolean> {
  const db = database.connection.db;
  if (!db) return false;
  const collections = await db.listCollections({}, { nameOnly: true, maxTimeMS }).toArray();
  if (
    ![
      'users',
      'authSessions',
      'workspaces',
      'memberships',
      'channels',
      'conversations',
      'auditEvents',
    ].every((name) => collections.some((item) => item.name === name))
  )
    return false;
  return (await preflightIndexes(database.connection, workspaceCreationIndexRequirements)).ready;
}

export function createWorkspaceCreator(options: {
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

  // One bootstrap-owned creator per app. User gate serializes admission and replay.
  // Never evict unresolved commits: losing their IDs would permit duplicate writes.
  const limits = { ...(options.replay ?? { ttlMs: 600_000, maxEntries: 10_000 }) };
  if (
    ![limits.ttlMs, limits.maxEntries].every((n) => Number.isSafeInteger(n) && n > 0) ||
    limits.ttlMs > 600_000 ||
    limits.maxEntries > 10_000
  )
    throw new TypeError('Invalid Workspace replay limits');
  type Creation = {
    hash: string;
    workspaceId: Types.ObjectId;
    membershipId: Types.ObjectId;
    channelId: Types.ObjectId;
    conversationId: Types.ObjectId;
    auditId: Types.ObjectId;
    createdAt: Date;
    state: 'new' | 'unknown' | 'committed';
    expiresAt: number;
  };
  const records = new Map<string, Creation>();

  return async (raw: unknown, identity: AuthenticatedContext) => {
    const input = createWorkspaceSchema.safeParse(raw);
    if (!input.success) throw new WorkspaceCreationError('VALIDATION_ERROR');
    const request = { ...input.data, requestId: input.data.requestId.toLowerCase() };
    const parsed = authenticatedContextSchema.safeParse(identity);
    if (!parsed.success) throw new WorkspaceCreationError('AUTH_REQUIRED');
    const actor = {
      ...parsed.data,
      userId: parsed.data.userId.toLowerCase(),
      authSessionId: parsed.data.authSessionId.toLowerCase(),
    };
    if (!indexesReady() || !database.isConnected())
      throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
    return coordinator
      .run({ userId: actor.userId }, async (userHeld) => {
        // Check credentials before admitting a key, disclosing a conflict or replaying data.
        const checkAuth = async (context: CoordinationContext) => {
          context.assertHeld({ userId: actor.userId });
          if (
            Date.parse(actor.expiresAt) <= Date.now() ||
            !barrier.isCurrent(actor, undefined, context)
          )
            throw new WorkspaceCreationError('AUTH_REQUIRED');
          const auth = await AuthSession.findOne({
            _id: actor.authSessionId,
            userId: actor.userId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
            .select('_id expiresAt')
            .maxTimeMS(maxTimeMS)
            .lean();
          const user =
            auth &&
            (await User.exists({ _id: actor.userId, status: 'ACTIVE' }).maxTimeMS(maxTimeMS));
          if (
            !auth ||
            !user ||
            Math.min(auth.expiresAt.getTime(), Date.parse(actor.expiresAt)) <= Date.now()
          )
            throw new WorkspaceCreationError('AUTH_REQUIRED');
          return auth.expiresAt.getTime();
        };
        await checkAuth(userHeld);
        const now = performance.now();
        for (const [key, value] of records)
          if (value.state === 'committed' && value.expiresAt <= now) records.delete(key);
        const key = `${actor.userId}:WORKSPACE_CREATE:${request.requestId.toLowerCase()}`;
        const hash = createHash('sha256')
          .update(JSON.stringify({ name: request.name }))
          .digest('hex');
        let record = records.get(key);
        if (record && record.hash !== hash) throw new WorkspaceCreationError('CONFLICT');
        if (!record) {
          if (request.replayOnly) throw new WorkspaceCreationError('WORKSPACE_REPLAY_UNAVAILABLE');
          if (records.size >= limits.maxEntries) throw new WorkspaceCreationError('SERVER_BUSY');
          record = {
            hash,
            workspaceId: new Types.ObjectId(),
            membershipId: new Types.ObjectId(),
            channelId: new Types.ObjectId(),
            conversationId: new Types.ObjectId(),
            auditId: new Types.ObjectId(),
            createdAt: new Date(),
            state: 'new',
            expiresAt: Infinity,
          };
          records.set(key, record);
        }
        const operation = record;
        const { workspaceId, membershipId, channelId, conversationId, auditId, createdAt } =
          operation;
        const dto = workspaceSummarySchema.parse({
          id: workspaceId.toHexString(),
          name: request.name,
          ownerId: actor.userId,
          revision: 0,
        });
        try {
          return await userHeld.withWorkspace(dto.id, async (held) => {
            let sessionExpiresAt = Date.parse(actor.expiresAt);
            function current(context: CoordinationContext) {
              context.assertHeld({ userId: actor.userId, workspaceId: dto.id });
              if (
                Math.min(Date.parse(actor.expiresAt), sessionExpiresAt) <= Date.now() ||
                !barrier.isCurrent(actor, undefined, context)
              )
                throw new WorkspaceCreationError('AUTH_REQUIRED');
            }
            async function confirmSession(session: ClientSession) {
              current(held);
              const auth = await AuthSession.findOne({
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
                auth &&
                (await User.exists({ _id: actor.userId, status: 'ACTIVE' })
                  .session(session)
                  .maxTimeMS(maxTimeMS));
              if (!auth || !user) throw new WorkspaceCreationError('AUTH_REQUIRED');
              sessionExpiresAt = auth.expiresAt.getTime();
              current(held);
            }
            async function reconcile(): Promise<boolean> {
              // This exact SUCCEEDED audit is inserted last in the SAME transaction as
              // all four entities. A majority read confirms that commit even if current
              // entities were renamed, rejoined, transferred, closed or deleted later.
              // Look up only the preallocated audit ID retained by this runtime operation;
              // never discover/replay operations by querying audit requestId after restart.
              const read = { readConcern: { level: 'majority' as const }, maxTimeMS };
              const audit = await Audit.findOne(
                {
                  _id: auditId,
                  actorUserId: actor.userId,
                  action: 'WORKSPACE_CREATE',
                  workspaceId,
                  sessionId: null,
                  'target.kind': 'WORKSPACE',
                  'target.id': dto.id,
                  requestId: request.requestId,
                  revision: 0,
                  outcome: 'SUCCEEDED',
                  createdAt,
                },
                null,
                read,
              )
                .read('primary')
                .lean();
              return Boolean(audit);
            }
            async function replayResult() {
              sessionExpiresAt = await checkAuth(held);
              current(held);
              const workspace = await Workspace.findOne({ _id: workspaceId, deletedAt: null })
                .select('_id name ownerId revision')
                .maxTimeMS(maxTimeMS)
                .lean();
              const member = await Membership.findOne({
                workspaceId,
                userId: actor.userId,
                status: 'ACTIVE',
                removedAt: null,
              })
                .maxTimeMS(maxTimeMS)
                .lean();
              if (
                !workspace ||
                !member ||
                !barrier.isCurrent(
                  actor,
                  {
                    workspaceId: dto.id,
                    membershipId: member._id.toHexString(),
                    membershipIncarnation: member.incarnation,
                    membershipRevision: member.revision,
                  },
                  held,
                )
              )
                throw new WorkspaceCreationError('FORBIDDEN');
              current(held);
              return workspaceSummarySchema.parse({
                id: dto.id,
                name: workspace.name,
                ownerId: workspace.ownerId.toHexString(),
                revision: workspace.revision,
              });
            }
            if (operation.state === 'unknown') {
              let confirmed = false;
              try {
                confirmed = await reconcile();
              } catch {
                /* Keep unresolved IDs. */
              }
              if (!confirmed) throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE', true);
              operation.state = 'committed';
              operation.expiresAt = performance.now() + limits.ttlMs;
            }
            if (operation.state === 'committed') return replayResult();
            try {
              if (!indexesReady() || !database.isConnected())
                throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
              current(held);
              await database.transaction(async (session) => {
                await confirmSession(session);
                await new Workspace({
                  _id: workspaceId,
                  name: dto.name,
                  ownerId: actor.userId,
                  revision: 0,
                  deletedAt: null,
                  createdAt,
                  updatedAt: createdAt,
                }).save({ session, timestamps: false });
                await new Membership({
                  _id: membershipId,
                  workspaceId,
                  userId: actor.userId,
                  role: 'OWNER',
                  status: 'ACTIVE',
                  incarnation: 1,
                  revision: 0,
                  joinedAt: createdAt,
                  removedAt: null,
                  createdAt,
                  updatedAt: createdAt,
                }).save({ session, timestamps: false });
                await new Channel({
                  _id: channelId,
                  workspaceId,
                  name: 'general',
                  type: 'TEXT',
                  accessMode: 'WORKSPACE',
                  order: 0,
                  revision: 0,
                  deletedAt: null,
                  createdAt,
                  updatedAt: createdAt,
                }).save({ session, timestamps: false });
                const result = await createConversation({
                  workspaceId: dto.id,
                  channelId: channelId.toHexString(),
                  conversationId: conversationId.toHexString(),
                  createdAt,
                  dbSession: session,
                });
                if (result.conversationId !== conversationId.toHexString())
                  throw new Error('Conversation provider returned an unexpected identity');
                await assertWorkspaceOwner(database.connection, workspaceId, session);
                await new Audit({
                  _id: auditId,
                  actorUserId: actor.userId,
                  action: 'WORKSPACE_CREATE',
                  workspaceId,
                  sessionId: null,
                  target: { kind: 'WORKSPACE', id: dto.id },
                  requestId: request.requestId,
                  revision: 0,
                  outcome: 'SUCCEEDED',
                  createdAt,
                }).save({ session });
                await confirmSession(session);
              });
            } catch (error) {
              const unknownCommit =
                error instanceof mongoose.mongo.MongoError &&
                error.hasErrorLabel('UnknownTransactionCommitResult');
              if (unknownCommit) {
                let confirmed = false;
                try {
                  confirmed = await reconcile();
                } catch {
                  /* Remains unconfirmed. */
                }
                if (!confirmed) {
                  operation.state = 'unknown';
                  throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE', true);
                }
              } else if (isDatabaseUnavailableError(error) || !database.isConnected()) {
                throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
              } else throw error;
            }
            operation.state = 'committed';
            operation.expiresAt = performance.now() + limits.ttlMs;
            try {
              current(held);
            } catch (error) {
              // The write is durable even if auth expired during commit/read-back. Do not
              // let a consumer mistake this for a rejected, safe-to-replay creation.
              if (error instanceof WorkspaceCreationError && error.code === 'AUTH_REQUIRED')
                throw new WorkspaceCreationError('AUTH_REQUIRED', false, true);
              throw error;
            }
            return dto;
          });
        } catch (error) {
          // Only definitive aborts are safe to retry as a fresh transaction.
          if (operation.state === 'new') records.delete(key);
          if (isDatabaseUnavailableError(error))
            throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
          throw error;
        }
      })
      .catch((error: unknown) => {
        if (isDatabaseUnavailableError(error))
          throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
        throw error;
      });
  };
}
