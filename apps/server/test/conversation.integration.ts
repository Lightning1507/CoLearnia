import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import {
  channelConversationIndex,
  conversationModel,
  createChannelConversationFactory,
} from '../src/messaging/conversation.js';
import type { CreateChannelConversation } from '../src/workspaces/ports.js';
import { testReplicaUri } from './replica-uri.js';

// Isolated DB owned by this run, following the SCRUM-15 integration test convention.
const databaseName = `colearnia_test_scrum31_${randomUUID().replaceAll('-', '')}`;
const uri = testReplicaUri(databaseName);
const database = createDatabase(uri);
const Conversation = conversationModel(database.connection);
const createConversation: CreateChannelConversation = createChannelConversationFactory(
  database.connection,
).create;
const preparedIds = () => ({
  workspaceId: new Types.ObjectId().toHexString(),
  channelId: new Types.ObjectId().toHexString(),
  conversationId: new Types.ObjectId().toHexString(),
  createdAt: new Date('2026-11-08T00:00:00Z'),
});
let ownsDatabase = false;

function fixtureCollections() {
  const db = database.connection.db!;
  return {
    workspaces: db.collection<{ _id: string }>('workspace_fixture'),
    memberships: db.collection<{ workspaceId: string; role: string }>('membership_fixture'),
    channels: db.collection<{ _id: string; workspaceId: string; name: string }>('channel_fixture'),
  };
}

async function writeM1Fixtures(ids: ReturnType<typeof preparedIds>, session: ClientSession) {
  const { workspaces, memberships, channels } = fixtureCollections();
  await workspaces.insertOne({ _id: ids.workspaceId }, { session });
  await memberships.insertOne({ workspaceId: ids.workspaceId, role: 'OWNER' }, { session });
  await channels.insertOne(
    { _id: ids.channelId, workspaceId: ids.workspaceId, name: 'general' },
    { session },
  );
}

async function counts(ids: ReturnType<typeof preparedIds>, session?: ClientSession) {
  const { workspaces, memberships, channels } = fixtureCollections();
  const options = session ? { session } : {};
  return [
    await workspaces.countDocuments({ _id: ids.workspaceId }, options),
    await memberships.countDocuments({ workspaceId: ids.workspaceId }, options),
    await channels.countDocuments({ _id: ids.channelId }, options),
    await Conversation.countDocuments({ _id: ids.conversationId }).session(session ?? null),
  ];
}

beforeAll(async () => {
  await database.connect();
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs0');
  expect(hello.isWritablePrimary).toBe(true);
  expect(database.connection.name).toBe(databaseName);
  ownsDatabase = true;
  for (const collection of Object.values(fixtureCollections())) {
    await database.connection.db!.createCollection(collection.collectionName);
  }
  await Conversation.createCollection();
  await Conversation.createIndexes();
});

afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === databaseName) {
      await database.connection.dropDatabase();
    }
  } finally {
    await database.close();
  }
});

