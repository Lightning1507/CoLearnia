import { randomUUID } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import type { IndexRequirement } from '../src/lib/database-preflight.js';
import type { GeneralConversationFactory } from '../src/messaging/ports.js';

// Fixed local endpoint, generated DB owned only by this run. Never read app MONGO_URI.
const databaseName = `colearnia_test_scrum15_${randomUUID().replaceAll('-', '')}`;
const uri = `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0&directConnection=true`;
const database = createDatabase(uri);
const connection = database.connection;
const owner = connection.model(
  'TransactionOwnerFixture',
  new Schema({ _id: String, value: String }, { versionKey: false }),
  'transaction_owner_fixture',
);
const conversations = connection.model(
  'ConversationFixture',
  new Schema(
    { _id: String, workspaceId: String, channelId: String, createdAt: Date },
    { versionKey: false },
  ),
  'conversation_fixture',
);
const factory: GeneralConversationFactory<ClientSession> = {
  async create(input) {
    await conversations.create(
      [
        {
          _id: input.conversationId,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          createdAt: input.createdAt,
        },
      ],
      { session: input.dbSession },
    );
    return { conversationId: input.conversationId };
  },
};
const prepared = {
  workspaceId: '000000000000000000000001',
  channelId: '000000000000000000000002',
  conversationId: '000000000000000000000003',
  createdAt: new Date('2026-11-07T00:00:00Z'),
};
let initialized = false;

