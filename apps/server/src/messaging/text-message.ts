import { mongo, Schema, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { textHistoryMaxLimit, textMessageSendBodySchema } from '@colearnia/contracts';
import type { IndexRequirement } from '../lib/database-preflight.js';
import { authModels } from '../auth/models.js';
import { databaseQueryOptions } from '../lib/database.js';
import type { createDatabase, DatabaseDeadline } from '../lib/database.js';
import { conversationModel } from './conversation.js';

export const textMessageIndexes = [
  {
    collection: 'messages',
    name: 'uq_message_retry',
    key: { conversationId: 1, senderId: 1, clientMessageId: 1 },
    unique: true,
  },
  {
    collection: 'messages',
    name: 'ix_message_scope_cursor',
    key: { conversationId: 1, rootMessageId: 1, createdAt: -1, _id: -1 },
  },
] as const satisfies readonly IndexRequirement[];

export const textSyncIndexes = [
  {
    collection: 'messages',
    name: 'ix_message_scope_commit',
    key: { conversationId: 1, rootMessageId: 1, commitSeq: 1 },
  },
] as const satisfies readonly IndexRequirement[];

const bodySchema = textMessageSendBodySchema.omit({ rootMessageId: true });
const schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    clientMessageId: { type: String, required: true },
    text: { type: String, required: true },
    rootMessageId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    attachmentIds: { type: [Schema.Types.ObjectId], default: [] },
    replyCount: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    commitSeq: { type: Number, min: 1, validate: Number.isSafeInteger },
    createdAt: { type: Date, required: true, immutable: true },
  },
  { collection: 'messages', strict: 'throw', versionKey: false },
);

schema.pre('validate', function () {
  const result = bodySchema.safeParse({ clientMessageId: this.clientMessageId, text: this.text });
  if (result.success) {
    this.clientMessageId = result.data.clientMessageId;
  } else {
    for (const issue of result.error.issues) this.invalidate(String(issue.path[0]), issue.message);
  }
  if (this.rootMessageId !== null) this.invalidate('rootMessageId', 'Expected a root message');
  if (!Array.isArray(this.attachmentIds) || this.attachmentIds.length) {
    this.invalidate('attachmentIds', 'Expected an empty attachment list');
  }
});
for (const index of [...textMessageIndexes, ...textSyncIndexes]) {
  schema.index(index.key, { name: index.name, ...('unique' in index && { unique: index.unique }) });
}

function registerTextMessageModel(connection: Connection) {
  return connection.model('TextMessage', schema);
}

const registeredModels = new WeakMap<Connection, ReturnType<typeof registerTextMessageModel>>();

export function textMessageModel(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const model = registerTextMessageModel(connection);
  registeredModels.set(connection, model);
  return model;
}

export type TextRootCursor = {
  conversationId: Types.ObjectId;
  createdAt: Date;
  id: Types.ObjectId;
};

