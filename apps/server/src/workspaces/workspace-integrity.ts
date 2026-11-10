import type { ClientSession, Connection, Types } from 'mongoose';
import { workspaceModels } from './workspace-models.js';

export class WorkspaceOwnerInvariantError extends Error {
  constructor() {
    super('Workspace owner invariant requires reconciliation');
    this.name = 'WorkspaceOwnerInvariantError';
  }
}

// Caller holds the Workspace gate and the shared snapshot transaction.
// No owner repair/transfer, authorization decision or provisioning happens here.
export async function assertWorkspaceOwner(
  connection: Connection,
  workspaceId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  if (!session.inTransaction()) throw new Error('Owner check requires a transaction');
  const { Workspace, Membership } = workspaceModels(connection);
  const workspace = await Workspace.findOne({ _id: workspaceId, deletedAt: null })
    .select('ownerId')
    .session(session)
    .maxTimeMS(5000)
    .lean();
  if (!workspace) throw new WorkspaceOwnerInvariantError();
  const owners = await Membership.find({ workspaceId, role: 'OWNER', status: 'ACTIVE' })
    .select('userId')
    .limit(2)
    .session(session)
    .maxTimeMS(5000)
    .lean();
  if (owners.length !== 1 || !owners[0]!.userId.equals(workspace.ownerId)) {
    throw new WorkspaceOwnerInvariantError();
  }
}
