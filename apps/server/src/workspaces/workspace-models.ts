import { workspaceNameSchema, workspaceRoleSchema } from '@colearnia/contracts';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import type { IndexRequirement } from '../lib/database-preflight.js';

export const workspaceIndexRequirements: readonly IndexRequirement[] = [
  {
    collection: 'memberships',
    name: 'uq_membership_pair',
    key: { workspaceId: 1, userId: 1 },
    unique: true,
  },
  {
    collection: 'memberships',
    name: 'ix_membership_user',
    key: { userId: 1, status: 1, workspaceId: 1 },
  },
  {
    collection: 'memberships',
    name: 'ix_membership_workspace',
    key: { workspaceId: 1, status: 1, _id: 1 },
  },
  { collection: 'invitations', name: 'uq_invitation_token', key: { tokenHash: 1 }, unique: true },
  {
    collection: 'invitations',
    name: 'uq_invitation_workspace',
    key: { workspaceId: 1 },
    unique: true,
  },
];

const reference = { type: Schema.Types.ObjectId, required: true } as const;
const integer = (minimum: number) => ({
  type: Number,
  required: true as const,
  cast: false,
  validate: { validator: (value: number) => Number.isSafeInteger(value) && value >= minimum },
});

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      cast: false,
      trim: true,
      validate: { validator: (value: string) => workspaceNameSchema.safeParse(value).success },
    },
    ownerId: { ...reference, immutable: true },
    revision: { ...integer(0), default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'workspaces', strict: 'throw', timestamps: true, versionKey: false },
);

const membershipSchema = new Schema(
  {
    workspaceId: { ...reference, immutable: true },
    userId: { ...reference, immutable: true },
    role: { type: String, enum: workspaceRoleSchema.options, required: true, cast: false },
    status: {
      type: String,
      enum: ['ACTIVE', 'REMOVED'],
      required: true,
      default: 'ACTIVE',
      cast: false,
    },
    incarnation: { ...integer(1), default: 1 },
    revision: { ...integer(0), default: 0 },
    joinedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
  },
  { collection: 'memberships', strict: 'throw', timestamps: true, versionKey: false },
);
membershipSchema.pre('validate', function () {
  if (
    (this.status === 'ACTIVE' && this.removedAt !== null) ||
    (this.status === 'REMOVED' && !(this.removedAt instanceof Date)) ||
    (this.role === 'OWNER' && this.status !== 'ACTIVE')
  ) {
    this.invalidate('status', 'Invalid membership lifecycle');
  }
});

// Base64url without padding: encrypt the 32 random token bytes, not its URL representation.
const end = '(?![\\s\\S])';
const bytes32 = `^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]${end}`;
const bytes16 = `^[A-Za-z0-9_-]{21}[AQgw]${end}`;
const bytes12 = `^[A-Za-z0-9_-]{16}${end}`;
const keyIdPattern = `^[A-Za-z0-9_-]{1,64}${end}`;
const hashPattern = `^[a-f0-9]{64}${end}`;
const encoded = (pattern: string) => ({
  type: String,
  required: true as const,
  cast: false,
  match: new RegExp(pattern),
});
const encryptedTokenSchema = new Schema(
  {
    algorithm: { type: String, enum: ['AES-256-GCM'], required: true, cast: false },
    keyId: encoded(keyIdPattern),
    iv: encoded(bytes12),
    ciphertext: encoded(bytes32),
    authTag: encoded(bytes16),
  },
  { _id: false, strict: 'throw' },
);
const invitationSchema = new Schema(
  {
    workspaceId: { ...reference, immutable: true },
    createdByUserId: { ...reference, immutable: true },
    tokenHash: { ...encoded(hashPattern), select: false },
    encryptedToken: { type: encryptedTokenSchema, required: true, select: false },
    enabled: { type: Boolean, required: true, default: true, cast: false },
    revision: { ...integer(0), default: 0 },
  },
  { collection: 'invitations', strict: 'throw', timestamps: true, versionKey: false },
);
function redactInvitation(_document: unknown, value: Record<string, unknown>) {
  delete value.tokenHash;
  delete value.encryptedToken;
  return value;
}
invitationSchema.set('toJSON', { transform: redactInvitation });
invitationSchema.set('toObject', { transform: redactInvitation });

