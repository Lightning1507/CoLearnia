import { expect, expectTypeOf, it, vi } from 'vitest';
import { accessCleanupResultSchema, channelAccessSnapshotSchema } from '@colearnia/contracts';
import type { AuthenticatedContext, ChannelAccessSnapshot } from '@colearnia/contracts';
import type { ClientSession } from 'mongoose';
import type { CreateChannelConversation, ResolveChannelAccess } from './ports.js';

it('exposes server signatures compatible with M2 transaction and M4 identity consumers', () => {
  expectTypeOf<
    Parameters<ResolveChannelAccess>[0]['identity']
  >().toEqualTypeOf<AuthenticatedContext>();
  expectTypeOf<Awaited<ReturnType<ResolveChannelAccess>>>().toEqualTypeOf<ChannelAccessSnapshot>();
  expectTypeOf<
    Parameters<CreateChannelConversation>[0]['dbSession']
  >().toEqualTypeOf<ClientSession>();
  // SCRUM-14 PR #41, 46a218f: GeneralConversationFactory<ClientSession>.create input.
  expectTypeOf<Parameters<CreateChannelConversation>[0]>().toEqualTypeOf<{
    workspaceId: string;
    channelId: string;
    conversationId: string;
    createdAt: Date;
    dbSession: ClientSession;
  }>();
});

it('M1 caller example preserves IDs, time and transaction when a callback is retried', async () => {
  const create: CreateChannelConversation = vi.fn(async (input) => ({
    conversationId: input.conversationId,
  }));
  const prepared = {
    workspaceId: '000000000000000000000003',
    channelId: '000000000000000000000004',
    conversationId: '000000000000000000000006',
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
  };
  // Opaque fixture only; no Mongo transaction is started in this example.
  const dbSession = {} as ClientSession;
  const callback = () => create({ ...prepared, dbSession });
  expect(await callback()).toEqual({ conversationId: prepared.conversationId });
  await callback();
  expect(create).toHaveBeenCalledTimes(2);
  for (const [input] of vi.mocked(create).mock.calls) {
    expect(input).toEqual({ ...prepared, dbSession });
    expect(input.dbSession).toBe(dbSession);
    expect(input.createdAt).toBe(prepared.createdAt);
  }
});

// Executable consumer examples, not the real M1 resolver or M2/M4 adapters.
const target = {
  identity: {
    userId: '000000000000000000000001',
    authSessionId: '000000000000000000000002',
    expiresAt: '2026-11-08T00:00:00.000Z',
  },
  workspaceId: '000000000000000000000003',
  channelId: '000000000000000000000004',
};
const snapshot = {
  workspaceId: target.workspaceId,
  channelId: target.channelId,
  channelType: 'LIVE' as const,
  membershipId: '000000000000000000000005',
  membershipIncarnation: 1,
  membershipRevision: 2,
  channelRevision: 3,
  canReadContent: true,
  canManageChannel: false,
};

it.each([
  ['TEXT', true, true],
  ['TEXT', false, false],
  ['LIVE', true, false],
] as const)(
  'M2 TEXT consumer example: type=%s, read=%s',
  async (channelType, canReadContent, allowed) => {
    const resolve: ResolveChannelAccess = vi.fn().mockResolvedValue(
      channelAccessSnapshotSchema.parse({
        ...snapshot,
        channelType,
        canReadContent,
        canManageChannel: true,
      }),
    );
    const access = await resolve(target);
    const readText = vi.fn();
    if (access.canReadContent && access.channelType === 'TEXT') readText(access.channelId);
    expect(readText).toHaveBeenCalledTimes(allowed ? 1 : 0);
  },
);

it('M4 join example discards a prepared resource when recheck denies access', async () => {
  const resolve: ResolveChannelAccess = vi
    .fn()
    .mockResolvedValueOnce(channelAccessSnapshotSchema.parse(snapshot))
    .mockResolvedValueOnce(
      channelAccessSnapshotSchema.parse({
        ...snapshot,
        canReadContent: false,
        channelRevision: 4,
      }),
    );
  const create = vi.fn().mockResolvedValue({ close: vi.fn(), publish: vi.fn() });
  const before = await resolve(target);
  expect(before.canReadContent && before.channelType === 'LIVE').toBe(true);
  const prepared = await create();
  const current = await resolve(target);
  if (
    !current.canReadContent ||
    current.channelType !== 'LIVE' ||
    current.membershipIncarnation !== before.membershipIncarnation ||
    current.membershipRevision !== before.membershipRevision ||
    current.channelRevision !== before.channelRevision
  ) {
    prepared.close();
  } else {
    prepared.publish();
  }
  expect(prepared.close).toHaveBeenCalledOnce();
  expect(prepared.publish).not.toHaveBeenCalled();
});

it.each([
  [true, true, true, true],
  [false, true, false, false],
  [true, false, false, false],
] as const)(
  'cleanup acknowledgement example: revoked=%s, invalidated=%s',
  (permissionRevoked, pendingInvalidated, cleanupPending, effective) => {
    const result = accessCleanupResultSchema.parse({
      operationId: '1c3b90f0-0c26-4e98-9a60-000000000001',
      permissionRevoked,
      pendingInvalidated,
      cleanupPending,
    });
    expect(result.permissionRevoked && result.pendingInvalidated).toBe(effective);
  },
);
