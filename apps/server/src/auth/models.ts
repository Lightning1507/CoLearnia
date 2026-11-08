import { authEmailSchema, displayNameSchema } from '@colearnia/contracts';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import { z } from 'zod';
import type { IndexRequirement } from '../lib/database-preflight.js';

export const authIndexRequirements: readonly IndexRequirement[] = [
  { collection: 'users', name: 'uq_user_email', key: { emailNormalized: 1 }, unique: true },
  { collection: 'authSessions', name: 'uq_auth_token', key: { tokenHash: 1 }, unique: true },
  {
    collection: 'authSessions',
    name: 'ttl_auth_expiry',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  { collection: 'authSessions', name: 'ix_auth_user', key: { userId: 1, revokedAt: 1 } },
];

const httpsUrl = z.url({ protocol: /^https$/ });
const privateHash = {
  type: String,
  required: true,
  select: false,
  cast: false,
  validate: { validator: (value: string) => value.trim().length > 0 },
};
const avatarSchema = new Schema(
  {
    publicId: { type: String, required: true, trim: true },
    secureUrl: {
      type: String,
      required: true,
      validate: { validator: (value: string) => httpsUrl.safeParse(value).success },
    },
  },
  { _id: false, strict: 'throw' },
);

const userSchema = new Schema(
  {
    emailNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: { validator: (value: string) => authEmailSchema.safeParse(value).success },
    },
    passwordHash: privateHash,
    displayName: {
      type: String,
      required: true,
      cast: false,
      trim: true,
      validate: { validator: (value: string) => displayNameSchema.safeParse(value).success },
    },
    avatar: { type: avatarSchema, default: null },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'users', strict: 'throw', timestamps: true, versionKey: false },
);

const authSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: privateHash,
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: 'authSessions', strict: 'throw', timestamps: true, versionKey: false },
);

// Also redact freshly created documents and documents that explicitly selected a hash.
function redactPasswordHash(_document: unknown, value: Record<string, unknown>) {
  delete value.passwordHash;
  return value;
}

function redactTokenHash(_document: unknown, value: Record<string, unknown>) {
  delete value.tokenHash;
  return value;
}

userSchema.set('toJSON', { transform: redactPasswordHash });
userSchema.set('toObject', { transform: redactPasswordHash });
authSessionSchema.set('toJSON', { transform: redactTokenHash });
authSessionSchema.set('toObject', { transform: redactTokenHash });

for (const { collection, key, ...options } of authIndexRequirements) {
  const schema = collection === 'users' ? userSchema : authSessionSchema;
  schema.index(key, options);
}

function registerAuthModels(connection: Connection) {
  return {
    User: connection.model('User', userSchema),
    AuthSession: connection.model('AuthSession', authSessionSchema),
  };
}

const registeredModels = new WeakMap<Connection, ReturnType<typeof registerAuthModels>>();

export function authModels(connection: Connection) {
  const existing = registeredModels.get(connection);
  if (existing) return existing;
  const models = registerAuthModels(connection);
  registeredModels.set(connection, models);
  return models;
}