// Transport code must authorize the actor and resolve the open TEXT conversation first.
export function createTextMessageRepository(database: ReturnType<typeof createDatabase>) {
  const Message = textMessageModel(database.connection);
  const Conversation = conversationModel(database.connection);
  const { AuthSession } = authModels(database.connection);

  return {
    async highWater(conversationId: Types.ObjectId, remaining: DatabaseDeadline) {
      const conversation = await Conversation.findOne({ _id: conversationId, closedAt: null })
        .select('lastMessageCommitSeq')
        .readConcern('majority')
        .setOptions(databaseQueryOptions(remaining))
        .lean();
      const high = conversation?.lastMessageCommitSeq ?? 0;
      if (!conversation || !Number.isSafeInteger(high) || high < 0)
        throw new Error('Invalid sync watermark');
      return high;
    },
    async catchUp(
      conversationId: Types.ObjectId,
      after: number,
      through: number,
      limit: number,
      remaining: DatabaseDeadline,
    ) {
      const rows = await Message.find({
        conversationId,
        rootMessageId: null,
        commitSeq: { $gt: after, $lte: through },
      })
        .select('_id senderId clientMessageId text createdAt replyCount commitSeq')
        .sort({ commitSeq: 1 })
        .limit(limit + 1)
        .readConcern('majority')
        .setOptions(databaseQueryOptions(remaining))
        .lean();
      return { items: rows.slice(0, limit), more: rows.length > limit };
    },
    async append(
      input: {
        conversationId: Types.ObjectId;
        senderId: Types.ObjectId;
        clientMessageId: string;
        text: string;
        createdAt: Date;
        fenceAuthSessionId?: string;
      },
      remaining?: DatabaseDeadline,
    ) {
      const { conversationId, senderId, createdAt } = input;
      const { clientMessageId, text } = bodySchema.parse({
        clientMessageId: input.clientMessageId,
        text: input.text,
      });
      const id = new Types.ObjectId();
      const scope = { _id: conversationId, kind: 'CHANNEL', closedAt: null };
      let inserted = false;
      const append = database.transaction(async (session, queryTime = () => 5000) => {
        inserted = false;
        const conversation = await Conversation.findOne(scope)
          .session(session)
          .setOptions(databaseQueryOptions(queryTime))
          .lean();
        if (!conversation) return { outcome: 'not-found' } as const;
        const existing = await Message.findOne({ conversationId, senderId, clientMessageId })
          .session(session)
          .setOptions(databaseQueryOptions(queryTime))
          .lean();
        if (existing) {
          return existing.rootMessageId == null &&
            (existing.attachmentIds?.length ?? 0) === 0 &&
            existing.text === text
            ? ({ outcome: 'existing', message: existing } as const)
            : ({ outcome: 'conflict' } as const);
        }
        if ((conversation.lastMessageCommitSeq ?? 0) >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Conversation commit sequence exhausted');
        }
        if (input.fenceAuthSessionId !== undefined) {
          const match = await AuthSession.updateOne(
            {
              _id: input.fenceAuthSessionId,
              userId: senderId,
              revokedAt: null,
              $expr: { $gt: ['$expiresAt', '$$NOW'] },
              $or: [
                { textWriteSerial: { $exists: false } },
                { textWriteSerial: { $gte: 0, $lt: Number.MAX_SAFE_INTEGER } },
              ],
            },
            { $inc: { textWriteSerial: 1 } },
            { session, timestamps: false, ...databaseQueryOptions(queryTime) },
          );
          if (match.matchedCount !== 1) return { outcome: 'session-denied' } as const;
        }
        const updated = await Conversation.findOneAndUpdate(
          scope,
          { $inc: { lastMessageCommitSeq: 1 } },
          {
            session,
            returnDocument: 'after',
            timestamps: false,
            ...databaseQueryOptions(queryTime),
          },
        ).orFail();
        const message = new Message({
          _id: id,
          conversationId,
          senderId,
          clientMessageId,
          text,
          createdAt,
          commitSeq: updated.lastMessageCommitSeq,
        });
        await message.validate();
        const row = message.toObject();
        await Message.collection.insertOne(row, { session, ...databaseQueryOptions(queryTime) });
        inserted = true;
        return { outcome: 'created', message: row } as const;
      }, remaining);
      try {
        return await append;
      } catch (error) {
        if (
          !inserted ||
          !remaining ||
          !(error instanceof mongo.MongoError) ||
          !error.hasErrorLabel('UnknownTransactionCommitResult')
        ) {
          throw error;
        }
        // Only a majority-visible row for this exact attempt proves commit.
        // Absence, another timeout or a failed probe leave the original result unknown.
        try {
          const message = await Message.findOne({
            _id: id,
            conversationId,
            senderId,
            clientMessageId,
          })
            .readConcern('majority')
            .setOptions(databaseQueryOptions(remaining))
            .lean();
          if (message) return { outcome: 'created', message } as const;
        } catch {
          // Preserve the original commit error when the proof is unavailable.
        }
        throw error;
      }
    },
    async listRoots(
      conversationId: Types.ObjectId,
      limit: number,
      cursor?: TextRootCursor,
      maxTimeMS = 5000,
      through?: number,
    ) {
      if (!Number.isInteger(limit) || limit < 1 || limit > textHistoryMaxLimit) {
        throw new RangeError('Invalid text history limit');
      }
      if (
        cursor &&
        (!cursor.conversationId.equals(conversationId) ||
          !Number.isFinite(cursor.createdAt.getTime()))
      ) {
        throw new RangeError('Invalid text history cursor');
      }
      const rows = await Message.find({
        conversationId,
        rootMessageId: null,
        ...(through !== undefined && {
          $and: [{ $or: [{ commitSeq: { $lte: through } }, { commitSeq: { $exists: false } }] }],
        }),
        ...(cursor && {
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
          ],
        }),
      })
        .select('_id senderId clientMessageId text createdAt replyCount commitSeq')
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .readConcern('majority')
        .setOptions(databaseQueryOptions(() => maxTimeMS))
        .lean();
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit && last
            ? { conversationId, createdAt: last.createdAt, id: last._id }
            : null,
      };
    },
  };
}
