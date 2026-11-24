import { createHmac, timingSafeEqual } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import type {
  AuthenticatedContext,
  CommonErrorCode,
  TextHistoryMessage,
  TextMessageHistoryQuery,
  TextMessageHistoryPage,
  ChannelAccessSnapshot,
} from '@colearnia/contracts';
import { textMessageMaxCodePoints, workspaceDocumentIdSchema } from '@colearnia/contracts';
import { z } from 'zod';
import type { Database } from '../lib/database.js';
import { databaseQueryOptions, isDatabaseUnavailableError } from '../lib/database.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import type { OperationCoordinator } from '../lib/operation-coordinator.js';
import { channelModels } from '../workspaces/channel-models.js';
import { WorkspaceAccessError } from '../workspaces/access-service.js';
import type { createWorkspaceAccessService } from '../workspaces/access-service.js';
import { conversationModel } from './conversation.js';
import { createTextMessageRepository, TextCommitBusyError } from './text-message.js';
import type { TextCommitRecovery } from './text-message.js';
import type { MessagingBudget } from './budget.js';
import {
  createTextSyncRegistry,
  TextSyncError,
  type TextSyncLimits,
  type SyncEntry,
} from './text-sync.js';

class TextError extends Error {
  constructor(readonly code: CommonErrorCode) {
    super(code);
  }
}

