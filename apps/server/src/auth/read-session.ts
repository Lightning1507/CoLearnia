import type { AuthenticatedContext, OwnUser } from '@colearnia/contracts';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
import { authModels } from './models.js';
import { hashAuthToken, isSessionToken } from './session-credentials.js';

export class SessionReadUnavailableError extends Error {}

const queryMaxTimeMS = 5000;

export type VerifiedSession = { context: AuthenticatedContext; user: OwnUser };

// Transport-independent. A successful read establishes identity, not Workspace access.
export function createSessionReader(database: Database, indexesReady: () => boolean) {
  const { AuthSession, User } = authModels(database.connection);

  return async (token: string | undefined): Promise<VerifiedSession | null> => {
    if (!isSessionToken(token)) return null;
    if (!indexesReady() || !database.isConnected()) throw new SessionReadUnavailableError();
    try {
      const tokenHash = hashAuthToken(token);
      const session = await AuthSession.findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date(Date.now()) },
      })
        .select('_id userId')
        .maxTimeMS(queryMaxTimeMS)
        .lean();
      if (!session) return null;

      const user = await User.findOne({ _id: session.userId, status: 'ACTIVE' })
        .select('_id emailNormalized displayName avatar.secureUrl')
        .maxTimeMS(queryMaxTimeMS)
        .lean();
      if (!user) return null;

      // Revocation can commit while the User query is in flight.
      const confirmed = await AuthSession.findOne({
        _id: session._id,
        tokenHash,
        userId: user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date(Date.now()) },
      })
        .select('expiresAt')
        .maxTimeMS(queryMaxTimeMS)
        .lean();
      if (!confirmed || confirmed.expiresAt.getTime() <= Date.now()) return null;

      const userId = user._id.toHexString();
      return {
        context: {
          userId,
          authSessionId: session._id.toHexString(),
          expiresAt: confirmed.expiresAt.toISOString(),
        },
        user: {
          id: userId,
          email: user.emailNormalized,
          displayName: user.displayName,
          avatarUrl: user.avatar?.secureUrl ?? null,
        },
      };
    } catch (error) {
      if (!database.isConnected() || isDatabaseUnavailableError(error)) {
        throw new SessionReadUnavailableError('Session lookup unavailable', { cause: error });
      }
      throw error;
    }
  };
}
