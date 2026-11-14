import { createMainJoinRegistry } from '../live/session-manager/main-join-registry.js';
import { accessRevocations } from './shared-access-revocation.js';
import { operationCoordinator } from './shared-coordination.js';
import type { MessagingRevocationPort } from '../messaging/ports.js';

// MAIN composition must still supply real authority, repository and cleanup ports.
// Keep the application-owned M1 ledger/coordinator together; never create a second pair.
export function createApplicationMainRegistry(
  options: Omit<
    Parameters<typeof createMainJoinRegistry>[0],
    'coordinator' | 'accessRevocations'
  > & {
    revocationCleanup: NonNullable<
      Parameters<typeof createMainJoinRegistry>[0]['revocationCleanup']
    >;
  },
  messaging: MessagingRevocationPort,
) {
  const registry = createMainJoinRegistry({
    ...options,
    coordinator: operationCoordinator,
    accessRevocations,
  });
  try {
    accessRevocations.bindCleanupAdapters({ messaging, live: registry });
    return registry;
  } catch (error) {
    registry.close();
    throw error;
  }
}
