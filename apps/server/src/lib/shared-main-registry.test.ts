import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApplicationMainRegistry } from './shared-main-registry.js';
import { accessRevocations } from './shared-access-revocation.js';
import { operationCoordinator } from './shared-coordination.js';

it('binds both cleanup ports once on the application-owned M1 ledger', async () => {
  const cleanup = vi.fn(async () => {
    throw new Error('No participant exists in this composition test');
  });
  const options: Parameters<typeof createApplicationMainRegistry>[0] = {
    repository: {
      create: vi.fn(),
      join: vi.fn(),
      beginEnding: vi.fn(),
      completeEnding: vi.fn(),
    },
    resolveAuthority: vi.fn(),
    isAuthorityCurrent: () => true,
    createRouter: vi.fn(),
    revocationCleanup: { media: cleanup, messaging: cleanup, board: cleanup },
  };
  const messaging = {
    fence: vi.fn(() => ({ throughResourceGeneration: 1 })),
    revoke: vi.fn(async ({ revocationId }: { revocationId: string }) => ({
      revocationId,
      status: 'completed' as const,
    })),
  };
  const registry = createApplicationMainRegistry(options, messaging);
  try {
    expect(accessRevocations.coordinator).toBe(operationCoordinator);
    expect(() => createApplicationMainRegistry(options, messaging)).toThrow('already bound');
    const userId = 'a'.repeat(24);
    const authSessionId = 'b'.repeat(24);
    const commitHeld = vi.fn(async () => 'committed' as const);
    expect(
      await accessRevocations.revoke({
        event: { operationId: randomUUID(), kind: 'AUTH_SESSION', authSessionId, revision: 1 },
        userId,
        persistence: {
          prepareHeld: async () => ({ authSessionIds: [] }),
          commitHeld,
          reconcileHeld: async () => 'not_committed',
        },
      }),
    ).toMatchObject({ permissionRevoked: true, pendingInvalidated: true });
    expect(messaging.fence).toHaveBeenCalledTimes(1);
    expect(messaging.revoke).toHaveBeenCalledTimes(1);
    expect(commitHeld).toHaveBeenCalledTimes(1);
    expect(registry.stats().revocations).toBe(1);
  } finally {
    registry.close();
  }
});
