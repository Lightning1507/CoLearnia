import { sessionEpochSchema } from '@colearnia/contracts';
import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { z } from 'zod';
import type { Database } from '../../lib/database.js';
import { sessionMetadataScopeSchema, sessionModels } from './session-models.js';

const objectId = z.instanceof(Types.ObjectId);
const identity = z.strictObject({ sessionId: objectId, epoch: sessionEpochSchema });
const mutation = identity.extend({
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  at: z.date(),
});
const participation = mutation.extend({ userId: objectId });
const createInput = z.strictObject({
  sessionId: objectId,
  workspaceId: objectId,
  channelId: objectId,
  epoch: sessionEpochSchema,
  hostUserId: objectId,
  participantId: objectId,
  at: z.date(),
});
const joinInput = participation.extend({ participantId: objectId });
const scopeInput = participation.extend({ scope: sessionMetadataScopeSchema });
const hostInput = mutation.extend({ hostUserId: objectId.nullable() });

export class SessionMetadataConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor() {
    super('Session metadata changed or is unavailable');
    this.name = 'SessionMetadataConflictError';
  }
}

// Inputs are server-owned. The caller holds its existing gates and authorizes runtime policy.
export function createSessionRepository(database: Database) {
  const { LiveSession, SessionParticipant } = sessionModels(database.connection);

  async function cas(
    input: z.infer<typeof mutation>,
    statuses: readonly ('ACTIVE' | 'ENDING')[],
    session: ClientSession,
    fields: { hostUserId?: Types.ObjectId | null; status?: 'ENDING' | 'ENDED'; endedAt?: Date },
    excludedHostUserId?: Types.ObjectId,
  ) {
    const result = await LiveSession.updateOne(
      {
        _id: input.sessionId,
        epoch: input.epoch,
        revision: input.expectedRevision,
        status: { $in: statuses },
        ...(excludedHostUserId ? { hostUserId: { $ne: excludedHostUserId } } : {}),
      },
      { $set: { ...fields, updatedAt: input.at }, $inc: { revision: 1 } },
      { session, runValidators: true, timestamps: false },
    );
    if (result.matchedCount !== 1) throw new SessionMetadataConflictError();
    return input.expectedRevision + 1;
  }

  return {
    async create(raw: z.infer<typeof createInput>) {
      const input = createInput.parse(raw);
      await database.transaction(async (session) => {
        await new LiveSession({
          _id: input.sessionId,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          epoch: input.epoch,
          hostUserId: input.hostUserId,
          status: 'ACTIVE',
          revision: 0,
          startedAt: input.at,
          endedAt: null,
          createdAt: input.at,
          updatedAt: input.at,
        }).save({ session, timestamps: false });
        await new SessionParticipant({
          _id: input.participantId,
          sessionId: input.sessionId,
          userId: input.hostUserId,
          joinedAt: input.at,
          leftAt: null,
          lastScope: { kind: 'MAIN' },
          lastScopeAt: input.at,
          createdAt: input.at,
          updatedAt: input.at,
        }).save({ session, timestamps: false });
      });
      return { sessionId: input.sessionId, participantId: input.participantId, revision: 0 };
    },

    async join(raw: z.infer<typeof joinInput>) {
      const input = joinInput.parse(raw);
      return database.transaction(async (session) => {
        const revision = await cas(input, ['ACTIVE'], session, {});
        const participant = await SessionParticipant.findOneAndUpdate(
          { sessionId: input.sessionId, userId: input.userId },
          {
            $set: {
              joinedAt: input.at,
              leftAt: null,
              lastScope: { kind: 'MAIN' },
              lastScopeAt: input.at,
              updatedAt: input.at,
            },
            $setOnInsert: {
              _id: input.participantId,
              sessionId: input.sessionId,
              userId: input.userId,
              createdAt: input.at,
            },
          },
          {
            session,
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            timestamps: false,
            setDefaultsOnInsert: false,
          },
        ).orFail();
        return { participantId: participant._id, revision };
      });
    },

    async setScope(raw: z.infer<typeof scopeInput>) {
      const input = scopeInput.parse(raw);
      return database.transaction(async (session) => {
        const revision = await cas(input, ['ACTIVE'], session, {});
        const result = await SessionParticipant.updateOne(
          { sessionId: input.sessionId, userId: input.userId, leftAt: null },
          { $set: { lastScope: input.scope, lastScopeAt: input.at, updatedAt: input.at } },
          { session, runValidators: true, timestamps: false },
        );
        if (result.matchedCount !== 1) throw new SessionMetadataConflictError();
        return { revision };
      });
    },

    async leave(raw: z.infer<typeof participation>) {
      const input = participation.parse(raw);
      return database.transaction(async (session) => {
        const revision = await cas(input, ['ACTIVE', 'ENDING'], session, {}, input.userId);
        const result = await SessionParticipant.updateOne(
          { sessionId: input.sessionId, userId: input.userId, leftAt: null },
          { $set: { leftAt: input.at, updatedAt: input.at } },
          { session, runValidators: true, timestamps: false },
        );
        if (result.matchedCount !== 1) throw new SessionMetadataConflictError();
        return { revision };
      });
    },

    async changeHost(raw: z.infer<typeof hostInput>) {
      const input = hostInput.parse(raw);
      return database.transaction(async (session) => {
        if (
          input.hostUserId &&
          !(await SessionParticipant.exists({
            sessionId: input.sessionId,
            userId: input.hostUserId,
            leftAt: null,
          }).session(session))
        )
          throw new SessionMetadataConflictError();
        return {
          revision: await cas(input, ['ACTIVE'], session, { hostUserId: input.hostUserId }),
        };
      });
    },

    async beginEnding(raw: z.infer<typeof mutation>, assertCurrent: () => void = () => {}) {
      const input = mutation.parse(raw);
      assertCurrent();
      return database.transaction(async (session) => {
        assertCurrent();
        const revision = await cas(input, ['ACTIVE'], session, { status: 'ENDING' });
        assertCurrent();
        return { revision };
      });
    },

    async completeEnding(raw: z.infer<typeof mutation>, assertCurrent: () => void = () => {}) {
      const input = mutation.parse(raw);
      assertCurrent();
      return database.transaction(async (session) => {
        assertCurrent();
        const revision = await cas(input, ['ENDING'], session, {
          status: 'ENDED',
          hostUserId: null,
          endedAt: input.at,
        });
        // The first write may finish after a caller deadline/revocation. Do not
        // send a second write, or let this callback reach commit, without rechecking.
        assertCurrent();
        await SessionParticipant.updateMany(
          { sessionId: input.sessionId, leftAt: null },
          { $set: { leftAt: input.at, updatedAt: input.at } },
          { session, timestamps: false },
        );
        assertCurrent();
        return { revision };
      });
    },

    // Primary/majority metadata read for the caller's reconcile step, never a runtime grant.
    async readVersion(raw: z.infer<typeof identity>) {
      const input = identity.parse(raw);
      return LiveSession.findOne({ _id: input.sessionId, epoch: input.epoch })
        .read('primary')
        .readConcern('majority')
        .lean();
    },
  };
}