for (const { collection, key, ...options } of workspaceIndexRequirements) {
  (collection === 'memberships' ? membershipSchema : invitationSchema).index(key, options);
}

const safeInteger = (minimum: number) => ({
  bsonType: ['int', 'long', 'double'],
  minimum,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
});
const objectId = { bsonType: 'objectId' };
const nullableDate = { bsonType: ['date', 'null'] };
const timestamps = {
  _id: objectId,
  createdAt: { bsonType: 'date' },
  updatedAt: { bsonType: 'date' },
};
// Same ECMAScript trim set used by the channel validator.
const trimCharacters =
  '\\x{0009}-\\x{000D}\\x{0020}\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}';
const nameEdge = `[^${trimCharacters}]`;
const encodedProperty = (pattern: string) => ({ bsonType: 'string', pattern });

// Explicit provisioning only; registering these models never migrates a database.
export const workspaceCollectionValidators = {
  workspaces: {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['_id', 'name', 'ownerId', 'revision', 'deletedAt', 'createdAt', 'updatedAt'],
      properties: {
        ...timestamps,
        name: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 80,
          pattern: `\\A${nameEdge}[\\s\\S]*${nameEdge}\\z`,
        },
        ownerId: objectId,
        revision: safeInteger(0),
        deletedAt: nullableDate,
      },
    },
  },
  memberships: {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          additionalProperties: false,
          required: [
            '_id',
            'workspaceId',
            'userId',
            'role',
            'status',
            'incarnation',
            'revision',
            'joinedAt',
            'removedAt',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            ...timestamps,
            workspaceId: objectId,
            userId: objectId,
            role: { enum: [...workspaceRoleSchema.options] },
            status: { enum: ['ACTIVE', 'REMOVED'] },
            incarnation: safeInteger(1),
            revision: safeInteger(0),
            joinedAt: { bsonType: 'date' },
            removedAt: nullableDate,
          },
        },
      },
      {
        $or: [
          { status: 'ACTIVE', removedAt: { $type: 'null' } },
          { status: 'REMOVED', removedAt: { $type: 'date' } },
        ],
      },
      { $or: [{ role: { $ne: 'OWNER' } }, { status: 'ACTIVE' }] },
    ],
  },
  invitations: {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'workspaceId',
        'createdByUserId',
        'tokenHash',
        'encryptedToken',
        'enabled',
        'revision',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        ...timestamps,
        workspaceId: objectId,
        createdByUserId: objectId,
        tokenHash: encodedProperty(hashPattern),
        encryptedToken: {
          bsonType: 'object',
          additionalProperties: false,
          required: ['algorithm', 'keyId', 'iv', 'ciphertext', 'authTag'],
          properties: {
            algorithm: { enum: ['AES-256-GCM'] },
            keyId: encodedProperty(keyIdPattern),
            iv: encodedProperty(bytes12),
            ciphertext: encodedProperty(bytes32),
            authTag: encodedProperty(bytes16),
          },
        },
        enabled: { bsonType: 'bool' },
        revision: safeInteger(0),
      },
    },
  },
} as const;

function registerWorkspaceModels(connection: Connection) {
  return {
    Workspace: connection.model('Workspace', workspaceSchema),
    Membership: connection.model('Membership', membershipSchema),
    Invitation: connection.model('Invitation', invitationSchema),
  };
}
const registeredModels = new WeakMap<Connection, ReturnType<typeof registerWorkspaceModels>>();
export function workspaceModels(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const models = registerWorkspaceModels(connection);
  registeredModels.set(connection, models);
  return models;
}
