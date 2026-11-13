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
import { channelConversationIndex, conversationModel } from '../messaging/conversation.js';
import type { AccessRevocationBarrier } from './access-revocation.js';
import { channelModels, channelIndexRequirements } from './channel-models.js';
import type { CreateChannelConversation } from './ports.js';
import { auditModel, workspaceAuditIndex } from './workspace-audit.js';
import { assertWorkspaceOwner } from './workspace-integrity.js';
import { workspaceModels, workspaceIndexRequirements } from './workspace-models.js';

export class WorkspaceCreationError extends Error {
  constructor(
    public readonly code: 'VALIDATION_ERROR' | 'AUTH_REQUIRED' | 'DEPENDENCY_UNAVAILABLE',
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
}) {
  const { database, coordinator, barrier, indexesReady, createConversation } = options;
  const { User, AuthSession } = authModels(database.connection);
  const { Workspace, Membership } = workspaceModels(database.connection);
  const { Channel } = channelModels(database.connection);
  const Conversation = conversationModel(database.connection);
  const Audit = auditModel(database.connection);

  return async (raw: unknown, identity: AuthenticatedContext) => {
    const input = createWorkspaceSchema.safeParse(raw);
    if (!input.success) throw new WorkspaceCreationError('VALIDATION_ERROR');
    const request = input.data;
    const parsed = authenticatedContextSchema.safeParse(identity);
    if (!parsed.success) throw new WorkspaceCreationError('AUTH_REQUIRED');
    const actor = {
      ...parsed.data,
      userId: parsed.data.userId.toLowerCase(),
      authSessionId: parsed.data.authSessionId.toLowerCase(),
    };
    if (!indexesReady() || !database.isConnected())
      throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
    const workspaceId = new Types.ObjectId();
    const membershipId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const conversationId = new Types.ObjectId();
    const auditId = new Types.ObjectId();
    const createdAt = new Date();
    const dto = workspaceSummarySchema.parse({
      id: workspaceId.toHexString(),
      name: request.name,
      ownerId: actor.userId,
      revision: 0,
    });

    return coordinator.run({ userId: actor.userId, workspaceId: dto.id }, async (held) => {
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
        // Stable IDs, primary + majority: never manufacture a second creation attempt.
        const read = { readConcern: { level: 'majority' as const }, maxTimeMS };
        const workspace = await Workspace.findOne(
          {
            _id: workspaceId,
            name: dto.name,
            ownerId: actor.userId,
            revision: 0,
            deletedAt: null,
            createdAt,
            updatedAt: createdAt,
          },
          null,
          read,
        )
          .read('primary')
          .lean();
        const member = await Membership.findOne(
          {
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
          },
          null,
          read,
        )
          .read('primary')
          .lean();
        const channel = await Channel.findOne(
          {
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
          },
          null,
          read,
        )
          .read('primary')
          .lean();
        const conversation = await Conversation.findOne(
          {
            _id: conversationId,
            workspaceId,
            kind: 'CHANNEL',
            'scope.channelId': channelId,
            closedAt: null,
            purgeAt: null,
            createdAt,
            updatedAt: createdAt,
          },
          null,
          read,
        )
          .read('primary')
          .lean();
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
        return Boolean(workspace && member && channel && conversation && audit);
      }
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
          if (!confirmed) throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE', true);
        } else if (isDatabaseUnavailableError(error) || !database.isConnected()) {
          throw new WorkspaceCreationError('DEPENDENCY_UNAVAILABLE');
        } else throw error;
      }
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
  };
}
