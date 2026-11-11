import { Types } from 'mongoose';
import {
  authenticatedContextSchema,
  channelAccessStampSchema,
  sessionMetadataTargetSchema,
  sessionMetadataQuerySchema,
  sessionMetadataPageSchema,
} from '@colearnia/contracts';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  SessionMetadataTarget,
} from '@colearnia/contracts';
import type { Database } from '../../lib/database.js';
import type { CoordinationContext, OperationCoordinator } from '../../lib/operation-coordinator.js';
import { sessionModels } from './session-models.js';

type FailureCode =
  'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'DEPENDENCY_UNAVAILABLE';
type Authority =
  | { ok: true; auth: AuthenticatedContext; access: ChannelAccessStamp }
  | { ok: false; errorCode: FailureCode };
export class SessionMetadataQueryError extends Error {
  constructor(readonly code: FailureCode) {
    super('Session metadata unavailable');
    this.name = 'SessionMetadataQueryError';
  }
}
function fail(code: FailureCode): never {
  throw new SessionMetadataQueryError(code);
}
const normalizedAuth = (raw: AuthenticatedContext) => {
  const value = authenticatedContextSchema.parse(raw);
  return {
    ...value,
    userId: value.userId.toLowerCase(),
    authSessionId: value.authSessionId.toLowerCase(),
  };
};
function sameStamp(a: ChannelAccessStamp, b: ChannelAccessStamp) {
  return (
    a.membershipId === b.membershipId &&
    a.membershipIncarnation === b.membershipIncarnation &&
    a.membershipRevision === b.membershipRevision &&
    a.channelRevision === b.channelRevision
  );
}

// Internal service only. M1 must re-read auth/access and its deny barriers under held.
export function createSessionMetadataQuery(
  database: Database,
  options: {
    coordinator: OperationCoordinator;
    isReady(): boolean;
    authorize(
      auth: AuthenticatedContext,
      target: SessionMetadataTarget,
      held: CoordinationContext,
    ): Promise<Authority>;
    now?: () => number;
  },
) {
  const { LiveSession } = sessionModels(database.connection);
  const now = options.now ?? Date.now;
  function clock() {
    const value = now();
    if (!Number.isFinite(value)) fail('DEPENDENCY_UNAVAILABLE');
    return value;
  }
  const maxQueryMs = 5000;
  function assertReady() {
    if (!options.isReady() || !database.isConnected()) fail('DEPENDENCY_UNAVAILABLE');
  }
  async function authority(
    auth: AuthenticatedContext,
    target: SessionMetadataTarget,
    held: CoordinationContext,
  ) {
    held.assertHeld({ userId: auth.userId, workspaceId: target.workspaceId });
    if (Date.parse(auth.expiresAt) <= clock()) fail('AUTH_REQUIRED');
    assertReady();
    let result: Authority;
    try {
      result = await options.authorize({ ...auth }, { ...target }, held);
    } catch {
      fail('DEPENDENCY_UNAVAILABLE');
    }
    held.assertHeld({ userId: auth.userId, workspaceId: target.workspaceId });
    assertReady();
    if (!result.ok) fail(result.errorCode);
    const parsedAuth = authenticatedContextSchema.safeParse(result.auth);
    const parsedAccess = channelAccessStampSchema.safeParse(result.access);
    if (!parsedAuth.success || !parsedAccess.success) fail('DEPENDENCY_UNAVAILABLE');
    const currentAuth = normalizedAuth(parsedAuth.data);
    const access = parsedAccess.data;
    if (
      currentAuth.userId !== auth.userId ||
      currentAuth.authSessionId !== auth.authSessionId ||
      Date.parse(currentAuth.expiresAt) <= clock()
    )
      fail('AUTH_REQUIRED');
    if (
      access.workspaceId.toLowerCase() !== target.workspaceId ||
      access.channelId.toLowerCase() !== target.channelId ||
      access.channelType !== 'LIVE' ||
      !access.canReadContent
    )
      fail('FORBIDDEN');
    return {
      auth: currentAuth,
      access: { ...access, membershipId: access.membershipId.toLowerCase() },
    };
  }
  return async (
    rawAuth: AuthenticatedContext,
    rawTarget: SessionMetadataTarget,
    rawQuery: unknown,
  ) => {
    const auth = normalizedAuth(rawAuth);
    const destination = sessionMetadataTargetSchema.parse(rawTarget);
    const target = {
      workspaceId: destination.workspaceId.toLowerCase(),
      channelId: destination.channelId.toLowerCase(),
    };
    const query = sessionMetadataQuerySchema.parse(rawQuery);
    if (
      query.cursor &&
      (query.cursor.workspaceId.toLowerCase() !== target.workspaceId ||
        query.cursor.channelId.toLowerCase() !== target.channelId)
    )
      fail('CONFLICT');
    return options.coordinator.run(
      { userId: auth.userId, workspaceId: target.workspaceId },
      async (held) => {
        const current = await authority(auth, target, held);
        const cursor = query.cursor;
        let rows;
        try {
          rows = await LiveSession.find({
            workspaceId: new Types.ObjectId(target.workspaceId),
            channelId: new Types.ObjectId(target.channelId),
            ...(cursor
              ? {
                  $or: [
                    { startedAt: { $lt: new Date(cursor.startedAt) } },
                    {
                      startedAt: new Date(cursor.startedAt),
                      _id: { $lt: new Types.ObjectId(cursor.sessionId) },
                    },
                  ],
                }
              : {}),
          })
            .select('_id epoch status startedAt endedAt')
            .sort({ startedAt: -1, _id: -1 })
            .limit(query.limit + 1)
            .hint('ix_live_channel_metadata')
            .read('primary')
            .readConcern('majority')
            .maxTimeMS(maxQueryMs)
            .lean();
        } catch {
          fail('DEPENDENCY_UNAVAILABLE');
        }
        const confirmed = await authority(auth, target, held);
        if (!sameStamp(current.access, confirmed.access)) fail('CONFLICT');
        const page = rows.slice(0, query.limit);
        const last = page.at(-1);
        try {
          return sessionMetadataPageSchema.parse({
            items: page.map((row) => ({
              sessionId: row._id.toHexString(),
              epoch: row.epoch,
              status: row.status,
              startedAt: row.startedAt.toISOString(),
              endedAt: row.endedAt?.toISOString() ?? null,
            })),
            nextCursor:
              rows.length > query.limit && last
                ? {
                    ...target,
                    startedAt: last.startedAt.toISOString(),
                    sessionId: last._id.toHexString(),
                  }
                : null,
          });
        } catch {
          fail('DEPENDENCY_UNAVAILABLE');
        }
      },
    );
  };
}
