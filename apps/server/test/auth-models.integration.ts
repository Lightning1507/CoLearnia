import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authIndexRequirements, authModels } from '../src/auth/models.js';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';

const port = Number(process.env.COLEARNIA_DB_TEST_PORT ?? '27017');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Invalid COLEARNIA_DB_TEST_PORT');
}
const databaseName = `colearnia_test_scrum16_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(
  `mongodb://127.0.0.1:${port}/${databaseName}?replicaSet=rs0&directConnection=true`,
);
const { User, AuthSession } = authModels(database.connection);
let ownsDatabase = false;

function userInput() {
  return {
    emailNormalized: `${randomUUID()}@example.test`,
    displayName: 'Tên thử',
    passwordHash: 'fixture-password-hash',
  };
}

beforeAll(async () => {
  await database.connect();
  const db = database.connection.db!;
  const hello = await db.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs0');
  expect(hello.isWritablePrimary).toBe(true);
  expect(database.connection.name).toBe(databaseName);
  ownsDatabase = true;
  await User.init();
  await AuthSession.init();
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await User.createCollection();
  await AuthSession.createCollection();
  await User.createIndexes();
  await AuthSession.createIndexes();
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

describe('SCRUM-16 account and session persistence', () => {
  it('uses the shared connection and declares all four expected indexes', async () => {
    const models = authModels(database.connection);
    expect(models.User).toBe(User);
    expect(models.AuthSession).toBe(AuthSession);
    expect(User.db).toBe(database.connection);
    expect(AuthSession.db).toBe(database.connection);
    expect(await preflightIndexes(database.connection, authIndexRequirements)).toEqual({
      ready: true,
      issues: [],
    });
  });

  it('rejects an email duplicate after trim and lowercase', async () => {
    const input = userInput();
    const user = await User.create({
      ...input,
      emailNormalized: `  ${input.emailNormalized.toUpperCase()}  `,
      displayName: '  Tên thử  ',
    });
    expect(user).toMatchObject({
      emailNormalized: input.emailNormalized,
      displayName: input.displayName,
      status: 'ACTIVE',
      avatar: null,
    });
    await expect(User.create(input)).rejects.toMatchObject({ code: 11000 });
    expect(await User.countDocuments({ emailNormalized: input.emailNormalized })).toBe(1);
  });

  it('creates User and AuthSession with the same transaction and rejects a duplicate token hash', async () => {
    const { user, session } = await database.transaction(async (dbSession) => {
      const user = await new User(userInput()).save({ session: dbSession });
      const session = await new AuthSession({
        userId: user._id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      }).save({ session: dbSession });
      expect(await User.exists({ _id: user._id })).toBeNull();
      expect(await AuthSession.exists({ _id: session._id })).toBeNull();
      return { user, session };
    });
    expect(await User.exists({ _id: user._id })).not.toBeNull();
    expect(await AuthSession.exists({ _id: session._id })).not.toBeNull();
    expect(session.revokedAt).toBeNull();
    await expect(
      AuthSession.create({
        userId: user._id,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('filters expired and revoked sessions before the TTL monitor can delete records', async () => {
    const now = new Date();
    const user = await User.create(userInput());
    await database.transaction(async (session) => {
      const records = [
        { expiresAt: new Date(now.getTime() - 1) },
        { expiresAt: now },
        { expiresAt: new Date(now.getTime() + 60_000), revokedAt: now },
        { expiresAt: new Date(now.getTime() + 60_000) },
      ];
      for (const record of records) {
        await new AuthSession({ userId: user._id, tokenHash: randomUUID(), ...record }).save({
          session,
        });
      }
      // The TTL monitor cannot see these uncommitted records.
      expect(await AuthSession.countDocuments({ userId: user._id }).session(session)).toBe(4);
      expect(
        await AuthSession.countDocuments({
          userId: user._id,
          expiresAt: { $gt: now },
          revokedAt: null,
        }).session(session),
      ).toBe(1);
    });
  });

  it('rejects malformed account and session writes without persisting them', async () => {
    const input = userInput();
    for (const fields of [
      { emailNormalized: 'invalid-email' },
      { passwordHash: '' },
      { passwordHash: 123 },
      { displayName: '🌱'.repeat(81) },
      { status: 'UNKNOWN' },
      { avatar: { publicId: 'fixture', secureUrl: 'http://example.test/avatar' } },
    ]) {
      await expect(new User({ ...input, ...fields }).save()).rejects.toHaveProperty(
        'name',
        'ValidationError',
      );
    }
    expect(await User.exists({ emailNormalized: input.emailNormalized })).toBeNull();

    const tokenHash = randomUUID();
    await expect(
      AuthSession.create({ userId: new Types.ObjectId(), tokenHash, expiresAt: 'invalid-date' }),
    ).rejects.toHaveProperty('errors.expiresAt');
    await expect(
      AuthSession.create({ userId: 'invalid-id', tokenHash, expiresAt: new Date() }),
    ).rejects.toHaveProperty('errors.userId');
    expect(await AuthSession.exists({ tokenHash })).toBeNull();
    expect(() => new AuthSession({ token: 'fixture-raw-token' })).toThrow(/not in schema/);
  });

  it('rejects a numeric display name before it can be stored as text', async () => {
    const input = userInput();
    await expect(new User({ ...input, displayName: 123 }).save()).rejects.toHaveProperty(
      'errors.displayName.kind',
      'string',
    );
    expect(await User.exists({ emailNormalized: input.emailNormalized })).toBeNull();
  });

  it('hides hashes in default queries and serialized documents', async () => {
    const user = await User.create(userInput());
    const authSession = await AuthSession.create({
      userId: user._id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await User.findById(user._id).lean().orFail()).not.toHaveProperty('passwordHash');
    expect(await AuthSession.findById(authSession._id).lean().orFail()).not.toHaveProperty(
      'tokenHash',
    );
    const selectedUser = await User.findById(user._id).select('+passwordHash').orFail();
    const selectedSession = await AuthSession.findById(authSession._id)
      .select('+tokenHash')
      .orFail();
    expect(selectedUser.passwordHash).toBe(user.passwordHash);
    expect(selectedSession.tokenHash).toBe(authSession.tokenHash);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(authSession.toJSON()).not.toHaveProperty('tokenHash');
    expect(selectedUser.toObject()).not.toHaveProperty('passwordHash');
    expect(selectedSession.toObject()).not.toHaveProperty('tokenHash');
  });
});
