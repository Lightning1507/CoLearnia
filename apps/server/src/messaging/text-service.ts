import { createHmac, timingSafeEqual } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import type {
  AuthenticatedContext,
  CommonErrorCode,
  TextHistoryMessage,
} from '@colearnia/contracts';
import { workspaceDocumentIdSchema } from '@colearnia/contracts';
import { z } from 'zod';
import type { Database } from '../lib/database.js';
import { isDatabaseUnavailableError } from '../lib/database.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import type { OperationCoordinator } from '../lib/operation-coordinator.js';
import { channelModels } from '../workspaces/channel-models.js';
import { WorkspaceAccessError } from '../workspaces/access-service.js';
import type { createWorkspaceAccessService } from '../workspaces/access-service.js';
import { conversationModel } from './conversation.js';
import { createTextMessageRepository } from './text-message.js';
import type { MessagingBudget } from './budget.js';

class TextError extends Error {
  constructor(readonly code: CommonErrorCode) {
    super(code);
  }
}

export function textErrorCode(error: unknown): CommonErrorCode {
  if (error instanceof TextError || error instanceof WorkspaceAccessError) return error.code;
  if (error instanceof z.ZodError) return 'VALIDATION_ERROR';
  if (error instanceof CoordinationError && error.code !== 'INVALID_CONTEXT') return 'SERVER_BUSY';
  if (
    isDatabaseUnavailableError(error) ||
    (error instanceof mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult'))
  )
    return 'DEPENDENCY_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

const cursorBody = z.tuple([
  workspaceDocumentIdSchema,
  workspaceDocumentIdSchema,
  z.iso.datetime(),
  workspaceDocumentIdSchema,
]);
type CursorBody = z.infer<typeof cursorBody>;
type Handler = 'text' | 'history';
type Slot = { handler: Handler; user: string; workspace?: string; bytes: number };

export function createTextService(
  database: Database,
  coordinator: OperationCoordinator,
  access: ReturnType<typeof createWorkspaceAccessService>,
  indexesReady: () => boolean,
  secret: string,
  budget: MessagingBudget | undefined,
) {
  const { Channel } = channelModels(database.connection);
  const Conversation = conversationModel(database.connection);
  const messages = createTextMessageRepository(database);
  const sendBuckets = new Map<string, { tokens: number; at: number }>();
  const active = new Set<Slot>();

  // A bucket fully refills in two seconds. Bound idle state even during a burst of distinct users.
  function admitSend(user: string) {
    const now = performance.now();
    for (const [key, state] of sendBuckets) {
      if (now - state.at < 2000) break;
      sendBuckets.delete(key);
    }
    const previous = sendBuckets.get(user);
    if (!previous && sendBuckets.size >= 1024) throw new TextError('SERVER_BUSY');
    const tokens = previous ? Math.min(10, previous.tokens + (now - previous.at) * 0.005) : 10;
    if (tokens < 1) throw new TextError('RATE_LIMITED');
    sendBuckets.delete(user);
    sendBuckets.set(user, { tokens: tokens - 1, at: now });
  }

  const waiting = new Set<Slot>();

  function sign(encoded: string) {
    return createHmac('sha256', secret).update('text-history:').update(encoded).digest();
  }

  function encodeCursor(body: CursorBody) {
    const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
    return encoded + '.' + sign(encoded).toString('base64url');
  }

  function decodeCursor(value: string, channel: string, conversation: string) {
    const [encoded, signature, extra] = value.split('.');
    if (!encoded || !signature || extra !== undefined) throw new TextError('VALIDATION_ERROR');
    const expected = sign(encoded);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new TextError('VALIDATION_ERROR');
    }
    const [channelId, conversationId, createdAt, id] = cursorBody.parse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString()),
    );
    if (channelId !== channel || conversationId !== conversation) {
      throw new TextError('VALIDATION_ERROR');
    }
    return {
      conversationId: new Types.ObjectId(conversationId),
      createdAt: new Date(createdAt),
      id: new Types.ObjectId(id),
    };
  }

  async function run<T>(
    handler: Handler,
    actor: AuthenticatedContext,
    channelId: string,
    bytes: number,
    work: (
      scope: { channelId: string; conversationId: Types.ObjectId },
      timeout: number,
    ) => Promise<T>,
  ) {
    if (Date.parse(actor.expiresAt) <= Date.now()) throw new TextError('AUTH_REQUIRED');
    const limit = budget?.handlers[handler];
    if (!budget || !limit || !indexesReady() || !database.isConnected()) {
      throw new TextError('DEPENDENCY_UNAVAILABLE');
    }
    if (bytes > limit.payloadBytes) throw new TextError('PAYLOAD_TOO_LARGE');
    const user = actor.userId.toLowerCase();
    const sameHandler = [...active].filter((item) => item.handler === handler);
    if (
      active.size >=
        Math.min(
          budget.process.inFlight - budget.revocation.reservedInFlight,
          budget.database.maxPoolSize,
        ) ||
      [...active].reduce((sum, item) => sum + item.bytes, bytes) > budget.process.bytes ||
      sameHandler.length >= limit.processInFlight ||
      sameHandler.reduce((sum, item) => sum + item.bytes, bytes) > limit.processBytes ||
      sameHandler.filter((item) => item.user === user).length >= limit.perUserInFlight
    )
      throw new TextError('SERVER_BUSY');

    const slot: Slot = {
      handler,
      user,
      bytes,
    };
    active.add(slot);
    const deadline = performance.now() + limit.executionMs;
    const remaining = () => {
      const ms = Math.floor(deadline - performance.now());
      if (ms <= 0) throw new TextError('DEPENDENCY_UNAVAILABLE');
      return Math.min(ms, budget.database.queryTimeoutMs);
    };
    try {
      const channel = await Channel.findOne({ _id: channelId, deletedAt: null })
        .select('workspaceId')
        .maxTimeMS(remaining())
        .lean();
      if (!channel) throw new TextError('NOT_FOUND');
      const workspaceId = channel.workspaceId.toHexString();
      const others = [...active].filter((item) => item !== slot && item.handler === handler);
      if (
        others.filter((item) => item.workspace === workspaceId).length >= limit.perScopeInFlight
      ) {
        throw new TextError('SERVER_BUSY');
      }
      slot.workspace = workspaceId;
      const mayQueue =
        waiting.size < budget.process.queued &&
        [...waiting].filter((item) => item.handler === handler).length < limit.processQueued;
      if (mayQueue) waiting.add(slot);
      return await coordinator.run(
        { userId: user, workspaceId },
        async (held) => {
          waiting.delete(slot);
          remaining();
          const current = await access.resolveChannelAccessHeld(
            { identity: actor, channelId, workspaceId },
            held,
          );
          if (current.channelType !== 'TEXT') throw new TextError('NOT_FOUND');
          if (!current.canReadContent) throw new TextError('FORBIDDEN');
          const conversation = await Conversation.findOne({
            kind: 'CHANNEL',
            workspaceId,
            'scope.channelId': channelId,
            closedAt: null,
          })
            .select('_id')
            .maxTimeMS(remaining())
            .lean();
          if (!conversation) throw new TextError('NOT_FOUND');
          if (Date.parse(actor.expiresAt) <= Date.now()) throw new TextError('AUTH_REQUIRED');
          if (handler === 'text') admitSend(user);
          const result = await work({ channelId, conversationId: conversation._id }, remaining());
          if (Date.parse(actor.expiresAt) <= Date.now()) throw new TextError('AUTH_REQUIRED');
          remaining();
          return result;
        },
        {
          noWait: !mayQueue,
          waitTimeoutMs: Math.min(limit.queueWaitMs, remaining(), coordinator.maxWaitTimeoutMs),
        },
      );
    } finally {
      waiting.delete(slot);
      active.delete(slot);
    }
  }

  type Scope = { channelId: string; conversationId: Types.ObjectId };
  type Stored = Pick<
    Awaited<ReturnType<typeof messages.listRoots>>['items'][number],
    '_id' | 'senderId' | 'clientMessageId' | 'text' | 'createdAt' | 'replyCount' | 'commitSeq'
  >;
  function toDto(scope: Scope, row: Stored): TextHistoryMessage {
    return {
      channelId: scope.channelId,
      conversationId: scope.conversationId.toHexString(),
      rootMessageId: null,
      id: row._id.toHexString(),
      senderId: row.senderId.toHexString(),
      clientMessageId: row.clientMessageId,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      replyCount: row.replyCount ?? 0,
      ...(row.commitSeq == null ? {} : { commitSeq: row.commitSeq }),
    };
  }

  return {
    send(
      actor: AuthenticatedContext,
      channelId: string,
      input: { clientMessageId: string; text: string; rootMessageId?: string | undefined },
    ) {
      if (input.rootMessageId !== undefined) throw new TextError('VALIDATION_ERROR');
      return run(
        'text',
        actor,
        channelId,
        Buffer.byteLength(JSON.stringify(input)),
        async (scope, timeout) => {
          const result = await messages.append(
            {
              conversationId: scope.conversationId,
              senderId: new Types.ObjectId(actor.userId),
              clientMessageId: input.clientMessageId,
              text: input.text,
              createdAt: new Date(),
            },
            timeout,
          );
          if (result.outcome === 'not-found') throw new TextError('NOT_FOUND');
          if (result.outcome === 'conflict') throw new TextError('CONFLICT');
          return { outcome: result.outcome, message: toDto(scope, result.message) };
        },
      );
    },
    history(
      actor: AuthenticatedContext,
      channelId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      return run(
        'history',
        actor,
        channelId,
        Buffer.byteLength(JSON.stringify(query)),
        async (scope, timeout) => {
          const conversationId = scope.conversationId.toHexString();
          const cursor = query.cursor
            ? decodeCursor(query.cursor, channelId, conversationId)
            : undefined;
          const page = await messages.listRoots(scope.conversationId, query.limit, cursor, timeout);
          const next = page.nextCursor;
          return {
            mode: 'history' as const,
            scope: { channelId, conversationId, rootMessageId: null },
            items: page.items.map((row) => toDto(scope, row)),
            nextCursor: next
              ? encodeCursor([
                  channelId,
                  conversationId,
                  next.createdAt.toISOString(),
                  next.id.toHexString(),
                ])
              : null,
          };
        },
      );
    },
  };
}
