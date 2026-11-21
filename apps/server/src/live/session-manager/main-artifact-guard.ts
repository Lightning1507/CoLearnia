import { Types } from 'mongoose';
import { sessionCleanupRequestSchema } from '@colearnia/contracts';
import type { SessionCleanupRequest, SessionCleanupResult } from '@colearnia/contracts';
import type { Database } from '../../lib/database.js';

// MAIN currently mounts no session-chat or board handlers. Absence is verified
// against actual durable artifacts, never assumed from an empty adapter. Existing
// artifacts keep cleanup incomplete until their domain supplies its real closer.
export function createMainArtifactGuard(database: Database, domain: 'messaging' | 'board') {
  return async (raw: SessionCleanupRequest): Promise<SessionCleanupResult> => {
    const request = sessionCleanupRequestSchema.parse(raw);
    const { reason, ...identity } = request;
    void reason;
    let confirmed = false;
    try {
      if (!database.isConnected()) throw new Error('Database unavailable');
      const sessionId = new Types.ObjectId(request.sessionId);
      const query =
        domain === 'messaging'
          ? {
              kind: { $in: ['SESSION', 'GROUP', 'HOST_PRIVATE'] },
              'scope.sessionId': sessionId,
              $expr: { $ne: [{ $type: '$closedAt' }, 'date'] },
            }
          : { purpose: 'FRAME', 'scope.sessionId': sessionId };
      const artifact = await database.connection
        .db!.collection(domain === 'messaging' ? 'conversations' : 'files')
        .findOne(query, {
          projection: { _id: 1 },
          maxTimeMS: 1500,
          signal: AbortSignal.timeout(1500),
        });
      confirmed = !artifact;
    } catch {
      /* Preserve deny when absence cannot be established. */
    }
    return {
      ...identity,
      outcome: confirmed
        ? { permissionRevoked: true, pendingInvalidated: true, cleanupPending: false }
        : {
            permissionRevoked: false,
            pendingInvalidated: false,
            cleanupPending: true,
            errorCode: 'DEPENDENCY_UNAVAILABLE',
            retryable: false,
          },
    };
  };
}