export function textErrorCode(error: unknown): CommonErrorCode {
  if (
    error instanceof TextError ||
    error instanceof TextSyncError ||
    error instanceof WorkspaceAccessError
  )
    return error.code;
  if (error instanceof z.ZodError) return 'VALIDATION_ERROR';
  if (error instanceof TextCommitBusyError) return 'SERVER_BUSY';
  if (error instanceof CoordinationError && error.code !== 'INVALID_CONTEXT') return 'SERVER_BUSY';
  if (
    isDatabaseUnavailableError(error) ||
    (error instanceof mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult'))
  )
    return 'DEPENDENCY_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

const legacyCursorBody = z.tuple([
  workspaceDocumentIdSchema,
  workspaceDocumentIdSchema,
  z.iso.datetime(),
  workspaceDocumentIdSchema,
]);
const cursorBody = z.union([
  legacyCursorBody,
  legacyCursorBody.rest(z.number().int().nonnegative().safe()).refine((v) => v.length === 5),
]);
type CursorBody = z.infer<typeof cursorBody>;
type Handler = 'text' | 'history' | 'subscription';
type Slot = { handler: Handler; user: string; workspace?: string; bytes: number };

export function createTextService(
  database: Database,
  coordinator: OperationCoordinator,
  access: ReturnType<typeof createWorkspaceAccessService>,
  indexesReady: () => boolean,
  secret: string,
  budget: MessagingBudget | undefined,
  observe?: (event: 'slot-acquired' | 'lookup-done' | 'slot-released') => void,
  authSessionFenceTrial = false,
  syncLimits?: TextSyncLimits,
  syncReady: () => boolean = () => false,
  commitRecovery?: TextCommitRecovery,
) {
  const { Channel } = channelModels(database.connection);
  const Conversation = conversationModel(database.connection);
  const messages = createTextMessageRepository(database, commitRecovery);
  const sendBuckets = new Map<string, { tokens: number; at: number }>();
  const active = new Set<Slot>();
  const sync = syncLimits ? createTextSyncRegistry(secret, syncLimits) : undefined;
  const delivering = new Set<string>();

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
    const [channelId, conversationId, createdAt, id, through] = cursorBody.parse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString()),
    );
    if (channelId !== channel || conversationId !== conversation) {
      throw new TextError('VALIDATION_ERROR');
    }
    return {
      conversationId: new Types.ObjectId(conversationId),
      createdAt: new Date(createdAt),
      id: new Types.ObjectId(id),
      through,
    };
  }

  async function run<T>(
    handler: Handler,
    actor: AuthenticatedContext,
    channelId: string,
    requestBytes: number,
    responseReserve: number,
    work: (
      scope: { channelId: string; conversationId: Types.ObjectId; access: ChannelAccessSnapshot },
      remaining: () => number,
    ) => Promise<T>,
  ) {
    if (Date.parse(actor.expiresAt) <= Date.now()) throw new TextError('AUTH_REQUIRED');
    const limit = budget?.handlers[handler];
    if (!budget || !limit || !indexesReady() || !database.isConnected()) {
      throw new TextError('DEPENDENCY_UNAVAILABLE');
    }
    if (requestBytes > limit.payloadBytes) throw new TextError('PAYLOAD_TOO_LARGE');
    const bytes = requestBytes + responseReserve;
    const user = actor.userId.toLowerCase();
    const sameHandler = [...active].filter((item) => item.handler === handler);
    if (
      active.size >=
        Math.min(
          budget.process.inFlight - budget.revocation.reservedInFlight,
          budget.database.maxPoolSize,
        ) ||
      [...active].reduce((sum, item) => sum + item.bytes, bytes) + (sync?.retainedBytes() ?? 0) >
        budget.process.bytes ||
      sameHandler.length >= limit.processInFlight ||
      sameHandler.reduce((sum, item) => sum + item.bytes, bytes) +
        (handler === 'subscription' ? (sync?.retainedBytes() ?? 0) : 0) >
        limit.processBytes ||
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
      observe?.('slot-acquired');
      const channel = await Channel.findOne({ _id: channelId, deletedAt: null })
        .select('workspaceId')
        .setOptions(databaseQueryOptions(remaining))
        .lean();
      observe?.('lookup-done');
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
            remaining,
            handler !== 'text',
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
            .setOptions(databaseQueryOptions(remaining))
            .lean();
          if (!conversation) throw new TextError('NOT_FOUND');
          if (Date.parse(actor.expiresAt) <= Date.now()) throw new TextError('AUTH_REQUIRED');
          if (handler === 'text') admitSend(user);
          const result = await work(
            { channelId, conversationId: conversation._id, access: current },
            remaining,
          );
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
      observe?.('slot-released');
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

  async function publishCommitted(message: TextHistoryMessage) {
    if (!sync || !syncReady() || message.rootMessageId !== null || message.commitSeq === undefined)
      return;
    // Reserve at most one pending delivery per lease, then drain serially.
    // Do not manufacture a process/pool overload by fanning out N DB checks at once.
    const pending = sync
      .entries()
      .filter(
        (entry) =>
          entry.scope.channelId === message.channelId &&
          entry.scope.conversationId === message.conversationId,
      );
    const ready = pending.filter((entry) => {
      if (delivering.has(entry.id)) {
        sync.close(entry, 'RESYNC_REQUIRED');
        return false;
      }
      delivering.add(entry.id);
      return true;
    });
    for (const entry of ready) {
      try {
        await run(
          'subscription',
          entry.actor,
          entry.scope.channelId,
          Buffer.byteLength(JSON.stringify(message)),
          0,
          async (scope) => {
            sync.current(entry, entry.actor, scope.access);
            if (scope.conversationId.toHexString() !== entry.scope.conversationId)
              throw new TextSyncError('CONFLICT');
            if (!entry.emit('message.created', { subscriptionId: entry.id, message }))
              sync.close(entry, 'RESYNC_REQUIRED');
          },
        );
      } catch (error) {
        const code = textErrorCode(error);
        sync.close(
          entry,
          ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'].includes(code)
            ? 'ACCESS_REVOKED'
            : 'RESYNC_REQUIRED',
        );
      } finally {
        delivering.delete(entry.id);
      }
    }
  }

  return {
    syncRevocation: sync?.revocation,
    stop: () => sync?.stop(),
    closeSubscriptions: (owner: string) => sync?.closeOwner(owner),
    unsubscribe: (id: string, owner: string) => sync?.unsubscribe(id, owner),
    async subscribe(
      actor: AuthenticatedContext,
      channelId: string,
      owner: string,
      emit: SyncEntry['emit'],
      afterCheckpoint?: string,
    ) {
      if (!sync || !syncReady()) throw new TextError('DEPENDENCY_UNAVAILABLE');
      let entry: SyncEntry | undefined;
      try {
        return await run(
          'subscription',
          actor,
          channelId,
          afterCheckpoint?.length ?? 0,
          8192,
          async (scope, remaining) => {
            const through = await messages.highWater(scope.conversationId, remaining);
            entry = sync.open(
              {
                actor,
                scope: {
                  channelId,
                  conversationId: scope.conversationId.toHexString(),
                  rootMessageId: null,
                },
                access: scope.access,
                owner,
                emit,
              },
              through,
              afterCheckpoint,
            );
            return {
              scope: entry.scope,
              subscriptionId: entry.id,
              syncToken: entry.token,
              throughCheckpoint: entry.throughCheckpoint,
            };
          },
        );
      } catch (error) {
        if (entry) sync.close(entry);
        throw error;
      }
    },
    publishCommitted,
    async send(
      actor: AuthenticatedContext,
      channelId: string,
      input: { clientMessageId: string; text: string; rootMessageId?: string | undefined },
    ) {
      if (input.rootMessageId !== undefined) throw new TextError('VALIDATION_ERROR');
      const result = await run(
        'text',
        actor,
        channelId,
        Buffer.byteLength(JSON.stringify(input)),
        0,
        async (scope, remaining) => {
          const result = await messages.append(
            {
              conversationId: scope.conversationId,
              senderId: new Types.ObjectId(actor.userId),
              clientMessageId: input.clientMessageId,
              text: input.text,
              createdAt: new Date(),
              ...(authSessionFenceTrial ? { fenceAuthSessionId: actor.authSessionId } : {}),
            },
            remaining,
          );
          if (result.outcome === 'session-denied') throw new TextError('AUTH_REQUIRED');
          if (result.outcome === 'not-found') throw new TextError('NOT_FOUND');
          if (result.outcome === 'conflict') throw new TextError('CONFLICT');
          return { outcome: result.outcome, message: toDto(scope, result.message) };
        },
      );
      if (result.outcome === 'created') void publishCommitted(result.message);
      return result;
    },
    history(
      actor: AuthenticatedContext,
      channelId: string,
      query: TextMessageHistoryQuery | { limit: number; cursor?: string | undefined },
    ) {
      return run(
        'history',
        actor,
        channelId,
        Buffer.byteLength(JSON.stringify(query)),
        // Include the lookahead row and reserve for BSON, DTO and JSON serialization.
        // A supplementary scalar can need 12 bytes in escaped JSON.
        4096 + (query.limit + 1) * (textMessageMaxCodePoints * 20 + 1024),
        async (scope, remaining): Promise<TextMessageHistoryPage> => {
          const conversationId = scope.conversationId.toHexString();
          const mode = 'mode' in query ? query.mode : 'history';
          if (mode !== 'history' && 'syncToken' in query) {
            if (!sync || !syncReady()) throw new TextError('DEPENDENCY_UNAVAILABLE');
            const entry = sync.find(query.syncToken, actor, scope.access);
            if (
              entry.scope.conversationId !== conversationId ||
              entry.scope.channelId !== channelId ||
              query.throughCheckpoint !== entry.throughCheckpoint
            )
              throw new TextSyncError('CONFLICT');
            if (query.mode === 'catch-up') {
              if (entry.after === undefined || query.afterCheckpoint !== entry.afterCheckpoint)
                throw new TextSyncError('CONFLICT');
              const position = query.cursor ? sync.position(entry, query.cursor) : entry.after;
              const page = await messages.catchUp(
                scope.conversationId,
                position,
                entry.through,
                query.limit,
                remaining,
              );
              sync.current(entry, actor, scope.access);
              return {
                mode: 'catch-up',
                scope: entry.scope,
                throughCheckpoint: entry.throughCheckpoint,
                items: page.items.map((row) => ({
                  ...toDto(scope, row),
                  commitSeq: row.commitSeq!,
                })),
                nextCursor: page.more ? sync.cursor(entry, page.items.at(-1)!.commitSeq!) : null,
              };
            }
            if (entry.after !== undefined) throw new TextSyncError('CONFLICT');
            const page = await messages.listRoots(
              scope.conversationId,
              query.limit,
              undefined,
              remaining(),
              entry.through,
            );
            sync.current(entry, actor, scope.access);
            const next = page.nextCursor;
            return {
              mode: 'snapshot',
              scope: entry.scope,
              throughCheckpoint: entry.throughCheckpoint,
              items: page.items.map((row) => toDto(scope, row)),
              nextCursor: next
                ? encodeCursor([
                    channelId,
                    conversationId,
                    next.createdAt.toISOString(),
                    next.id.toHexString(),
                    entry.through,
                  ])
                : null,
            };
          }
          const cursor =
            'cursor' in query && query.cursor
              ? decodeCursor(query.cursor, channelId, conversationId)
              : undefined;
          const page = await messages.listRoots(
            scope.conversationId,
            query.limit,
            cursor,
            remaining(),
            cursor?.through,
          );
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
                  ...(cursor?.through === undefined ? [] : [cursor.through]),
                ])
              : null,
          };
        },
      );
    },
  };
}
