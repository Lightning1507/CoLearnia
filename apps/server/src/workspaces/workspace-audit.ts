import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
import { requestIdSchema } from '@colearnia/contracts';
import type { IndexRequirement } from '../lib/database-preflight.js';

export const workspaceAuditIndex = {
  collection: 'auditEvents',
  name: 'ix_audit_workspace',
  key: { workspaceId: 1, createdAt: -1, _id: -1 },
} satisfies IndexRequirement;

// SCRUM-32 only catalogs workspace creation. Do not accept arbitrary metadata/actions
// from clients, or use this collection as an idempotency ledger.
const schema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['WORKSPACE_CREATE'], required: true },
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    sessionId: { type: Schema.Types.ObjectId, default: null },
    target: {
      type: new Schema(
        {
          kind: { type: String, enum: ['WORKSPACE'], required: true },
          id: { type: String, required: true, match: /^[a-f0-9]{24}$/ },
        },
        { _id: false, strict: 'throw' },
      ),
      required: true,
    },
    requestId: {
      type: String,
      required: true,
      cast: false,
      validate: { validator: (value: string) => requestIdSchema.safeParse(value).success },
    },
    revision: { type: Number, enum: [0], required: true, cast: false },
    outcome: { type: String, enum: ['SUCCEEDED'], required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'auditEvents', strict: 'throw', versionKey: false },
);
schema.index(workspaceAuditIndex.key, { name: workspaceAuditIndex.name });
const models = new WeakMap<Connection, ReturnType<typeof register>>();
function register(connection: Connection) {
  return connection.model('WorkspaceCreationAudit', schema);
}
export function auditModel(connection: Connection) {
  let model = models.get(connection);
  if (!model) {
    model = register(connection);
    models.set(connection, model);
  }
  return model;
}
