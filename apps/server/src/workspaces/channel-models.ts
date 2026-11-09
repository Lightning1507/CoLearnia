import { channelAccessSchema, channelNameSchema, channelTypeSchema } from '@colearnia/contracts';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import type { IndexRequirement } from '../lib/database-preflight.js';

export const channelIndexRequirements: readonly IndexRequirement[] = [
  {
    collection: 'channels',
    name: 'ix_channel_workspace',
    key: { workspaceId: 1, deletedAt: 1, order: 1, _id: 1 },
  },
  {
    collection: 'channelAccessGrants',
    name: 'uq_channel_membership_grant',
    key: { channelId: 1, membershipId: 1 },
    unique: true,
  },
  {
    collection: 'channelAccessGrants',
    name: 'ix_grant_member',
    key: { membershipId: 1, membershipIncarnation: 1, revokedAt: 1, channelId: 1 },
  },
];

const integer = (minimum: number) => ({
  type: Number,
  required: true as const,
  cast: false,
  validate: { validator: (value: number) => Number.isSafeInteger(value) && value >= minimum },
});
const reference = { type: Schema.Types.ObjectId, required: true } as const;

const channelSchema = new Schema(
  {
    workspaceId: { ...reference, immutable: true },
    name: {
      type: String,
      required: true,
      cast: false,
      trim: true,
      validate: { validator: (value: string) => channelNameSchema.safeParse(value).success },
    },
    type: {
      type: String,
      enum: channelTypeSchema.options,
      required: true,
      immutable: true,
      cast: false,
    },
    accessMode: {
      type: String,
      enum: channelAccessSchema.options,
      required: true,
      immutable: true,
      cast: false,
    },
    order: { ...integer(0), default: 0 },
    revision: { ...integer(0), default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'channels', strict: 'throw', timestamps: true, versionKey: false },
);

const grantSchema = new Schema(
  {
    workspaceId: { ...reference, immutable: true },
    channelId: { ...reference, immutable: true },
    membershipId: { ...reference, immutable: true },
    membershipIncarnation: integer(1),
    grantedByUserId: reference,
    grantedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: 'channelAccessGrants', strict: 'throw', timestamps: true, versionKey: false },
);

for (const { collection, key, ...options } of channelIndexRequirements) {
  (collection === 'channels' ? channelSchema : grantSchema).index(key, options);
}

// Provision only through a reviewed migration or a disposable test database.
// These rules also guard raw updates/$inc, which Mongoose path validators cannot fully check.
const safeInteger = (minimum: number) => ({
  bsonType: ['int', 'long', 'double'],
  minimum,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
});
const timestamps = {
  _id: { bsonType: 'objectId' },
  createdAt: { bsonType: 'date' },
  updatedAt: { bsonType: 'date' },
};
const objectId = { bsonType: 'objectId' };
const nullableDate = { bsonType: ['date', 'null'] };

export const channelCollectionValidators = {
  channels: {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'workspaceId',
        'name',
        'type',
        'accessMode',
        'order',
        'revision',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        ...timestamps,
        workspaceId: objectId,
        name: {
          bsonType: 'string',
          minLength: 1,
          maxLength: 80,
          pattern: '\\A\\S(?:[\\s\\S]*\\S)?\\z',
        },
        type: { enum: [...channelTypeSchema.options] },
        accessMode: { enum: [...channelAccessSchema.options] },
        order: safeInteger(0),
        revision: safeInteger(0),
        deletedAt: nullableDate,
      },
    },
  },
  channelAccessGrants: {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'workspaceId',
        'channelId',
        'membershipId',
        'membershipIncarnation',
        'grantedByUserId',
        'grantedAt',
        'revokedAt',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        ...timestamps,
        workspaceId: objectId,
        channelId: objectId,
        membershipId: objectId,
        membershipIncarnation: safeInteger(1),
        grantedByUserId: objectId,
        grantedAt: { bsonType: 'date' },
        revokedAt: nullableDate,
      },
    },
  },
} as const;

function registerChannelModels(connection: Connection) {
  return {
    Channel: connection.model('Channel', channelSchema),
    ChannelAccessGrant: connection.model('ChannelAccessGrant', grantSchema),
  };
}

const registeredModels = new WeakMap<Connection, ReturnType<typeof registerChannelModels>>();

export function channelModels(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const models = registerChannelModels(connection);
  registeredModels.set(connection, models);
  return models;
}
