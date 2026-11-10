import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  workspaceCollectionValidators,
  workspaceIndexRequirements,
  workspaceModels,
} from '../src/workspaces/workspace-models.js';
import {
  assertWorkspaceOwner,
  WorkspaceOwnerInvariantError,
} from '../src/workspaces/workspace-integrity.js';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum30_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const { Workspace, Membership, Invitation } = workspaceModels(database.connection);
let ownsDatabase = false;
const workspaceInput = (ownerId = new Types.ObjectId()) => ({ name: 'Lớp học', ownerId });
const memberInput = (workspaceId = new Types.ObjectId(), userId = new Types.ObjectId()) => ({
  workspaceId,
  userId,
  role: 'MEMBER' as const,
  joinedAt: new Date(),
});
function invitationInput(workspaceId = new Types.ObjectId()) {
  const token = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', randomBytes(32), iv);
  cipher.setAAD(Buffer.from(`colearnia:invitation:v1:${workspaceId.toHexString()}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(token), cipher.final()]);
  return {
    workspaceId,
    createdByUserId: new Types.ObjectId(),
    tokenHash: createHash('sha256').update(token).digest('hex'),
    encryptedToken: {
      algorithm: 'AES-256-GCM' as const,
      keyId: 'integration-test',
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    },
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
  for (const model of [Workspace, Membership, Invitation]) await model.init();
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await Workspace.createCollection({
    validator: workspaceCollectionValidators.workspaces,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await Membership.createCollection({
    validator: workspaceCollectionValidators.memberships,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await Invitation.createCollection({
    validator: workspaceCollectionValidators.invitations,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  for (const model of [Workspace, Membership, Invitation]) await model.createIndexes();
});

afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum30_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('SCRUM-30 workspace persistence on MongoDB', () => {
  it('provisions reviewed indexes and native validators without TTL or owner/name uniqueness', async () => {
    expect(await preflightIndexes(database.connection, workspaceIndexRequirements)).toEqual({
      ready: true,
      issues: [],
    });
    for (const [name, validator] of Object.entries(workspaceCollectionValidators)) {
      const collection = await database.connection
        .db!.listCollections({ name }, { nameOnly: false })
        .next();
      expect(collection?.options).toMatchObject({
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
    const ownerId = new Types.ObjectId();
    await Workspace.create(workspaceInput(ownerId));
    await Workspace.create(workspaceInput(ownerId));
    expect(await Workspace.countDocuments({ ownerId })).toBe(2);
    expect((await Workspace.collection.indexes()).map((index) => index.name)).toEqual(['_id_']);
    expect(
      (await Invitation.collection.indexes()).every(
        (index) => index.expireAfterSeconds === undefined,
      ),
    ).toBe(true);
  });

  it('commits Workspace and OWNER together and detects missing/mismatched/duplicate owners', async () => {
    const workspaceId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const check = () =>
      database.transaction((session) =>
        assertWorkspaceOwner(database.connection, workspaceId, session),
      );
    await expect(check()).rejects.toBeInstanceOf(WorkspaceOwnerInvariantError);
    await database.transaction(async (session) => {
      await new Workspace({ ...workspaceInput(ownerId), _id: workspaceId }).save({ session });
      await new Membership({ ...memberInput(workspaceId, ownerId), role: 'OWNER' }).save({
        session,
      });
      await assertWorkspaceOwner(database.connection, workspaceId, session);
    });
    await expect(check()).resolves.toBeUndefined();
    const extra = await Membership.create({ ...memberInput(workspaceId), role: 'OWNER' });
    await expect(check()).rejects.toBeInstanceOf(WorkspaceOwnerInvariantError);
    await Membership.updateOne({ _id: extra._id }, { $set: { role: 'MEMBER' } });
    await Workspace.collection.updateOne(
      { _id: workspaceId },
      { $set: { ownerId: new Types.ObjectId() } },
    );
    await expect(check()).rejects.toBeInstanceOf(WorkspaceOwnerInvariantError);
    await Workspace.collection.updateOne(
      { _id: workspaceId },
      { $set: { ownerId, deletedAt: new Date() } },
    );
    await expect(check()).rejects.toBeInstanceOf(WorkspaceOwnerInvariantError);
    const session = await database.connection.startSession();
    try {
      await expect(assertWorkspaceOwner(database.connection, workspaceId, session)).rejects.toThrow(
        'requires a transaction',
      );
    } finally {
      await session.endSession();
    }
  });

  it('rolls back Workspace/OWNER/invitation writes together on the shared connection', async () => {
    const workspaceId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    await expect(
      database.transaction(async (session) => {
        await new Workspace({ ...workspaceInput(ownerId), _id: workspaceId }).save({ session });
        await new Membership({ ...memberInput(workspaceId, ownerId), role: 'OWNER' }).save({
          session,
        });
        await new Invitation(invitationInput(workspaceId)).save({ session });
        await assertWorkspaceOwner(database.connection, workspaceId, session);
        throw new Error('Injected rollback');
      }),
    ).rejects.toThrow('Injected rollback');
    expect(await Workspace.exists({ _id: workspaceId })).toBeNull();
    expect(await Membership.exists({ workspaceId })).toBeNull();
    expect(await Invitation.exists({ workspaceId })).toBeNull();
  });

  it('keeps one membership per pair through removal/rejoin and rejects stale CAS', async () => {
    const input = memberInput();
    const member = await Membership.create(input);
    await expect(Membership.create(input)).rejects.toMatchObject({ code: 11000 });
    await Membership.updateOne(
      { _id: member._id, revision: 0, status: 'ACTIVE' },
      { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
    );
    await expect(Membership.create(input)).rejects.toMatchObject({ code: 11000 });
    const rejoin = () =>
      Membership.updateOne(
        { _id: member._id, revision: 1, status: 'REMOVED' },
        {
          $set: { status: 'ACTIVE', removedAt: null, joinedAt: new Date() },
          $inc: { revision: 1, incarnation: 1 },
        },
      );
    const results = await Promise.all([rejoin(), rejoin()]);
    expect(results.reduce((sum, result) => sum + result.modifiedCount, 0)).toBe(1);
    expect(await Membership.findById(member._id).lean()).toMatchObject({
      incarnation: 2,
      revision: 2,
      removedAt: null,
    });
    await Membership.updateOne(
      { _id: member._id, revision: 2 },
      { $set: { role: 'ADMIN' }, $inc: { revision: 1 } },
    );
    expect(await Membership.findById(member._id).lean()).toMatchObject({
      incarnation: 2,
      revision: 3,
      role: 'ADMIN',
    });
    expect(
      await Membership.countDocuments({ workspaceId: input.workspaceId, userId: input.userId }),
    ).toBe(1);
  });

  it('keeps Workspace owner and membership identity immutable through Mongoose updates', async () => {
    const workspace = await Workspace.create(workspaceInput());
    const member = await Membership.create(memberInput(workspace._id));
    await Workspace.updateOne(
      { _id: workspace._id },
      { $set: { ownerId: new Types.ObjectId() } },
      { runValidators: true },
    );
    await Membership.updateOne(
      { _id: member._id },
      { $set: { workspaceId: new Types.ObjectId(), userId: new Types.ObjectId() } },
      { runValidators: true },
    );
    expect((await Workspace.findById(workspace._id))?.ownerId).toEqual(workspace.ownerId);
    expect(await Membership.findById(member._id).lean()).toMatchObject({
      workspaceId: workspace._id,
      userId: member.userId,
    });
  });

  it('enforces one invitation per Workspace even when disabled and tokens unique across Workspaces', async () => {
    const input = invitationInput();
    await Invitation.create({ ...input, enabled: false });
    await expect(Invitation.create(invitationInput(input.workspaceId))).rejects.toMatchObject({
      code: 11000,
    });
    await expect(
      Invitation.create({ ...input, workspaceId: new Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
    const other = invitationInput();
    const result = await Promise.allSettled([
      Invitation.create(other),
      Invitation.create(invitationInput(other.workspaceId)),
    ]);
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(await Invitation.countDocuments({ workspaceId: other.workspaceId })).toBe(1);
  });

  it('atomically replaces both token representations with invitation revision CAS', async () => {
    const input = invitationInput();
    const invitation = await Invitation.create(input);
    const replacement = invitationInput(input.workspaceId);
    await Invitation.updateOne(
      { _id: invitation._id, revision: 0 },
      {
        $set: {
          tokenHash: replacement.tokenHash,
          encryptedToken: replacement.encryptedToken,
          enabled: true,
        },
        $inc: { revision: 1 },
      },
    );
    expect(
      await Invitation.exists({
        workspaceId: input.workspaceId,
        tokenHash: input.tokenHash,
        enabled: true,
      }),
    ).toBeNull();
    expect(
      await Invitation.findById(invitation._id).select('+tokenHash +encryptedToken').lean(),
    ).toMatchObject({
      tokenHash: replacement.tokenHash,
      encryptedToken: replacement.encryptedToken,
      revision: 1,
    });
    const stale = await Invitation.updateOne(
      { _id: invitation._id, revision: 0 },
      { $set: { enabled: false }, $inc: { revision: 1 } },
    );
    expect(stale.matchedCount).toBe(0);
    expect((await Invitation.findById(invitation._id).lean())?.enabled).toBe(true);
  });

  it('hides hash and encrypted token from default queries and document serialization', async () => {
    const invitation = await Invitation.create(invitationInput());
    const normal = await Invitation.findById(invitation._id).lean();
    expect(normal).not.toHaveProperty('tokenHash');
    expect(normal).not.toHaveProperty('encryptedToken');
    const selected = await Invitation.findById(invitation._id).select('+tokenHash +encryptedToken');
    expect(selected?.tokenHash).toBeDefined();
    for (const output of [selected!.toObject(), selected!.toJSON()]) {
      expect(output).not.toHaveProperty('tokenHash');
      expect(output).not.toHaveProperty('encryptedToken');
    }
  });

  it('rejects malformed raw Workspace writes, Unicode edge whitespace and unsafe counters', async () => {
    const workspace = await Workspace.create(workspaceInput());
    const collection = Workspace.collection;
    const valid = await collection.findOne({ _id: workspace._id });
    await collection.updateOne({ _id: workspace._id }, { $set: { name: '🌱'.repeat(80) } });
    for (const fields of [
      { name: '🌱' },
      { name: '🌱'.repeat(81) },
      { name: '\u00a0Tên' },
      { name: 'Tên\ufeff' },
      { name: 'Tên\n' },
      { name: 42 },
      { revision: 0.5 },
      { revision: '1' },
      { revision: -1 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { revision: mongo.Decimal128.fromString('2') },
      { revision: NaN },
      { revision: Infinity },
      { ownerId: 'invalid' },
      { token: 'unexpected' },
    ]) {
      await expect(
        collection.updateOne({ _id: workspace._id }, { $set: fields }),
      ).rejects.toMatchObject({ code: 121 });
    }
    await expect(
      collection.insertOne({ ...valid, _id: new Types.ObjectId(), name: '\ufeffLớp' }),
    ).rejects.toMatchObject({ code: 121 });
    await collection.updateOne(
      { _id: workspace._id },
      { $set: { revision: new mongo.Long(2_147_483_648) } },
    );
    await collection.updateOne(
      { _id: workspace._id },
      { $set: { revision: Number.MAX_SAFE_INTEGER } },
    );
    await expect(
      collection.updateOne({ _id: workspace._id }, { $inc: { revision: 1 } }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('rejects invalid raw membership lifecycles and missing references', async () => {
    const member = await Membership.create(memberInput());
    const collection = Membership.collection;
    for (const fields of [
      { role: 'HOST' },
      { status: 'REMOVED' },
      { removedAt: new Date() },
      { role: 'OWNER', status: 'REMOVED', removedAt: new Date() },
      { incarnation: 0 },
      { incarnation: 1.5 },
      { incarnation: '1' },
      { revision: -1 },
      { revision: mongo.Decimal128.fromString('2') },
      { joinedAt: null },
      { workspaceId: 'invalid' },
    ])
      await expect(
        collection.updateOne({ _id: member._id }, { $set: fields }),
      ).rejects.toMatchObject({ code: 121 });
    await expect(
      collection.updateOne({ _id: member._id }, { $unset: { userId: '' } }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('rejects raw invitation plaintext, incomplete encryption and legacy expiry/use fields', async () => {
    const invitation = await Invitation.create(invitationInput());
    const collection = Invitation.collection;
    for (const fields of [
      { token: 'plaintext' },
      { expiresAt: new Date() },
      { maxUses: 5 },
      { uses: 0 },
      { tokenHash: 'plaintext' },
      { tokenHash: 'a'.repeat(64) + '\n' },
      { encryptedToken: null },
      { 'encryptedToken.iv': 'short' },
      { 'encryptedToken.iv': 'a'.repeat(16) + '\n' },
      { 'encryptedToken.ciphertext': 'a'.repeat(43) },
      { 'encryptedToken.algorithm': 'AES-256-CBC' },
      { 'encryptedToken.authTag': 'short' },
      { 'encryptedToken.keyId': '' },
      { 'encryptedToken.token': 'plaintext' },
      { revision: -1 },
      { enabled: 'true' },
    ])
      await expect(
        collection.updateOne({ _id: invitation._id }, { $set: fields }),
      ).rejects.toMatchObject({ code: 121 });
    await expect(
      collection.updateOne({ _id: invitation._id }, { $unset: { 'encryptedToken.authTag': '' } }),
    ).rejects.toMatchObject({ code: 121 });
    await expect(
      collection.updateOne({ _id: invitation._id }, { $unset: { tokenHash: '' } }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
