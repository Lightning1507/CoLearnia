import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import type { WorkspaceRole } from '@colearnia/contracts';
import { channelAccessSnapshotSchema } from '@colearnia/contracts';
import { authModels } from '../src/auth/models.js';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import { authIndexRequirements } from '../src/auth/models.js';
import { workspaceIndexRequirements } from '../src/workspaces/workspace-models.js';
import { channelIndexRequirements } from '../src/workspaces/channel-models.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import type { CoordinationContext } from '../src/lib/operation-coordinator.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { testReplicaUri } from './replica-uri.js';

const databaseName = `colearnia_test_scrum27_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(databaseName));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const coordinator = createOperationCoordinator();
let ready = true;
const revocations = createAccessRevocationCoordinator({
  coordinator,
  messaging: {
    fence: () => ({ throughResourceGeneration: 1 }),
    revoke: async ({ revocationId }) => ({ status: 'completed', revocationId }),
  },
  live: {
    revoke: async ({ operationId }) => ({
      operationId,
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: false,
    }),
  },
});
const service = createWorkspaceAccessService(
  database,
  coordinator,
  () => ready,
  revocations.barrier,
);
let ownsDatabase = false;
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(databaseName);
  expect((await database.connection.db!.admin().command({ hello: 1 })).setName).toBe('rs0');
  ownsDatabase = true;
  for (const model of [User, AuthSession, Workspace, Membership, Channel, ChannelAccessGrant]) {
    await model.createCollection();
    await model.createIndexes();
  }
  // Invitation is outside this provider; preflight only collections it queries.
  const required = [
    ...authIndexRequirements,
    ...workspaceIndexRequirements.filter((item) => item.collection === 'memberships'),
    ...channelIndexRequirements,
  ];
  expect(await preflightIndexes(database.connection, required)).toEqual({
    ready: true,
    issues: [],
  });
});
afterAll(async () => {
  try {
    if (
      ownsDatabase &&
      database.connection.name === databaseName &&
      databaseName.startsWith('colearnia_test_scrum27_')
    )
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});
async function fixture(
  role: WorkspaceRole = 'MEMBER',
  accessMode: 'WORKSPACE' | 'PRIVATE' = 'PRIVATE',
  type: 'TEXT' | 'LIVE' = 'TEXT',
) {
  const user = await User.create({
    emailNormalized: `${randomUUID()}@example.test`,
    displayName: 'Policy fixture',
    passwordHash: 'test-only-unusable-hash',
  });
  const expiresAt = new Date(Date.now() + 60_000);
  const session = await AuthSession.create({
    userId: user._id,
    expiresAt,
    tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
  });
  const workspace = await Workspace.create({
    name: 'Policy fixture',
    ownerId: role === 'OWNER' ? user._id : new Types.ObjectId(),
  });
  const membership = await Membership.create({
    workspaceId: workspace._id,
    userId: user._id,
    role,
    joinedAt: new Date(),
    incarnation: 2,
    revision: 7,
  });
  const channel = await Channel.create({
    workspaceId: workspace._id,
    name: 'Policy channel',
    type,
    accessMode,
    revision: 9,
  });
  const input = {
    identity: { userId: user.id, authSessionId: session.id, expiresAt: expiresAt.toISOString() },
    workspaceId: workspace.id,
    channelId: channel.id,
  };
  const grant = () =>
    ChannelAccessGrant.create({
      workspaceId: workspace._id,
      channelId: channel._id,
      membershipId: membership._id,
      membershipIncarnation: 2,
      grantedByUserId: workspace.ownerId,
      grantedAt: new Date(),
    });
  return { user, session, workspace, membership, channel, input, grant };
}
const deny = (code: string) => expect.objectContaining({ name: 'WorkspaceAccessError', code });
describe('SCRUM-27 real Mongo shared access provider', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
    '%s resolves TEXT/LIVE and separates PRIVATE management from content',
    async (role) => {
      for (const type of ['TEXT', 'LIVE'] as const) {
        for (const accessMode of ['WORKSPACE', 'PRIVATE'] as const) {
          const f = await fixture(role, accessMode, type);
          if (role === 'MEMBER' && accessMode === 'PRIVATE')
            await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
          else
            expect(await service.resolveChannelAccess(f.input)).toMatchObject({
              channelType: type,
              canReadContent: accessMode === 'WORKSPACE',
              canManageChannel: role !== 'MEMBER',
            });
          if (accessMode === 'PRIVATE') await f.grant();
          const snapshot = await service.resolveChannelAccess(f.input);
          expect(channelAccessSnapshotSchema.safeParse(snapshot).success).toBe(true);
          expect(snapshot).toMatchObject({
            membershipId: f.membership.id,
            membershipIncarnation: 2,
            membershipRevision: 7,
            channelRevision: 9,
            canReadContent: true,
          });
        }
      }
    },
  );
  it('rechecks revoke/rejoin, requires a new grant and reports fresh revisions', async () => {
    const f = await fixture();
    const grant = await f.grant();
    expect((await service.resolveChannelAccess(f.input)).canReadContent).toBe(true);
    await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { revokedAt: new Date() } });
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { revokedAt: null } });
    await Membership.updateOne(
      { _id: f.membership._id },
      { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
    );
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await Membership.updateOne(
      { _id: f.membership._id },
      { $set: { status: 'ACTIVE', removedAt: null }, $inc: { incarnation: 1, revision: 1 } },
    );
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { membershipIncarnation: 3 } });
    await Channel.updateOne({ _id: f.channel._id }, { $inc: { revision: 1 } });
    expect(await service.resolveChannelAccess(f.input)).toMatchObject({
      membershipIncarnation: 3,
      membershipRevision: 9,
      channelRevision: 10,
      canReadContent: true,
    });
  });
  it('hides deleted, foreign Workspace/channel/grant and outsider targets', async () => {
    const f = await fixture();
    const other = await fixture('MEMBER', 'WORKSPACE');
    await expect(
      service.resolveChannelAccess({ ...f.input, channelId: other.channel.id }),
    ).rejects.toEqual(deny('NOT_FOUND'));
    await expect(
      service.resolveChannelAccess({
        ...f.input,
        workspaceId: other.workspace.id,
        channelId: other.channel.id,
      }),
    ).rejects.toEqual(deny('NOT_FOUND'));
    const grant = await f.grant();
    // Raw write emulates corrupt scope data that a policy must never trust.
    await ChannelAccessGrant.collection.updateOne(
      { _id: grant._id },
      { $set: { workspaceId: other.workspace._id } },
    );
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await ChannelAccessGrant.collection.updateOne(
      { _id: grant._id },
      { $set: { workspaceId: f.workspace._id } },
    );
    await Channel.updateOne({ _id: f.channel._id }, { $set: { deletedAt: new Date() } });
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await Channel.updateOne({ _id: f.channel._id }, { $set: { deletedAt: null } });
    await Workspace.updateOne({ _id: f.workspace._id }, { $set: { deletedAt: new Date() } });
    await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
  });
  it('checks live DB roles and target membership, protecting OWNER/self', async () => {
    const f = await fixture('OWNER');
    const target = await Membership.create({
      workspaceId: f.workspace._id,
      userId: new Types.ObjectId(),
      role: 'ADMIN',
      joinedAt: new Date(),
    });
    const input = {
      ...f.input,
      action: 'changeRole' as const,
      targetUserId: target.userId.toHexString(),
    };
    expect((await service.requireWorkspacePermission(input)).targetMembership?.role).toBe('ADMIN');
    await expect(
      service.requireWorkspacePermission({ ...input, targetUserId: f.user.id }),
    ).rejects.toEqual(deny('FORBIDDEN'));
    await Membership.updateOne({ _id: f.membership._id }, { $set: { role: 'ADMIN' } });
    await expect(service.requireWorkspacePermission(input)).rejects.toEqual(deny('FORBIDDEN'));
    await expect(
      service.requireWorkspacePermission({ ...input, action: 'removeMember' }),
    ).rejects.toEqual(deny('FORBIDDEN'));
    await Membership.updateOne(
      { _id: target._id },
      { $set: { role: 'MEMBER' }, $inc: { revision: 1 } },
    );
    expect(
      (await service.requireWorkspacePermission({ ...input, action: 'removeMember' }))
        .targetMembership?.revision,
    ).toBe(1);
    await expect(
      service.requireWorkspacePermission({ ...input, action: 'delete' }),
    ).rejects.toEqual(deny('FORBIDDEN'));
    await expect(
      service.requireWorkspacePermission({
        ...input,
        targetUserId: new Types.ObjectId().toHexString(),
      }),
    ).rejects.toEqual(deny('NOT_FOUND'));
  });
  it('rejects revoked, expired, disabled and mismatched authenticated sessions', async () => {
    for (const failure of [
      'revoked',
      'expired',
      'disabled',
      'mismatch',
      'contextExpiry',
    ] as const) {
      const f = await fixture('MEMBER', 'WORKSPACE');
      if (failure === 'revoked')
        await AuthSession.updateOne({ _id: f.session._id }, { $set: { revokedAt: new Date() } });
      if (failure === 'expired')
        await AuthSession.updateOne({ _id: f.session._id }, { $set: { expiresAt: new Date(0) } });
      if (failure === 'disabled')
        await User.updateOne({ _id: f.user._id }, { $set: { status: 'DISABLED' } });
      if (failure === 'mismatch')
        f.input.identity.authSessionId = new Types.ObjectId().toHexString();
      if (failure === 'contextExpiry') f.input.identity.expiresAt = new Date(0).toISOString();
      await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('AUTH_REQUIRED'));
    }
  });
  it('reuses held context, rejects wrong/expired contexts and releases gates on error', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    let saved: CoordinationContext | undefined;
    await coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, async (context) => {
      saved = context;
      expect((await service.resolveChannelAccessHeld(f.input, context)).canReadContent).toBe(true);
      await expect(service.resolveChannelAccess(f.input)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
    });
    await expect(service.resolveChannelAccessHeld(f.input, saved!)).rejects.toMatchObject({
      code: 'INVALID_CONTEXT',
    });
    await coordinator.run({ workspaceId: f.workspace.id }, async (context) => {
      await expect(service.resolveChannelAccessHeld(f.input, context)).rejects.toMatchObject({
        code: 'INVALID_CONTEXT',
      });
    });
    await expect(
      service.resolveChannelAccess({ ...f.input, channelId: new Types.ObjectId().toHexString() }),
    ).rejects.toEqual(deny('NOT_FOUND'));
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });
  it('rejects context expiry after waiting/reading and normalizes ObjectId case', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    expect(
      (
        await service.resolveChannelAccess({
          ...f.input,
          workspaceId: f.workspace.id.toUpperCase(),
          channelId: f.channel.id.toUpperCase(),
          identity: {
            ...f.input.identity,
            userId: f.user.id.toUpperCase(),
            authSessionId: f.session.id.toUpperCase(),
          },
        })
      ).canReadContent,
    ).toBe(true);
    const original = database.transaction.bind(database);
    const now = Date.now();
    const transaction = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
      const value = await original(work);
      vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
      return value;
    });
    try {
      await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(deny('AUTH_REQUIRED'));
    } finally {
      transaction.mockRestore();
      vi.restoreAllMocks();
    }
    const future = {
      ...f.input,
      identity: { ...f.input.identity, expiresAt: new Date(Date.now() + 25).toISOString() },
    };
    await coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      await expect(service.resolveChannelAccessHeld(future, context)).rejects.toEqual(
        deny('AUTH_REQUIRED'),
      );
    });
  });
  it('waits for the shared Workspace gate then reads the updated rights', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutation = coordinator.run(
      { userId: f.user.id, workspaceId: f.workspace.id },
      async () => {
        entered();
        await hold;
        await Membership.updateOne(
          { _id: f.membership._id },
          { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
        );
      },
    );
    await started;
    const resolving = service.resolveChannelAccess(f.input);
    // Attach rejection before releasing the mutation gate.
    const assertion = expect(resolving).rejects.toEqual(deny('NOT_FOUND'));
    release();
    await mutation;
    await assertion;
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  });
  it('a consumer closes prepared resources if its real recheck throws after revocation', async () => {
    const f = await fixture();
    const grant = await f.grant();
    const prepared = { close: vi.fn() };
    expect((await service.resolveChannelAccess(f.input)).canReadContent).toBe(true);
    await coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, async () => {
      await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { revokedAt: new Date() } });
      await Channel.updateOne({ _id: f.channel._id }, { $inc: { revision: 1 } });
    });
    let transferred = false;
    const publish = vi.fn();
    async function finalize() {
      try {
        const current = await service.resolveChannelAccess(f.input);
        if (!current.canReadContent) throw new Error('Content denied');
        publish();
        transferred = true;
      } finally {
        if (!transferred) prepared.close();
      }
    }
    await expect(finalize()).rejects.toEqual(deny('NOT_FOUND'));
    expect(prepared.close).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
  it('fails closed for preflight and database failures without caching a grant', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    ready = false;
    try {
      await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(
        deny('DEPENDENCY_UNAVAILABLE'),
      );
    } finally {
      ready = true;
    }
    const transaction = vi
      .spyOn(database, 'transaction')
      .mockRejectedValueOnce(
        new (await import('mongoose')).mongo.MongoNetworkError('private driver detail'),
      );
    try {
      await expect(service.resolveChannelAccess(f.input)).rejects.toEqual(
        deny('DEPENDENCY_UNAVAILABLE'),
      );
    } finally {
      transaction.mockRestore();
    }
    expect((await service.resolveChannelAccess(f.input)).canReadContent).toBe(true);
  });
});

describe('SCRUM-28 deny barrier with real Mongo provider', () => {
  function controlledCleanup() {
    let unavailable = true;
    const control = createAccessRevocationCoordinator({
      coordinator,
      messaging: {
        fence: () => ({ throughResourceGeneration: 1 }),
        revoke: async ({ revocationId }) => ({ status: 'completed', revocationId }),
      },
      live: {
        revoke: async ({ operationId }) => ({
          operationId,
          permissionRevoked: !unavailable,
          pendingInvalidated: !unavailable,
          cleanupPending: unavailable,
        }),
      },
    });
    return {
      control,
      allowCleanup: () => {
        unavailable = false;
      },
      access: createWorkspaceAccessService(database, coordinator, () => ready, control.barrier),
    };
  }
  it('denies Workspace and channel while membership in Mongo remains ACTIVE', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    const runtime = controlledCleanup();
    expect((await runtime.access.resolveChannelAccess(f.input)).canReadContent).toBe(true);
    const pending = await runtime.control.revoke({
      event: {
        kind: 'WORKSPACE_MEMBERSHIP',
        operationId: randomUUID(),
        revision: 7,
        workspaceId: f.workspace.id,
        userId: f.user.id,
        membershipId: f.membership.id,
        membershipIncarnation: 2,
      },
      userId: f.user.id,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: async () => {
          throw new Error('must not write before cleanup');
        },
        reconcileHeld: async () => 'unknown',
      },
    });
    expect(pending.permissionRevoked).toBe(false);
    expect((await Membership.findById(f.membership.id))!.status).toBe('ACTIVE');
    await expect(runtime.access.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    await expect(
      runtime.access.requireWorkspacePermission({
        identity: f.input.identity,
        workspaceId: f.workspace.id,
        action: 'read',
      }),
    ).rejects.toEqual(deny('NOT_FOUND'));
  });
  it('keeps PRIVATE denial through cleanup, commits CAS, then permits a new grant revision', async () => {
    const f = await fixture();
    await f.grant();
    const runtime = controlledCleanup();
    const old = await runtime.access.resolveChannelAccess(f.input);
    const commit = vi.fn(async () => {
      await database.transaction(async (session) => {
        const update = await Channel.updateOne(
          { _id: f.channel.id, revision: 9 },
          { $inc: { revision: 1 } },
          { session },
        );
        if (update.modifiedCount !== 1) throw new Error('CONFLICT');
        await ChannelAccessGrant.updateOne(
          { channelId: f.channel.id, membershipId: f.membership.id, membershipIncarnation: 2 },
          { $set: { revokedAt: new Date() } },
          { session },
        );
      });
      return 'committed' as const;
    });
    const input = {
      event: {
        kind: 'PRIVATE_CHANNEL_ACCESS' as const,
        operationId: randomUUID(),
        revision: 9,
        workspaceId: f.workspace.id,
        channelId: f.channel.id,
        userId: f.user.id,
        membershipId: f.membership.id,
        membershipIncarnation: 2,
      },
      userId: f.user.id,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: commit,
        reconcileHeld: async () => 'unknown' as const,
      },
    };
    expect((await runtime.control.revoke(input)).permissionRevoked).toBe(false);
    expect((await ChannelAccessGrant.findOne({ channelId: f.channel.id }))!.revokedAt).toBeNull();
    await expect(runtime.access.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    runtime.allowCleanup();
    expect((await runtime.control.revoke(input)).permissionRevoked).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    await expect(runtime.access.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    // Business regrant follows the same gate and increments channel revision.
    await coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, async () => {
      await ChannelAccessGrant.updateOne(
        { channelId: f.channel.id },
        { $set: { revokedAt: null } },
      );
      await Channel.updateOne({ _id: f.channel.id }, { $inc: { revision: 1 } });
    });
    expect((await runtime.access.resolveChannelAccess(f.input)).canReadContent).toBe(true);
    await coordinator.run({ workspaceId: f.workspace.id }, (held) => {
      expect(runtime.control.barrier.isCurrent(f.input.identity, old, held)).toBe(false);
    });
  });
  it('denies auth before DB session is revoked and preserves a second session', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    const runtime = controlledCleanup();
    await runtime.control.revoke({
      event: {
        kind: 'AUTH_SESSION',
        operationId: randomUUID(),
        revision: 0,
        authSessionId: f.session.id,
      },
      userId: f.user.id,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: async () => 'committed',
        reconcileHeld: async () => 'unknown',
      },
    });
    expect((await AuthSession.findById(f.session.id))!.revokedAt).toBeNull();
    await expect(runtime.access.resolveChannelAccess(f.input)).rejects.toEqual(
      deny('AUTH_REQUIRED'),
    );
    const second = await AuthSession.create({
      userId: f.user._id,
      tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
      expiresAt: new Date(f.input.identity.expiresAt),
    });
    expect(
      (
        await runtime.access.resolveChannelAccess({
          ...f.input,
          identity: { ...f.input.identity, authSessionId: second.id },
        })
      ).canReadContent,
    ).toBe(true);
  });
  it('reads back an unknown DB commit without repeating the write or opening stale access', async () => {
    const f = await fixture('MEMBER', 'WORKSPACE');
    const runtime = controlledCleanup();
    runtime.allowCleanup();
    const commit = vi.fn(async () => {
      await Membership.updateOne(
        { _id: f.membership.id, revision: 7, incarnation: 2 },
        { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
      );
      return 'unknown' as const;
    });
    const input = {
      event: {
        kind: 'WORKSPACE_MEMBERSHIP' as const,
        operationId: randomUUID(),
        revision: 7,
        workspaceId: f.workspace.id,
        userId: f.user.id,
        membershipId: f.membership.id,
        membershipIncarnation: 2,
      },
      userId: f.user.id,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: commit,
        reconcileHeld: async () => {
          const row = await Membership.findById(f.membership.id);
          return row?.status === 'REMOVED' && row.revision === 8
            ? ('committed' as const)
            : ('unknown' as const);
        },
      },
    };
    expect((await runtime.control.revoke(input)).permissionRevoked).toBe(false);
    await expect(runtime.access.resolveChannelAccess(f.input)).rejects.toEqual(deny('NOT_FOUND'));
    expect((await runtime.control.revoke(input)).permissionRevoked).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
  });
});
