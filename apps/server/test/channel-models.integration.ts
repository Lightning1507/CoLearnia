import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import { channelNameSchema } from '@colearnia/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  channelCollectionValidators,
  channelIndexRequirements,
  channelModels,
} from '../src/workspaces/channel-models.js';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum26_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
let ownsDatabase = false;

function channelInput(workspaceId = new Types.ObjectId()) {
  return { workspaceId, name: 'Kênh thử', type: 'TEXT' as const, accessMode: 'PRIVATE' as const };
}

function grantInput(
  channel: { _id: Types.ObjectId; workspaceId: Types.ObjectId },
  membershipId = new Types.ObjectId(),
) {
  return {
    workspaceId: channel.workspaceId,
    channelId: channel._id,
    membershipId,
    membershipIncarnation: 1,
    grantedByUserId: new Types.ObjectId(),
    grantedAt: new Date(),
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
  await Channel.init();
  await ChannelAccessGrant.init();
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await Channel.createCollection({
    validator: channelCollectionValidators.channels,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await ChannelAccessGrant.createCollection({
    validator: channelCollectionValidators.channelAccessGrants,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await Channel.createIndexes();
  await ChannelAccessGrant.createIndexes();
});

afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum26_')
    ) {
      await database.connection.dropDatabase();
    }
  } finally {
    await database.close();
  }
});

