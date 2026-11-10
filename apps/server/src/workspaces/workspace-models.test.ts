import { randomBytes, createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { workspaceIndexRequirements, workspaceModels } from './workspace-models.js';

const instance = new mongoose.Mongoose({
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
});
const connection = instance.createConnection();
const { Workspace, Membership, Invitation } = workspaceModels(connection);
afterAll(() => connection.close());

function membershipInput() {
  return {
    workspaceId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    role: 'MEMBER',
    joinedAt: new Date(),
  };
}
function invitationInput() {
  return {
    workspaceId: new Types.ObjectId(),
    createdByUserId: new Types.ObjectId(),
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    encryptedToken: {
      algorithm: 'AES-256-GCM',
      keyId: 'test-key',
      iv: randomBytes(12).toString('base64url'),
      ciphertext: randomBytes(32).toString('base64url'),
      authTag: randomBytes(16).toString('base64url'),
    },
  };
}

describe('SCRUM-30 workspace models', () => {
  it('reuses models on the supplied connection without auto provisioning or owner uniqueness', () => {
    expect(workspaceModels(connection)).toEqual({ Workspace, Membership, Invitation });
    for (const model of [Workspace, Membership, Invitation]) expect(model.db).toBe(connection);
    expect(connection.base.get('autoCreate')).toBe(false);
    expect(connection.base.get('autoIndex')).toBe(false);
    expect(Workspace.schema.indexes()).toEqual([]);
    expect(workspaceIndexRequirements).toHaveLength(5);
    expect(
      workspaceIndexRequirements.every((index) => index.expireAfterSeconds === undefined),
    ).toBe(true);
  });

  it.each([2, 80])('trims workspace names and counts %i Unicode code points', async (length) => {
    const workspace = new Workspace({
      name: ` \u00a0${'🌱'.repeat(length)}\ufeff `,
      ownerId: new Types.ObjectId(),
    });
    await expect(workspace.validate()).resolves.toBeUndefined();
    expect(workspace.name).toBe('🌱'.repeat(length));
    expect(workspace).toMatchObject({ revision: 0, deletedAt: null });
  });

  it.each([
    { name: '🌱' },
    { name: '🌱'.repeat(81) },
    { name: ' \n ' },
    { name: 123 },
    { ownerId: 'invalid' },
    { revision: -1 },
    { revision: 0.5 },
    { revision: '1' },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { deletedAt: 'invalid' },
  ])('rejects invalid workspace fields %j', async (fields) => {
    await expect(
      new Workspace({ name: 'Lớp học', ownerId: new Types.ObjectId(), ...fields }).validate(),
    ).rejects.toThrow();
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER'])(
    'accepts explicit %s role and current incarnation',
    async (role) => {
      const membership = new Membership({ ...membershipInput(), role });
      await expect(membership.validate()).resolves.toBeUndefined();
      expect(membership).toMatchObject({
        status: 'ACTIVE',
        incarnation: 1,
        revision: 0,
        removedAt: null,
      });
    },
  );

  it.each([
    { role: 'HOST' },
    { role: undefined },
    { status: 'PENDING' },
    { incarnation: 0 },
    { incarnation: 1.5 },
    { incarnation: '1' },
    { revision: NaN },
    { revision: Infinity },
    { joinedAt: undefined },
    { status: 'ACTIVE', removedAt: new Date() },
    { status: 'REMOVED' },
    { role: 'OWNER', status: 'REMOVED', removedAt: new Date() },
  ])('rejects invalid membership fields %j', async (fields) => {
    await expect(new Membership({ ...membershipInput(), ...fields }).validate()).rejects.toThrow();
  });

  it('accepts removed membership tombstones', async () => {
    await expect(
      new Membership({ ...membershipInput(), status: 'REMOVED', removedAt: new Date() }).validate(),
    ).resolves.toBeUndefined();
  });

  it('requires an encrypted token and redacts both secrets even after explicit selection', async () => {
    const input = invitationInput();
    const invitation = new Invitation(input);
    await expect(invitation.validate()).resolves.toBeUndefined();
    expect(invitation).toMatchObject({ enabled: true, revision: 0 });
    expect(Invitation.schema.path('tokenHash').options.select).toBe(false);
    expect(Invitation.schema.path('encryptedToken').options.select).toBe(false);
    for (const output of [
      invitation.toJSON(),
      invitation.toObject(),
      JSON.parse(JSON.stringify(invitation)),
    ]) {
      expect(output).not.toHaveProperty('tokenHash');
      expect(output).not.toHaveProperty('encryptedToken');
    }
  });

  it.each([
    { tokenHash: undefined },
    { tokenHash: 'plaintext' },
    { tokenHash: 'a'.repeat(64) + '\n' },
    { encryptedToken: undefined },
    { enabled: 'true' },
    { revision: -1 },
  ])('rejects invalid invitation fields %j', async (fields) => {
    await expect(new Invitation({ ...invitationInput(), ...fields }).validate()).rejects.toThrow();
  });

  it.each([
    { algorithm: 'AES-256-CBC' },
    { keyId: '' },
    { keyId: 'key\n' },
    { iv: 'short' },
    { ciphertext: undefined },
    { ciphertext: 'a'.repeat(43) },
    { authTag: 'short' },
  ])('rejects malformed encrypted token fields %j', async (fields) => {
    const input = invitationInput();
    await expect(
      new Invitation({
        ...input,
        encryptedToken: { ...input.encryptedToken, ...fields },
      }).validate(),
    ).rejects.toThrow();
  });

  it('rejects legacy expiry/use limits, plaintext tokens and unknown membership fields', () => {
    for (const field of [
      { token: 'plaintext' },
      { expiresAt: new Date() },
      { maxUses: 5 },
      { uses: 0 },
    ]) {
      expect(() => new Invitation({ ...invitationInput(), ...field })).toThrow(/not in schema/);
    }
    expect(() => new Membership({ ...membershipInput(), allowedChannelIds: [] })).toThrow(
      /not in schema/,
    );
  });
});
