import { createHash } from 'node:crypto';
import type { AuthenticatedContext } from '@colearnia/contracts';
import type { Database } from '../lib/database.js';
import type { createAccessRevocationCoordinator } from '../workspaces/access-revocation.js';
import { authModels } from './models.js';
import { hashAuthToken, isSessionToken } from './session-credentials.js';

export function createSessionRevocation(
  database: Database,
  indexesReady: () => boolean,
  control: ReturnType<typeof createAccessRevocationCoordinator>,
  closeConnections: (authSessionId: string) => void,
  authSessionFenceTrial = false,
) {
  const { AuthSession } = authModels(database.connection);

  function command({
    userId,
    authSessionId,
    expiresAt,
  }: AuthenticatedContext): Parameters<typeof control.prepareAuthSession>[0] {
    const digest = createHash('sha256').update(`AUTH_SESSION:${authSessionId}`).digest('hex');
    const operationId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const scope = { _id: authSessionId, userId };
    const marker = { ...scope, revokedAt: { $ne: null }, textRevokeOperationId: operationId };
    async function commitFence(): Promise<'committed' | 'unknown'> {
      // This exact-id CAS is safe to reissue after an unknown ACK. Preserve a
      // revocation time set by an earlier attempt or the login replacement path.
      const result = await AuthSession.updateOne(
        {
          ...scope,
          $or: [
            { textRevokeOperationId: { $exists: false } },
            { textRevokeOperationId: operationId },
          ],
        },
        [
          {
            $set: {
              revokedAt: { $ifNull: ['$revokedAt', '$$NOW'] },
              textRevokeOperationId: operationId,
            },
          },
        ],
        { updatePipeline: true, writeConcern: { w: 'majority' }, maxTimeMS: 5000 },
      );
      return result.matchedCount === 1 ? 'committed' : 'unknown';
    }

    return {
      userId,
      event: { kind: 'AUTH_SESSION' as const, authSessionId, operationId, revision: 0 },
      persistence: {
        authSessionExpiresAt: Date.parse(expiresAt),
        prepareHeld: async () => ({ authSessionIds: [] }),
        async commitHeld() {
          if (authSessionFenceTrial) return commitFence();
          await AuthSession.updateOne(
            { ...scope, revokedAt: null },
            { $set: { revokedAt: new Date() } },
          )
            .setOptions({ writeConcern: { w: 'majority' } })
            .maxTimeMS(5000);
          return 'committed' as const;
        },
        async reconcileHeld() {
          if (authSessionFenceTrial) {
            if (await AuthSession.exists(marker).readConcern('majority').maxTimeMS(5000))
              return 'committed' as const;
            // Absence is inconclusive and never announces rollback. Reissue only
            // the same idempotent CAS, after the coordinator confirmed cleanup.
            return commitFence();
          }
          const active = await AuthSession.exists({ ...scope, revokedAt: null })
            .readConcern('majority')
            .maxTimeMS(5000);
          return active ? 'not_committed' : 'committed';
        },
      },
    };
  }

  async function revoke(auth: AuthenticatedContext) {
    const result = await control.revoke(command(auth));
    closeConnections(auth.authSessionId);
    return result.permissionRevoked && result.pendingInvalidated && !result.cleanupPending;
  }

  return {
    revoke,
    async prepareReplacement(auth: AuthenticatedContext) {
      const ready = await control.prepareAuthSession(command(auth));
      // Deny is already installed. Disconnect only this session, even while native
      // cleanup is pending; no old socket may keep dispatching authorized work.
      if (control.isSessionDenied(auth)) closeConnections(auth.authSessionId);
      return ready;
    },
    claimReplacement(auth: AuthenticatedContext) {
      return control.claimAuthSessionReplacement(command(auth).event.operationId);
    },
    isReplacementRunning(auth: AuthenticatedContext) {
      return control.isAuthSessionReplacementRunning(command(auth).event.operationId);
    },
    isReplacementUncertain(auth: AuthenticatedContext) {
      return control.isAuthSessionReplacementUncertain(command(auth).event.operationId);
    },
    finishReplacement(
      auth: AuthenticatedContext,
      outcome: 'committed' | 'unknown' | 'not_committed',
    ) {
      control.finishAuthSessionReplacement(command(auth).event.operationId, outcome);
    },
    isDenied: control.isSessionDenied,
    async logout(token: string | undefined) {
      if (!isSessionToken(token)) return true;
      if (!indexesReady() || !database.isConnected()) return false;
      // A pending deny must not hide the session from a repeat logout.
      const session = await AuthSession.findOne({ tokenHash: hashAuthToken(token) })
        .select('_id userId expiresAt revokedAt')
        .readConcern('majority')
        .maxTimeMS(5000)
        .lean();
      if (!session) return true;
      if (
        session.revokedAt &&
        !authSessionFenceTrial &&
        !control.isSessionDenied({
          userId: session.userId.toHexString(),
          authSessionId: session._id.toHexString(),
          expiresAt: session.expiresAt.toISOString(),
        })
      )
        return true;
      return revoke({
        userId: session.userId.toHexString(),
        authSessionId: session._id.toHexString(),
        expiresAt: session.expiresAt.toISOString(),
      });
    },
  };
}