beforeAll(async () => {
  await database.connect();
  const hello = await connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs0');
  expect(hello.isWritablePrimary).toBe(true);
  // Explicit DDL belongs to test setup, never the transaction callback or app startup.
  await owner.createCollection();
  await conversations.createCollection();
  initialized = true;
});
beforeEach(async () => {
  await owner.deleteMany({});
  await conversations.deleteMany({});
});
afterAll(async () => {
  try {
    if (initialized && connection.name === databaseName) await connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('shared Mongoose transaction on MongoDB rs0', () => {
  it('does not auto-create a model collection or its declared index', async () => {
    const unprovisioned = connection.model(
      'UnprovisionedFixture',
      new Schema({ key: { type: String, unique: true } }),
      'unprovisioned_fixture',
    );
    await unprovisioned.init();
    expect(await connection.db!.listCollections({ name: 'unprovisioned_fixture' }).hasNext()).toBe(
      false,
    );
  });

  it('bounds transient retries by the client deadline and leaves no writes', async () => {
    const bounded = createDatabase(uri, {
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      operationTimeoutMS: 200,
    });
    let used: ClientSession | undefined;
    let attempts = 0;
    try {
      await bounded.connect();
      await expect(
        bounded.transaction(async (session) => {
          used = session;
          attempts += 1;
          await bounded.connection
            .db!.collection('transaction_owner_fixture')
            .insertOne({ _id: new mongoose.Types.ObjectId() }, { session });
          const error = new mongoose.mongo.MongoServerError({
            message: 'injected transient error',
          });
          error.addErrorLabel('TransientTransactionError');
          throw error;
        }),
      ).rejects.toBeInstanceOf(mongoose.mongo.MongoOperationTimeoutError);
      // Deadline may expire in the first DB operation on a slow runner. Retry itself
      // is covered separately with a two-attempt fixture, without a short deadline.
      expect(attempts).toBeGreaterThan(0);
      expect(used?.hasEnded).toBe(true);
      expect(await owner.countDocuments({})).toBe(0);
    } finally {
      await bounded.close();
    }
  });

  it('commits M1 and a real DB consumer of the M2 port atomically', async () => {
    let used: ClientSession | undefined;
    const result = await database.transaction(async (session) => {
      used = session;
      expect(session.inTransaction()).toBe(true);
      await owner.create([{ _id: prepared.workspaceId }], { session });
      const result = await factory.create({ ...prepared, dbSession: session });
      expect(await conversations.countDocuments({}).session(session)).toBe(1);
      // Outside the session neither uncommitted insert is visible.
      expect(await owner.countDocuments({})).toBe(0);
      expect(await conversations.countDocuments({})).toBe(0);
      return result;
    });
    expect(result).toEqual({ conversationId: prepared.conversationId });
    expect(await owner.countDocuments({})).toBe(1);
    expect(await conversations.countDocuments({})).toBe(1);
    expect(used?.hasEnded).toBe(true);
    expect(owner.db).toBe(conversations.db);
    expect(owner.db).toBe(connection);
  });

  it.each(['M2 failure', 'failure after both writes'])(
    'rolls back on %s and ends session',
    async (mode) => {
      const failure = new Error(mode);
      let used: ClientSession | undefined;
      await expect(
        database.transaction(async (session) => {
          used = session;
          await owner.create([{ _id: prepared.workspaceId }], { session });
          if (mode === 'M2 failure') throw failure;
          await factory.create({ ...prepared, dbSession: session });
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await owner.countDocuments({})).toBe(0);
      expect(await conversations.countDocuments({})).toBe(0);
      expect(used?.hasEnded).toBe(true);
    },
  );

  it('retries a transient callback with stable IDs/time and no partial first-attempt writes', async () => {
    let attempts = 0;
    await database.transaction(async (session) => {
      attempts += 1;
      await owner.create([{ _id: prepared.workspaceId }], { session });
      await factory.create({ ...prepared, dbSession: session });
      if (attempts === 1) {
        const error = new mongoose.mongo.MongoServerError({ message: 'injected transient error' });
        error.addErrorLabel('TransientTransactionError');
        throw error;
      }
    });
    expect(attempts).toBe(2);
    expect(await owner.countDocuments({})).toBe(1);
    expect(await conversations.countDocuments({})).toBe(1);
    expect((await conversations.findById(prepared.conversationId).lean())?.createdAt).toEqual(
      prepared.createdAt,
    );
  });

  it('rejects a session from another client and rolls back the owner write', async () => {
    const other = createDatabase(uri);
    try {
      await other.connect();
      await expect(
        database.transaction(async (session) => {
          await owner.create([{ _id: prepared.workspaceId }], { session });
          await other.connection
            .db!.collection('conversation_fixture')
            .insertOne({ _id: new mongoose.Types.ObjectId() }, { session });
        }),
      ).rejects.toThrow(/same MongoClient/);
      expect(await owner.countDocuments({})).toBe(0);
      expect(await conversations.countDocuments({})).toBe(0);
    } finally {
      await other.close();
    }
  });
});

describe('read-only index preflight and isolated migration rehearsal', () => {
  const requirement: IndexRequirement = {
    collection: 'index_fixture',
    name: 'uq_fixture_key',
    key: { key: 1 },
    unique: true,
  };
  beforeEach(async () => {
    if (await connection.db!.listCollections({ name: requirement.collection }).hasNext()) {
      await connection.db!.collection(requirement.collection).drop();
    }
  });

  it('verifies the auth-session TTL index and detects a wrong expiry option', async () => {
    const ttl: IndexRequirement = {
      collection: requirement.collection,
      name: 'ttl_auth_expiry',
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
    };
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertOne({ expiresAt: new Date('2100-01-01T00:00:00Z') });
    expect((await preflightIndexes(connection, [ttl])).issues[0]?.code).toBe('MISSING_INDEX');
    await collection.createIndex(ttl.key, { name: ttl.name, expireAfterSeconds: 0 });
    expect(await preflightIndexes(connection, [ttl])).toEqual({ ready: true, issues: [] });
    expect(
      (await preflightIndexes(connection, [{ ...ttl, expireAfterSeconds: 60 }])).issues[0]?.code,
    ).toBe('INDEX_OPTIONS');
  });

  it('checks M2 dotted-path uniqueness only within the expected partial filter', async () => {
    const partial: IndexRequirement = {
      collection: requirement.collection,
      name: 'uq_conv_channel',
      key: { 'scope.channelId': 1 },
      unique: true,
      partialFilterExpression: { kind: 'CHANNEL' },
    };
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertMany([
      { kind: 'CHANNEL', scope: { channelId: 'channel-a' } },
      { kind: 'DIRECT', scope: { channelId: 'channel-a' } },
      { kind: 'DIRECT', scope: { channelId: 'channel-a' } },
    ]);
    expect(
      (await preflightIndexes(connection, [partial])).issues.map((issue) => issue.code),
    ).toEqual(['MISSING_INDEX']);
    await collection.createIndex(partial.key, {
      name: partial.name,
      unique: true,
      partialFilterExpression: partial.partialFilterExpression!,
    });
    expect(await preflightIndexes(connection, [partial])).toEqual({ ready: true, issues: [] });
    await expect(
      collection.insertOne({ kind: 'CHANNEL', scope: { channelId: 'channel-a' } }),
    ).rejects.toMatchObject({ code: 11000 });
    const wrongFilter = await preflightIndexes(connection, [
      { ...partial, partialFilterExpression: { kind: 'DIRECT' } },
    ]);
    expect(wrongFilter.issues.map((issue) => issue.code)).toEqual([
      'INDEX_OPTIONS',
      'DUPLICATE_KEYS',
    ]);
  });

  it('finds duplicates within a partial index before attempting its creation', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertMany([
      { kind: 'CHANNEL', scope: { channelId: 'channel-a' } },
      { kind: 'CHANNEL', scope: { channelId: 'channel-a' } },
    ]);
    const report = await preflightIndexes(connection, [
      {
        collection: requirement.collection,
        name: 'uq_conv_channel',
        key: { 'scope.channelId': 1 },
        unique: true,
        partialFilterExpression: { kind: 'CHANNEL' },
      },
    ]);
    expect(report.issues.map((issue) => issue.code)).toEqual(['MISSING_INDEX', 'DUPLICATE_KEYS']);
  });

  it('accepts M4 open-session partial indexes and prevents a second open session', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    const partial = {
      name: 'uq_live_open_channel',
      unique: true,
      partialFilterExpression: { status: { $in: ['ACTIVE', 'ENDING'] } },
    };
    await collection.insertMany([
      { channelId: 'channel-a', status: 'ACTIVE' },
      { channelId: 'channel-a', status: 'ENDED' },
      { channelId: 'channel-a', status: 'ENDED' },
    ]);
    await collection.createIndex({ channelId: 1 }, partial);
    expect(
      await preflightIndexes(connection, [
        { collection: requirement.collection, key: { channelId: 1 }, ...partial },
      ]),
    ).toEqual({ ready: true, issues: [] });
    await expect(
      collection.insertOne({ channelId: 'channel-a', status: 'ENDING' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects arrays at dotted-path ancestors instead of approving a multikey index', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertOne({
      kind: 'CHANNEL',
      scope: [{ channelId: 'a' }, { channelId: 'b' }],
    });
    const report = await preflightIndexes(connection, [
      {
        collection: requirement.collection,
        name: 'uq_conv_channel',
        key: { 'scope.channelId': 1 },
        unique: true,
        partialFilterExpression: { kind: 'CHANNEL' },
      },
    ]);
    expect(report.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_INDEX');
  });

  it('reports missing collections without creating them', async () => {
    expect((await preflightIndexes(connection, [requirement])).issues[0]?.code).toBe(
      'MISSING_COLLECTION',
    );
    expect(await connection.db!.listCollections({ name: requirement.collection }).hasNext()).toBe(
      false,
    );
  });

  it('stops on duplicate data and leaves the data/indexes unchanged', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertMany([{ key: 'same' }, { key: 'same' }]);
    const report = await preflightIndexes(connection, [requirement]);
    expect(report.issues.map((issue) => issue.code)).toEqual(['MISSING_INDEX', 'DUPLICATE_KEYS']);
    expect(await collection.countDocuments()).toBe(2);
    expect(await collection.listIndexes().toArray()).toHaveLength(1);
    await expect(
      collection.createIndex(requirement.key, { name: requirement.name, unique: true }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('applies an explicit fixture index twice, verifies options and rolls back only that index', async () => {
    const collection = await connection.db!.createCollection(requirement.collection, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['key'],
          properties: { key: { bsonType: 'string' } },
        },
      },
    });
    await collection.insertOne({ key: 'first' });
    expect((await preflightIndexes(connection, [requirement])).issues[0]?.code).toBe(
      'MISSING_INDEX',
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await collection.createIndex(requirement.key, { name: requirement.name, unique: true });
    }
    expect(await preflightIndexes(connection, [requirement])).toEqual({ ready: true, issues: [] });
    const info = await connection
      .db!.listCollections({ name: requirement.collection }, { nameOnly: false })
      .next();
    expect(info?.options?.validator).toHaveProperty('$jsonSchema');
    await expect(collection.insertOne({ key: 'first' })).rejects.toMatchObject({ code: 11000 });
    await expect(collection.insertOne({ wrong: true })).rejects.toMatchObject({ code: 121 });
    await collection.dropIndex(requirement.name);
    expect(await collection.countDocuments()).toBe(1);
    expect((await preflightIndexes(connection, [requirement])).issues[0]?.code).toBe(
      'MISSING_INDEX',
    );
  });

  it('stops on wrong index options without repairing or dropping the index', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.createIndex(requirement.key, { name: requirement.name });
    expect((await preflightIndexes(connection, [requirement])).issues[0]?.code).toBe(
      'INDEX_OPTIONS',
    );
    expect(
      (await collection.listIndexes().toArray()).find((index) => index.name === requirement.name)
        ?.unique,
    ).toBeUndefined();
  });

  it('refuses to certify multikey data with the scalar duplicate check', async () => {
    const collection = await connection.db!.createCollection(requirement.collection);
    await collection.insertOne({ key: ['one', 'two'] });
    expect(
      (await preflightIndexes(connection, [requirement])).issues.map((issue) => issue.code),
    ).toContain('UNSUPPORTED_INDEX');
  });
});
