import { sessionEpochSchema, sessionGroupIdSchema } from '@colearnia/contracts';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import { z } from 'zod';
import type { IndexRequirement } from '../../lib/database-preflight.js';

export const sessionMetadataScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('MAIN') }),
  z.strictObject({ kind: z.literal('GROUP'), groupId: sessionGroupIdSchema }),
]);

export const sessionIndexRequirements: readonly IndexRequirement[] = [
  {
    collection: 'liveSessions',
    name: 'uq_live_open_channel',
    key: { channelId: 1 },
    unique: true,
    partialFilterExpression: { status: { $in: ['ACTIVE', 'ENDING'] } },
  },
  { collection: 'liveSessions', name: 'ix_live_reconcile', key: { status: 1, _id: 1 } },
  {
    collection: 'sessionParticipants',
    name: 'uq_participant_pair',
    key: { sessionId: 1, userId: 1 },
    unique: true,
  },
  {
    collection: 'sessionParticipants',
    name: 'ix_participant_user',
    key: { userId: 1, sessionId: 1 },
  },
];

const reference = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;
const liveSessionSchema = new Schema(
  {
    workspaceId: reference,
    channelId: reference,
    epoch: {
      type: String,
      required: true,
      immutable: true,
      cast: false,
      validate: { validator: (value: string) => sessionEpochSchema.safeParse(value).success },
    },
    hostUserId: { type: Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'ENDING', 'ENDED'],
      required: true,
      default: 'ACTIVE',
    },
    revision: {
      type: Number,
      required: true,
      default: 0,
      cast: false,
      validate: { validator: (value: number) => Number.isSafeInteger(value) && value >= 0 },
    },
    startedAt: { type: Date, required: true, immutable: true },
    endedAt: { type: Date, default: null },
  },
  { collection: 'liveSessions', strict: 'throw', timestamps: true, versionKey: false },
);

liveSessionSchema.pre('validate', function () {
  if (this.status === 'ENDED') {
    if (!this.endedAt || this.hostUserId !== null)
      this.invalidate('status', 'ENDED requires endedAt and a null host');
  } else if (this.endedAt !== null)
    this.invalidate('endedAt', 'Open sessions require a null endedAt');
});

const scopeSchema = new Schema(
  {
    kind: { type: String, enum: ['MAIN', 'GROUP'], required: true, cast: false },
    groupId: { type: String, cast: false },
  },
  { _id: false, strict: 'throw' },
);

const participantSchema = new Schema(
  {
    sessionId: reference,
    userId: reference,
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    lastScope: { type: scopeSchema, default: null },
    lastScopeAt: { type: Date, default: null },
  },
  { collection: 'sessionParticipants', strict: 'throw', timestamps: true, versionKey: false },
);

participantSchema.pre('validate', function () {
  const scope = this.toObject().lastScope;
  if (scope === null) {
    if (this.lastScopeAt !== null)
      this.invalidate('lastScopeAt', 'A scope timestamp requires scope metadata');
  } else if (!this.lastScopeAt || !sessionMetadataScopeSchema.safeParse(scope).success) {
    this.invalidate('lastScope', 'Scope metadata and timestamp must match');
  }
});

for (const { collection, key, ...options } of sessionIndexRequirements) {
  (collection === 'liveSessions' ? liveSessionSchema : participantSchema).index(key, options);
}

const objectId = { bsonType: 'objectId' };
const nullableDate = { bsonType: ['date', 'null'] };
const timestamps = {
  _id: objectId,
  createdAt: { bsonType: 'date' },
  updatedAt: { bsonType: 'date' },
};
const uuid = {
  bsonType: 'string',
  pattern:
    '\\A([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})\\z',
};

// Reviewed migration/test manifests. Model registration never provisions collections.
export const sessionCollectionValidators = {
  liveSessions: {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          additionalProperties: false,
          required: [
            '_id',
            'workspaceId',
            'channelId',
            'epoch',
            'hostUserId',
            'status',
            'revision',
            'startedAt',
            'endedAt',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            ...timestamps,
            workspaceId: objectId,
            channelId: objectId,
            epoch: uuid,
            hostUserId: { bsonType: ['objectId', 'null'] },
            status: { enum: ['ACTIVE', 'ENDING', 'ENDED'] },
            revision: {
              bsonType: ['int', 'long', 'double'],
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
              multipleOf: 1,
            },
            startedAt: { bsonType: 'date' },
            endedAt: nullableDate,
          },
        },
      },
      {
        $or: [
          { status: { $in: ['ACTIVE', 'ENDING'] }, endedAt: null },
          { status: 'ENDED', endedAt: { $type: 'date' }, hostUserId: null },
        ],
      },
    ],
  },
  sessionParticipants: {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          additionalProperties: false,
          required: [
            '_id',
            'sessionId',
            'userId',
            'joinedAt',
            'leftAt',
            'lastScope',
            'lastScopeAt',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            ...timestamps,
            sessionId: objectId,
            userId: objectId,
            joinedAt: { bsonType: 'date' },
            leftAt: nullableDate,
            lastScope: {
              oneOf: [
                { bsonType: 'null' },
                {
                  bsonType: 'object',
                  additionalProperties: false,
                  required: ['kind'],
                  properties: { kind: { enum: ['MAIN'] } },
                },
                {
                  bsonType: 'object',
                  additionalProperties: false,
                  required: ['kind', 'groupId'],
                  properties: { kind: { enum: ['GROUP'] }, groupId: uuid },
                },
              ],
            },
            lastScopeAt: nullableDate,
          },
        },
      },
      {
        $or: [
          { lastScope: null, lastScopeAt: null },
          { lastScope: { $type: 'object' }, lastScopeAt: { $type: 'date' } },
        ],
      },
    ],
  },
} as const;

function registerSessionModels(connection: Connection) {
  return {
    LiveSession: connection.model('LiveSession', liveSessionSchema),
    SessionParticipant: connection.model('SessionParticipant', participantSchema),
  };
}
const registeredModels = new WeakMap<Connection, ReturnType<typeof registerSessionModels>>();

export function sessionModels(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const models = registerSessionModels(connection);
  registeredModels.set(connection, models);
  return models;
}
