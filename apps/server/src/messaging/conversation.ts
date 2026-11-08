import { Schema, Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { z } from 'zod';
import { sessionGroupIdSchema } from '@colearnia/contracts';
import type { IndexRequirement } from '../lib/database-preflight.js';
import type { GeneralConversationFactory } from './ports.js';

export const channelConversationIndex = {
  collection: 'conversations',
  name: 'uq_conv_channel',
  key: { 'scope.channelId': 1 },
  unique: true,
  partialFilterExpression: { kind: 'CHANNEL' },
} satisfies IndexRequirement;

const objectId = z.instanceof(Types.ObjectId);
const channel = { channelId: objectId };
const live = { ...channel, sessionId: objectId };
const pair = {
  participantUserIds: z.tuple([objectId, objectId]),
  pairKey: z.string(),
};
const scopeByKind = {
  CHANNEL: z.strictObject(channel),
  DIRECT: z.strictObject(pair),
  SESSION: z.strictObject(live),
  GROUP: z.strictObject({ ...live, groupId: sessionGroupIdSchema }),
  HOST_PRIVATE: z.strictObject({ ...live, ...pair }),
};

const scopeSchema = new Schema(
  {
    channelId: Schema.Types.ObjectId,
    sessionId: Schema.Types.ObjectId,
    groupId: String,
    participantUserIds: { type: [Schema.Types.ObjectId], default: undefined, castNonArrays: false },
    pairKey: String,
  },
  { _id: false, strict: 'throw' },
);

const conversationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: Object.keys(scopeByKind), required: true },
    scope: { type: scopeSchema, required: true },
    closedAt: { type: Date, default: null },
    purgeAt: { type: Date, default: null },
  },
  {
    collection: channelConversationIndex.collection,
    strict: 'throw',
    timestamps: true,
    versionKey: false,
  },
);

conversationSchema.pre('validate', function () {
  if (!Object.hasOwn(scopeByKind, this.kind)) return;
  const kind = this.kind as keyof typeof scopeByKind;
  const result = scopeByKind[kind].safeParse(this.toObject().scope);
  if (!result.success) {
    this.invalidate('scope', 'Scope does not match conversation kind');
  } else if ('participantUserIds' in result.data) {
    const [first, second] = result.data.participantUserIds.map((id) => id.toHexString());
    if (!first || !second || first >= second || result.data.pairKey !== `${first}:${second}`) {
      this.invalidate('scope', 'Conversation pair must be sorted, distinct, and match pairKey');
    }
  }
  if (this.purgeAt && (!this.closedAt || this.purgeAt < this.closedAt)) {
    this.invalidate('purgeAt', 'Purge requires a closed conversation and cannot precede closure');
  }
});

conversationSchema.index(channelConversationIndex.key, {
  name: channelConversationIndex.name,
  unique: channelConversationIndex.unique,
  partialFilterExpression: channelConversationIndex.partialFilterExpression,
});

function registerConversationModel(connection: Connection) {
  return connection.model('Conversation', conversationSchema);
}

const registeredModels = new WeakMap<Connection, ReturnType<typeof registerConversationModel>>();

export function conversationModel(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const model = registerConversationModel(connection);
  registeredModels.set(connection, model);
  return model;
}

// Caller has already authorized and created the TEXT channel in this transaction.
export function createChannelConversationFactory(
  connection: Connection,
): GeneralConversationFactory<ClientSession> {
  const Conversation = conversationModel(connection);
  return {
    async create({ workspaceId, channelId, conversationId, createdAt, dbSession }) {
      if (!dbSession.inTransaction()) {
        throw new Error('An active transaction is required');
      }
      const conversation = new Conversation({
        _id: conversationId,
        workspaceId,
        kind: 'CHANNEL',
        scope: { channelId },
        createdAt,
        updatedAt: createdAt,
      });
      // The MongoDB driver rejects sessions owned by a different client.
      await conversation.save({ session: dbSession, timestamps: false });
      return { conversationId };
    },
  };
}