describe('SCRUM-26 channel persistence on MongoDB', () => {
  it('enforces JavaScript trim whitespace at name edges for raw inserts and updates', async () => {
    const channel = await Channel.create(channelInput());
    const channels = database.connection.db!.collection('channels');
    const stored = await channels.findOne({ _id: channel._id });
    expect(stored).not.toBeNull();
    await channels.insertOne({ ...stored, _id: new Types.ObjectId(), name: 'Tên hợp lệ' });
    const whitespace = [
      ...Array.from({ length: 5 }, (_, index) => String.fromCodePoint(0x0009 + index)),
      ' ',
      '\u00A0',
      '\u1680',
      ...Array.from({ length: 11 }, (_, index) => String.fromCodePoint(0x2000 + index)),
      '\u2028',
      '\u2029',
      '\u202F',
      '\u205F',
      '\u3000',
      '\uFEFF',
    ];
    for (const char of whitespace) {
      for (const name of [char, `${char}Tên`, `Tên${char}`]) {
        expect(name.trim()).not.toBe(name);
        await expect(
          channels.updateOne({ _id: channel._id }, { $set: { name } }),
        ).rejects.toMatchObject({ code: 121 });
        await expect(
          channels.insertOne({ ...stored, _id: new Types.ObjectId(), name }),
        ).rejects.toMatchObject({ code: 121 });
      }
      const name = `Tên${char}kênh`;
      expect(channelNameSchema.parse(name)).toBe(name);
      await channels.updateOne({ _id: channel._id }, { $set: { name } });
    }
    for (const name of ['\u0085', '\u180E', '\u200B']) {
      expect(channelNameSchema.parse(name)).toBe(name);
      await channels.updateOne({ _id: channel._id }, { $set: { name } });
    }
  });
  it('provisions exactly the reviewed indexes and native validators', async () => {
    expect(await preflightIndexes(database.connection, channelIndexRequirements)).toEqual({
      ready: true,
      issues: [],
    });
    for (const [name, validator] of Object.entries(channelCollectionValidators)) {
      const collection = await database.connection
        .db!.listCollections({ name }, { nameOnly: false })
        .next();
      expect(collection?.options).toMatchObject({
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
  });

  it('allows duplicate channel names, both types/access modes, rename and soft deletion', async () => {
    const workspaceId = new Types.ObjectId();
    for (const type of ['TEXT', 'LIVE'] as const) {
      for (const accessMode of ['WORKSPACE', 'PRIVATE'] as const) {
        const channel = await Channel.create({
          ...channelInput(workspaceId),
          type,
          accessMode,
          name: '🌱'.repeat(80),
        });
        expect(channel).toMatchObject({ type, accessMode, order: 0, revision: 0, deletedAt: null });
      }
    }
    const first = await Channel.create({ ...channelInput(workspaceId), name: 'general' });
    const second = await Channel.create({ ...channelInput(workspaceId), name: 'general' });
    await Channel.updateOne(
      { _id: first._id, revision: 0 },
      { $set: { name: 'Tên mới', deletedAt: new Date() }, $inc: { revision: 1 } },
      { runValidators: true },
    );
    expect(await Channel.findById(first._id).lean()).toMatchObject({
      name: 'Tên mới',
      revision: 1,
    });
    expect(await Channel.findById(second._id).lean()).toMatchObject({
      name: 'general',
      deletedAt: null,
    });
  });

  it('protects immutable channel identity/type/access through Mongoose writes', async () => {
    const channel = await Channel.create(channelInput());
    const workspaceId = channel.workspaceId;
    channel.type = 'LIVE';
    channel.accessMode = 'WORKSPACE';
    channel.workspaceId = new Types.ObjectId();
    await expect(channel.save()).rejects.toHaveProperty('name', 'ValidationError');
    await Channel.updateOne(
      { _id: channel._id },
      { $set: { type: 'LIVE' } },
      { runValidators: true },
    );
    expect(await Channel.findById(channel._id).lean()).toMatchObject({
      type: 'TEXT',
      accessMode: 'PRIVATE',
      workspaceId,
    });
  });

  it('enforces unique channel/membership pairs even for revoked and old-incarnation grants', async () => {
    const channel = await Channel.create(channelInput());
    const input = grantInput(channel);
    const grant = await ChannelAccessGrant.create({ ...input, revokedAt: new Date() });
    await expect(ChannelAccessGrant.create(input)).rejects.toMatchObject({ code: 11000 });
    await expect(
      ChannelAccessGrant.create({ ...input, membershipIncarnation: 2 }),
    ).rejects.toMatchObject({ code: 11000 });
    const otherChannel = await Channel.create(channelInput(channel.workspaceId));
    await ChannelAccessGrant.create({ ...input, channelId: otherChannel._id });
    await ChannelAccessGrant.create(grantInput(channel));
    expect(
      await ChannelAccessGrant.countDocuments({
        channelId: channel._id,
        membershipId: input.membershipId,
      }),
    ).toBe(1);
    expect((await ChannelAccessGrant.findById(grant._id).lean())?.revokedAt).toBeInstanceOf(Date);
  });

  it('matches the current membership incarnation and regrants the same document', async () => {
    const channel = await Channel.create(channelInput());
    const input = grantInput(channel);
    const grant = await ChannelAccessGrant.create(input);
    const currentGrant = (incarnation: number) =>
      ChannelAccessGrant.exists({
        workspaceId: channel.workspaceId,
        channelId: channel._id,
        membershipId: input.membershipId,
        membershipIncarnation: incarnation,
        revokedAt: null,
      });
    expect(await currentGrant(1)).not.toBeNull();
    expect(await currentGrant(2)).toBeNull();
    await database.transaction(async (session) => {
      await ChannelAccessGrant.updateOne(
        { _id: grant._id },
        { $set: { membershipIncarnation: 2, grantedAt: new Date(), revokedAt: null } },
        { session, runValidators: true },
      );
      await Channel.updateOne(
        { _id: channel._id, revision: 0 },
        { $inc: { revision: 1 } },
        { session, runValidators: true },
      );
    });
    expect(await currentGrant(1)).toBeNull();
    expect(await currentGrant(2)).not.toBeNull();
    expect(
      await ChannelAccessGrant.countDocuments({
        channelId: channel._id,
        membershipId: input.membershipId,
      }),
    ).toBe(1);
    expect((await Channel.findById(channel._id).lean())?.revision).toBe(1);
    await ChannelAccessGrant.updateOne(
      { _id: grant._id },
      { $set: { revokedAt: new Date() } },
      { runValidators: true },
    );
    expect(await currentGrant(2)).toBeNull();
  });

  it('rolls back channel and grant writes together on the shared transaction', async () => {
    const channelId = new Types.ObjectId();
    await expect(
      database.transaction(async (session) => {
        const channel = await new Channel({ ...channelInput(), _id: channelId }).save({ session });
        await new ChannelAccessGrant(grantInput(channel)).save({ session });
        throw new Error('Injected rollback');
      }),
    ).rejects.toThrow('Injected rollback');
    expect(await Channel.exists({ _id: channelId })).toBeNull();
    expect(await ChannelAccessGrant.exists({ channelId })).toBeNull();
  });

  it('rejects malformed raw writes and counters even without Mongoose validation', async () => {
    const channel = await Channel.create(channelInput());
    const channels = database.connection.db!.collection('channels');
    for (const field of [
      { revision: -1 },
      { revision: 1.5 },
      { order: '1' },
      { revision: Infinity },
      { revision: NaN },
      { revision: mongo.Decimal128.fromString('2') },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { name: '🌱'.repeat(81) },
      { name: '  ' },
      { name: 'Tên\n' },
      { type: 'VOICE' },
      { accessMode: 'RESTRICTED' },
      { allowedUserIds: [] },
    ]) {
      await expect(channels.updateOne({ _id: channel._id }, { $set: field })).rejects.toMatchObject(
        { code: 121 },
      );
    }
    await expect(
      channels.updateOne({ _id: channel._id }, { $unset: { deletedAt: '' } }),
    ).rejects.toMatchObject({ code: 121 });
    await channels.updateOne({ _id: channel._id }, { $set: { revision: 2_147_483_647 } });
    await channels.updateOne({ _id: channel._id }, { $inc: { revision: 1 } });
    expect((await channels.findOne({ _id: channel._id }))?.revision).toBe(2_147_483_648);
    await channels.updateOne(
      { _id: channel._id },
      { $set: { revision: new mongo.Long(2_147_483_649) } },
    );
    expect((await channels.findOne({ _id: channel._id }))?.revision).toBe(2_147_483_649);
    await channels.updateOne({ _id: channel._id }, { $set: { revision: Number.MAX_SAFE_INTEGER } });
    await expect(
      channels.updateOne({ _id: channel._id }, { $inc: { revision: 1 } }),
    ).rejects.toMatchObject({ code: 121 });
    expect((await channels.findOne({ _id: channel._id }))?.revision).toBe(Number.MAX_SAFE_INTEGER);

    const grant = await ChannelAccessGrant.create(grantInput(channel));
    const grants = database.connection.db!.collection('channelAccessGrants');
    for (const field of [
      { membershipIncarnation: 0 },
      { membershipIncarnation: 1.5 },
      { membershipIncarnation: '2' },
      { membershipIncarnation: mongo.Decimal128.fromString('2') },
      { grantedAt: null },
      { revokedAt: 'invalid' },
    ]) {
      await expect(grants.updateOne({ _id: grant._id }, { $set: field })).rejects.toMatchObject({
        code: 121,
      });
    }
    await expect(
      grants.updateOne({ _id: grant._id }, { $unset: { revokedAt: '' } }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
