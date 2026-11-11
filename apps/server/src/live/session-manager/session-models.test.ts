import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../lib/database.js';
import { sessionIndexRequirements, sessionModels } from './session-models.js';
import { createSessionRepository } from './session-repository.js';

const instance = new mongoose.Mongoose({
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
});
const connection = instance.createConnection();
const { LiveSession, SessionParticipant } = sessionModels(connection);
const database = createDatabase('mongodb://127.0.0.1:27179/unused_scrum79?replicaSet=rs0');
const repository = createSessionRepository(database);

function sessionInput() {
  return {
    workspaceId: new Types.ObjectId(),
    channelId: new Types.ObjectId(),
    epoch: randomUUID(),
    hostUserId: new Types.ObjectId(),
    startedAt: new Date(),
  };
}
function participantInput() {
  return { sessionId: new Types.ObjectId(), userId: new Types.ObjectId(), joinedAt: new Date() };
}
afterAll(async () => {
  await connection.close();
  await database.close();
});

describe('session metadata models', () => {
  it('uses shared connection models and the metadata/query index manifest', () => {
    expect(sessionModels(connection).LiveSession).toBe(LiveSession);
    expect(sessionModels(connection).SessionParticipant).toBe(SessionParticipant);
    expect(LiveSession.db).toBe(connection);
    expect(SessionParticipant.db).toBe(connection);
    expect(sessionIndexRequirements).toHaveLength(5);
    expect(
      sessionIndexRequirements.find((index) => index.name === 'ix_live_channel_metadata')?.key,
    ).toEqual({ workspaceId: 1, channelId: 1, startedAt: -1, _id: -1 });
    expect(
      LiveSession.schema.indexes().find(([, options]) => options.name === 'uq_live_open_channel'),
    ).toMatchObject([
      { channelId: 1 },
      { unique: true, partialFilterExpression: { status: { $in: ['ACTIVE', 'ENDING'] } } },
    ]);
  });

  it('starts with ACTIVE revision zero and null nullable fields', async () => {
    const session = new LiveSession(sessionInput());
    await expect(session.validate()).resolves.toBeUndefined();
    expect(session).toMatchObject({ status: 'ACTIVE', revision: 0, endedAt: null });
    const participant = new SessionParticipant(participantInput());
    await expect(participant.validate()).resolves.toBeUndefined();
    expect(participant).toMatchObject({ leftAt: null, lastScope: null, lastScopeAt: null });
  });

  it.each([
    { epoch: 'invalid' },
    { revision: -1 },
    { revision: 1.1 },
    { revision: '1' },
    { revision: Infinity },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { status: 'FREE' },
    { status: 'ENDED' },
    { status: 'ACTIVE', endedAt: new Date() },
    { workspaceId: 'invalid' },
    { startedAt: 'invalid' },
  ])('rejects malformed session metadata %j', async (fields) => {
    await expect(new LiveSession({ ...sessionInput(), ...fields }).validate()).rejects.toThrow();
  });

  it('validates ENDED and the MAIN/GROUP/null scope timestamp pairs', async () => {
    await expect(
      new LiveSession({
        ...sessionInput(),
        status: 'ENDED',
        hostUserId: null,
        endedAt: new Date(),
      }).validate(),
    ).resolves.toBeUndefined();
    for (const lastScope of [{ kind: 'MAIN' }, { kind: 'GROUP', groupId: randomUUID() }]) {
      await expect(
        new SessionParticipant({
          ...participantInput(),
          lastScope,
          lastScopeAt: new Date(),
        }).validate(),
      ).resolves.toBeUndefined();
    }
    for (const fields of [
      { lastScope: { kind: 'GROUP' }, lastScopeAt: new Date() },
      { lastScope: { kind: 'GROUP', groupId: 'invalid' }, lastScopeAt: new Date() },
      { lastScope: { kind: 'MAIN', groupId: randomUUID() }, lastScopeAt: new Date() },
      { lastScope: { kind: 'MAIN' }, lastScopeAt: null },
      { lastScope: null, lastScopeAt: new Date() },
    ]) {
      await expect(
        new SessionParticipant({ ...participantInput(), ...fields }).validate(),
      ).rejects.toThrow();
    }
  });

  it('rejects runtime grants and resources in persistent metadata', async () => {
    expect(() => new LiveSession({ ...sessionInput(), policyRevision: 1 })).toThrow(
      /not in schema/,
    );
    expect(() => new SessionParticipant({ ...participantInput(), callGeneration: 1 })).toThrow(
      /not in schema/,
    );
    await expect(
      new SessionParticipant({
        ...participantInput(),
        lastScope: { kind: 'MAIN', producerId: 'fixture' },
      }).validate(),
    ).rejects.toThrow();
  });
});

describe('session repository input boundaries', () => {
  it('rejects revision overflow, invalid dates and raw update operators before accessing DB', async () => {
    const input = {
      sessionId: new Types.ObjectId(),
      epoch: randomUUID(),
      expectedRevision: 0,
      at: new Date(),
    };
    await expect(
      repository.beginEnding({ ...input, expectedRevision: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow();
    await expect(repository.beginEnding({ ...input, at: new Date(NaN) })).rejects.toThrow();
    await expect(
      repository.beginEnding({ ...input, $set: { status: 'ENDED' } } as never),
    ).rejects.toThrow();
    await expect(
      repository.setScope({
        ...input,
        userId: new Types.ObjectId(),
        scope: { kind: 'GROUP', groupId: 'invalid' },
      }),
    ).rejects.toThrow();
    expect(database.isConnected()).toBe(false);
  });
});