describe('SCRUM-31 CHANNEL conversation with the shared transaction', () => {
  it('commits all four records and preserves the prepared conversation identity and time', async () => {
    const ids = preparedIds();
    const result = await database.transaction(async (session) => {
      await writeM1Fixtures(ids, session);
      const result = await createConversation({ ...ids, dbSession: session });
      expect(await counts(ids, session)).toEqual([1, 1, 1, 1]);
      expect(await counts(ids)).toEqual([0, 0, 0, 0]);
      return result;
    });

    expect(result).toEqual({ conversationId: ids.conversationId });
    expect(await counts(ids)).toEqual([1, 1, 1, 1]);
    const record = await Conversation.findById(result.conversationId).orFail();
    expect(record.workspaceId.toHexString()).toBe(ids.workspaceId);
    expect(record.scope.channelId?.toHexString()).toBe(ids.channelId);
    expect(record).toMatchObject({
      kind: 'CHANNEL',
      closedAt: null,
      purgeAt: null,
      createdAt: ids.createdAt,
      updatedAt: ids.createdAt,
    });
  });

  it('rolls back every record if M1 fails after the conversation insert', async () => {
    const ids = preparedIds();
    const failure = new Error('injected after conversation insert');
    await expect(
      database.transaction(async (session) => {
        await writeM1Fixtures(ids, session);
        await createConversation({ ...ids, dbSession: session });
        expect(await counts(ids, session)).toEqual([1, 1, 1, 1]);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await counts(ids)).toEqual([0, 0, 0, 0]);
  });

  it('rolls back M1 writes when MongoDB rejects a duplicate CHANNEL scope', async () => {
    const existing = preparedIds();
    await database.transaction((session) =>
      createConversation({ ...existing, dbSession: session }),
    );
    const ids = { ...preparedIds(), channelId: existing.channelId };
    expect(await preflightIndexes(database.connection, [channelConversationIndex])).toEqual({
      ready: true,
      issues: [],
    });
    await expect(
      database.transaction(async (session) => {
        await writeM1Fixtures(ids, session);
        await createConversation({ ...ids, dbSession: session });
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await counts(ids)).toEqual([0, 0, 0, 0]);
    expect(await Conversation.exists({ _id: existing.conversationId })).not.toBeNull();
  });

  it('retries a transient failure after insert with the same ID and timestamps', async () => {
    const ids = preparedIds();
    const failure = new mongoose.mongo.MongoServerError({ message: 'injected transient failure' });
    failure.addErrorLabel('TransientTransactionError');
    let attempts = 0;

    const result = await database.transaction(async (session) => {
      attempts += 1;
      const conversation = await createConversation({ ...ids, dbSession: session });
      if (attempts === 1) throw failure;
      return conversation;
    });

    expect(attempts).toBe(2);
    expect(result).toEqual({ conversationId: ids.conversationId });
    const records = await Conversation.find({
      kind: 'CHANNEL',
      'scope.channelId': ids.channelId,
    }).lean();
    expect(records).toHaveLength(1);
    expect(records[0]?._id.toHexString()).toBe(ids.conversationId);
    expect(records[0]).toMatchObject({ createdAt: ids.createdAt, updatedAt: ids.createdAt });
  });

  it('allows only one of two concurrent CHANNEL inserts for the same channel', async () => {
    const first = preparedIds();
    const second = { ...first, conversationId: preparedIds().conversationId };
    let releaseWrites!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      releaseWrites = resolve;
    });
    let started = 0;

    const attempt = (ids: typeof first) =>
      database.transaction(async (session) => {
        started += 1;
        if (started === 2) releaseWrites();
        await bothStarted;
        return createConversation({ ...ids, dbSession: session });
      });

    const results = await Promise.allSettled([attempt(first), attempt(second)]);
    const successes = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    expect(successes).toHaveLength(1);
    expect(failures).toEqual([expect.objectContaining({ code: 11000 })]);

    const records = await Conversation.find({
      kind: 'CHANNEL',
      'scope.channelId': first.channelId,
    }).lean();
    expect(records.map((record) => record._id.toHexString())).toEqual([
      successes[0]?.conversationId,
    ]);
  });

  it('allows CHANNEL and SESSION to share a channel ID under the partial index', async () => {
    const ids = preparedIds();
    const sessionId = new Types.ObjectId();
    await database.transaction(async (session) => {
      await createConversation({ ...ids, dbSession: session });
      await new Conversation({
        workspaceId: ids.workspaceId,
        kind: 'SESSION',
        scope: { channelId: ids.channelId, sessionId },
      }).save({ session });
    });

    const records = await Conversation.find({ 'scope.channelId': ids.channelId }).lean();
    expect(records.map((record) => record.kind).sort()).toEqual(['CHANNEL', 'SESSION']);
  });

  it('rejects a session without an active transaction before writing', async () => {
    const ids = preparedIds();
    const session = await database.connection.startSession();
    try {
      await expect(createConversation({ ...ids, dbSession: session })).rejects.toThrow(
        /active transaction/,
      );
    } finally {
      await session.endSession();
    }
    expect(await counts(ids)).toEqual([0, 0, 0, 0]);
  });

  it('rejects an active session from a different MongoDB client', async () => {
    const ids = preparedIds();
    const other = createDatabase(uri);
    try {
      await other.connect();
      await expect(
        other.transaction((session) => createConversation({ ...ids, dbSession: session })),
      ).rejects.toThrow(/same MongoClient/);
      expect(await counts(ids)).toEqual([0, 0, 0, 0]);
    } finally {
      await other.close();
    }
  });

  it('rejects a scope from another kind and an inconsistent pair key', async () => {
    const workspaceId = new Types.ObjectId();
    await expect(
      new Conversation({
        workspaceId,
        kind: 'CHANNEL',
        scope: { channelId: new Types.ObjectId(), sessionId: new Types.ObjectId() },
      }).validate(),
    ).rejects.toThrow(/Scope does not match conversation kind/);
    await expect(
      new Conversation({
        workspaceId,
        kind: 'DIRECT',
        scope: {
          participantUserIds: [new Types.ObjectId(), new Types.ObjectId()],
          pairKey: 'wrong',
        },
      }).validate(),
    ).rejects.toThrow(/match pairKey/);
  });
});
