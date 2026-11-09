import mongoose, { Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { channelIndexRequirements, channelModels } from './channel-models.js';

const instance = new mongoose.Mongoose({
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
});
const connection = instance.createConnection();
const { Channel, ChannelAccessGrant } = channelModels(connection);

function channelInput() {
  return {
    workspaceId: new Types.ObjectId(),
    name: 'Kênh học',
    type: 'TEXT',
    accessMode: 'PRIVATE',
  };
}

function grantInput() {
  return {
    workspaceId: new Types.ObjectId(),
    channelId: new Types.ObjectId(),
    membershipId: new Types.ObjectId(),
    membershipIncarnation: 1,
    grantedByUserId: new Types.ObjectId(),
    grantedAt: new Date(),
  };
}

afterAll(() => connection.close());

describe('channel and PRIVATE grant models', () => {
  it('reuses models on the injected connection and disables automatic provisioning', () => {
    expect(channelModels(connection).Channel).toBe(Channel);
    expect(channelModels(connection).ChannelAccessGrant).toBe(ChannelAccessGrant);
    expect(Channel.db).toBe(connection);
    expect(ChannelAccessGrant.db).toBe(connection);
    expect(connection.base.get('autoIndex')).toBe(false);
    expect(connection.base.get('autoCreate')).toBe(false);
    expect(channelIndexRequirements).toHaveLength(3);
    const unique = ChannelAccessGrant.schema
      .indexes()
      .find(([, options]) => options.name === 'uq_channel_membership_grant');
    expect(unique?.[0]).toEqual({ channelId: 1, membershipId: 1 });
    expect(unique?.[1]).toMatchObject({ unique: true });
    expect(unique?.[1]).not.toHaveProperty('partialFilterExpression');
    expect(Channel.schema.indexes().every(([, options]) => !options.unique)).toBe(true);
  });

  it.each(['TEXT', 'LIVE'])(
    'accepts %s with either access mode and code point name limits',
    async (type) => {
      for (const accessMode of ['WORKSPACE', 'PRIVATE']) {
        const channel = new Channel({
          ...channelInput(),
          type,
          accessMode,
          name: `  ${'🌱'.repeat(80)}  `,
        });
        await expect(channel.validate()).resolves.toBeUndefined();
        expect(channel.name).toBe('🌱'.repeat(80));
        expect(channel).toMatchObject({ order: 0, revision: 0, deletedAt: null });
      }
    },
  );

  it.each([
    { name: '' },
    { name: ' \n ' },
    { name: '🌱'.repeat(81) },
    { name: 123 },
    { type: 'VOICE' },
    { accessMode: 'RESTRICTED' },
    { workspaceId: 'invalid' },
    { order: -1 },
    { order: 0.5 },
    { order: '1' },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { revision: Infinity },
    { revision: NaN },
    { deletedAt: 'invalid-date' },
  ])('rejects malformed channel fields %j', async (fields) => {
    await expect(new Channel({ ...channelInput(), ...fields }).validate()).rejects.toThrow();
  });

  it('rejects client permission arrays and unknown grant fields', () => {
    expect(() => new Channel({ ...channelInput(), allowedUserIds: [] })).toThrow(/not in schema/);
    expect(() => new ChannelAccessGrant({ ...grantInput(), userId: new Types.ObjectId() })).toThrow(
      /not in schema/,
    );
  });

  it('requires authoritative incarnation and preserves grant tombstones', async () => {
    const input = grantInput();
    const grant = new ChannelAccessGrant(input);
    await expect(grant.validate()).resolves.toBeUndefined();
    expect(grant.revokedAt).toBeNull();
    await expect(
      new ChannelAccessGrant({ ...input, revokedAt: new Date() }).validate(),
    ).resolves.toBeUndefined();
    await expect(
      new ChannelAccessGrant({ ...input, membershipIncarnation: undefined }).validate(),
    ).rejects.toThrow();
    for (const membershipIncarnation of [
      0,
      -1,
      1.5,
      '1',
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await expect(
        new ChannelAccessGrant({ ...input, membershipIncarnation }).validate(),
      ).rejects.toThrow();
    }
  });

  it('requires all grant references and issuance metadata', async () => {
    for (const field of [
      'workspaceId',
      'channelId',
      'membershipId',
      'grantedByUserId',
      'grantedAt',
    ] as const) {
      await expect(
        new ChannelAccessGrant({ ...grantInput(), [field]: undefined }).validate(),
      ).rejects.toThrow();
    }
    await expect(
      new ChannelAccessGrant({ ...grantInput(), revokedAt: 'invalid-date' }).validate(),
    ).rejects.toThrow();
  });
});
