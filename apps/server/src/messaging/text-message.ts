import { Schema, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { textHistoryMaxLimit, textMessageSendBodySchema } from '@colearnia/contracts';
import type { IndexRequirement } from '../lib/database-preflight.js';
import type { createDatabase } from '../lib/database.js';
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
  if (!result.success) {
    for (const issue of result.error.issues) this.invalidate(String(issue.path[0]), issue.message);
  }
  if (this.rootMessageId !== null) this.invalidate('rootMessageId', 'Expected a root message');
  if (!Array.isArray(this.attachmentIds) || this.attachmentIds.length) {
    this.invalidate('attachmentIds', 'Expected an empty attachment list');
  }
});
for (const index of textMessageIndexes) {
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

  return {
    async append(input: {
      conversationId: Types.ObjectId;
      senderId: Types.ObjectId;
      clientMessageId: string;
      text: string;
      createdAt: Date;
    }) {
      const { conversationId, senderId, clientMessageId, text, createdAt } = input;
      bodySchema.parse({ clientMessageId, text });
      const id = new Types.ObjectId();
      const scope = { _id: conversationId, kind: 'CHANNEL', closedAt: null };
      return database.transaction(async (session) => {
        const conversation = await Conversation.findOne(scope).session(session).lean();
        if (!conversation) return { outcome: 'not-found' } as const;
        const existing = await Message.findOne({ conversationId, senderId, clientMessageId })
          .session(session)
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
        const updated = await Conversation.findOneAndUpdate(
          scope,
          { $inc: { lastMessageCommitSeq: 1 } },
          { session, returnDocument: 'after', timestamps: false },
        ).orFail();
        const message = await new Message({
          _id: id,
          conversationId,
          senderId,
          clientMessageId,
          text,
          createdAt,
          commitSeq: updated.lastMessageCommitSeq,
        }).save({ session });
        return { outcome: 'created', message: message.toObject() } as const;
      });
    },
    async listRoots(conversationId: Types.ObjectId, limit: number, cursor?: TextRootCursor) {
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
        ...(cursor && {
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
          ],
        }),
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
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
