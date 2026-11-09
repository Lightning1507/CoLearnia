import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import {
  sessionCollectionValidators,
  sessionIndexRequirements,
  sessionModels,
} from '../src/live/session-manager/session-models.js';
import {
  createSessionRepository,
  SessionMetadataConflictError,
} from '../src/live/session-manager/session-repository.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum79_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const models = sessionModels(database.connection);
const repository = createSessionRepository(database);
let ownsDatabase = false;

function createInput(channelId = new Types.ObjectId()) {
  return {
    sessionId: new Types.ObjectId(),
    participantId: new Types.ObjectId(),
    workspaceId: new Types.ObjectId(),
    channelId,
    epoch: randomUUID(),
    hostUserId: new Types.ObjectId(),
    at: new Date(),
  };
}
function mutation(input: ReturnType<typeof createInput>, expectedRevision: number) {
  return { sessionId: input.sessionId, epoch: input.epoch, expectedRevision, at: new Date() };
}

beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  const db = database.connection.db!;
  const hello = await db.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs0');
  expect(hello.isWritablePrimary).toBe(true);
  ownsDatabase = true;
  for (const Model of [models.LiveSession, models.SessionParticipant]) await Model.init();
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await models.LiveSession.createCollection({
    validator: sessionCollectionValidators.liveSessions,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await models.SessionParticipant.createCollection({
    validator: sessionCollectionValidators.sessionParticipants,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await models.LiveSession.createIndexes();
  await models.SessionParticipant.createIndexes();
});
afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum79_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('SCRUM-79 persistent session metadata', () => {
  it('creates a session and its host participation atomically with reviewed indexes', async () => {
    expect(await preflightIndexes(database.connection, sessionIndexRequirements)).toEqual({
      ready: true,
      issues: [],
    });
    const input = createInput();
    expect(await repository.create(input)).toMatchObject({
      sessionId: input.sessionId,
      participantId: input.participantId,
      revision: 0,
    });
    expect(
      await repository.readVersion({ sessionId: input.sessionId, epoch: input.epoch }),
    ).toMatchObject({
      status: 'ACTIVE',
      hostUserId: input.hostUserId,
      revision: 0,
      endedAt: null,
    });
    expect(await models.SessionParticipant.findById(input.participantId).lean()).toMatchObject({
      sessionId: input.sessionId,
      userId: input.hostUserId,
      leftAt: null,
      lastScope: { kind: 'MAIN' },
    });
  });

  it('rolls back the session if the host participation write fails', async () => {
    const first = createInput();
    await repository.create(first);
    const second = { ...createInput(), participantId: first.participantId };
    await expect(repository.create(second)).rejects.toMatchObject({ code: 11000 });
    expect(
      await repository.readVersion({ sessionId: second.sessionId, epoch: second.epoch }),
    ).toBeNull();
  });

  it('admits one open session per channel under concurrent create, including ENDING', async () => {
    const channelId = new Types.ObjectId();
    const inputs = [createInput(channelId), createInput(channelId)];
    const results = await Promise.allSettled(inputs.map((input) => repository.create(input)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const session = await models.LiveSession.findOne({ channelId }).lean().orFail();
    const winner = inputs.find((input) => input.sessionId.equals(session._id))!;
    expect(
      await models.SessionParticipant.countDocuments({
        sessionId: { $in: inputs.map((input) => input.sessionId) },
      }),
    ).toBe(1);
    await repository.beginEnding(mutation(winner, 0));
    await expect(repository.create(createInput(channelId))).rejects.toMatchObject({ code: 11000 });
    await repository.completeEnding(mutation(winner, 1));
    await repository.create(createInput(channelId));
    expect(await models.LiveSession.countDocuments({ channelId })).toBe(2);
  });

  it('keeps participation IDs stable across leave/rejoin and rejects stale epoch/revision', async () => {
    const input = createInput();
    await repository.create(input);
    const userId = new Types.ObjectId();
    const participantId = new Types.ObjectId();
    const first = await repository.join({ ...mutation(input, 0), userId, participantId });
    expect(first.participantId).toEqual(participantId);
    await expect(
      repository.join({ ...mutation(input, 0), userId, participantId }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
    await expect(
      repository.beginEnding({ ...mutation(input, 1), epoch: randomUUID() }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
    await repository.leave({ ...mutation(input, 1), userId });
    const rejoin = await repository.join({
      ...mutation(input, 2),
      userId,
      participantId: new Types.ObjectId(),
    });
    expect(rejoin).toMatchObject({ participantId, revision: 3 });
    expect(
      await models.SessionParticipant.countDocuments({ sessionId: input.sessionId, userId }),
    ).toBe(1);
    await expect(
      models.SessionParticipant.create({
        sessionId: input.sessionId,
        userId,
        joinedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('serializes concurrent CAS and rolls back a failed participation mutation', async () => {
    const input = createInput();
    await repository.create(input);
    const results = await Promise.allSettled([
      repository.beginEnding(mutation(input, 0)),
      repository.changeHost({ ...mutation(input, 0), hostUserId: input.hostUserId }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await repository.readVersion({ sessionId: input.sessionId, epoch: input.epoch }))?.revision,
    ).toBe(1);
    const other = createInput();
    await repository.create(other);
    await expect(
      repository.setScope({
        ...mutation(other, 0),
        userId: new Types.ObjectId(),
        scope: { kind: 'MAIN' },
      }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
    expect(
      (await repository.readVersion({ sessionId: other.sessionId, epoch: other.epoch }))?.revision,
    ).toBe(0);
  });

  it('changes metadata host/scope and ends without reopening or accepting new joins', async () => {
    const input = createInput();
    await repository.create(input);
    const userId = new Types.ObjectId();
    await expect(
      repository.changeHost({ ...mutation(input, 0), hostUserId: userId }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
    await repository.join({ ...mutation(input, 0), userId, participantId: new Types.ObjectId() });
    await repository.changeHost({ ...mutation(input, 1), hostUserId: userId });
    const scope = { kind: 'GROUP' as const, groupId: randomUUID() };
    await repository.setScope({ ...mutation(input, 2), userId, scope });
    expect(
      await models.SessionParticipant.findOne({ sessionId: input.sessionId, userId }).lean(),
    ).toMatchObject({ lastScope: scope });
    await repository.beginEnding(mutation(input, 3));
    await expect(
      repository.join({
        ...mutation(input, 4),
        userId: new Types.ObjectId(),
        participantId: new Types.ObjectId(),
      }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
    await repository.completeEnding(mutation(input, 4));
    expect(
      await repository.readVersion({ sessionId: input.sessionId, epoch: input.epoch }),
    ).toMatchObject({
      status: 'ENDED',
      hostUserId: null,
      revision: 5,
      endedAt: expect.any(Date),
    });
    expect(
      await models.SessionParticipant.countDocuments({ sessionId: input.sessionId, leftAt: null }),
    ).toBe(0);
    await expect(
      repository.changeHost({ ...mutation(input, 5), hostUserId: null }),
    ).rejects.toBeInstanceOf(SessionMetadataConflictError);
  });

  it('rejects malformed raw state/scope and numeric writes at the MongoDB boundary', async () => {
    const input = createInput();
    await repository.create(input);
    const sessions = database.connection.db!.collection('liveSessions');
    for (const fields of [
      { status: 'ENDED' },
      { endedAt: new Date() },
      { revision: -1 },
      { revision: 0.5 },
      { revision: NaN },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { epoch: 'invalid' },
      { epoch: `${randomUUID()}\n` },
      { policyRevision: 1 },
    ]) {
      await expect(
        sessions.updateOne({ _id: input.sessionId }, { $set: fields }),
      ).rejects.toMatchObject({ code: 121 });
    }
    await sessions.updateOne({ _id: input.sessionId }, { $set: { revision: 2_147_483_647 } });
    await sessions.updateOne({ _id: input.sessionId }, { $inc: { revision: 1 } });
    expect((await sessions.findOne({ _id: input.sessionId }))?.revision).toBe(2_147_483_648);
    const participants = database.connection.db!.collection('sessionParticipants');
    for (const fields of [
      { lastScope: { kind: 'GROUP' } },
      { lastScope: { kind: 'MAIN', groupId: randomUUID() } },
      { lastScopeAt: null },
      { lastScope: null },
      { callGeneration: 1 },
    ]) {
      await expect(
        participants.updateOne({ _id: input.participantId }, { $set: fields }),
      ).rejects.toMatchObject({ code: 121 });
    }
  });

  it.each([true, false])(
    'preserves unknown-commit errors and supports read-back, commit applied=%s',
    async (applied) => {
      const input = createInput();
      const session = await database.connection.startSession();
      const originalCommit = session.commitTransaction.bind(session);
      const error = new mongo.MongoServerError({
        message: 'Injected lost commit acknowledgement',
        code: 91,
      });
      error.addErrorLabel('UnknownTransactionCommitResult');
      const commit = vi.spyOn(session, 'commitTransaction').mockImplementation(async () => {
        if (applied && commit.mock.calls.length === 1) await originalCommit();
        throw error;
      });
      const start = vi.spyOn(database.connection, 'startSession').mockResolvedValueOnce(session);
      try {
        await expect(repository.create(input)).rejects.toBe(error);
        expect(commit).toHaveBeenCalledTimes(2);
        expect(start).toHaveBeenCalledOnce();
        const stored = await repository.readVersion({
          sessionId: input.sessionId,
          epoch: input.epoch,
        });
        if (applied) {
          expect(stored).toMatchObject({ _id: input.sessionId, revision: 0, status: 'ACTIVE' });
          expect(
            await models.SessionParticipant.countDocuments({ sessionId: input.sessionId }),
          ).toBe(1);
        } else {
          expect(stored).toBeNull();
          expect(
            await models.SessionParticipant.countDocuments({ sessionId: input.sessionId }),
          ).toBe(0);
        }
      } finally {
        start.mockRestore();
        commit.mockRestore();
      }
    },
  );
});
