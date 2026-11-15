import { createAccessRevocationCoordinator } from '../workspaces/access-revocation.js';
import { operationCoordinator } from './shared-coordination.js';

// Application-owned deny ledger, available before chat/LIVE is mounted. No mock/no-op
// cleanup ports: an authorized revoke installs deny but cannot report success or write
// the permission mutation until both real adapters are bound. Future runtime composition
// calls bindCleanupAdapters ON THIS INSTANCE, then retries pending operations by ID.
export const accessRevocations = createAccessRevocationCoordinator({
  coordinator: operationCoordinator,
});
