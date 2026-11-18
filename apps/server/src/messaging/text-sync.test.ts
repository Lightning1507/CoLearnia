import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTextSyncRegistry } from './text-sync.js';
import { loadConfig } from '../config/env.js';

afterEach(() => vi.useRealTimers());
const actor = {
  userId: '100000000000000000000001',
  authSessionId: '100000000000000000000002',
  expiresAt: '2099-01-01T00:00:00Z',
};
const scope = {
  channelId: '100000000000000000000003',
  conversationId: '100000000000000000000004',
  rootMessageId: null,
};
const access = {
  workspaceId: '100000000000000000000005',
  channelId: scope.channelId,
  channelType: 'TEXT' as const,
  membershipId: '100000000000000000000006',
  membershipIncarnation: 1,
  membershipRevision: 0,
  channelRevision: 0,
  canReadContent: true,
  canManageChannel: false,
};
const limits = { subscriptions: 3, perUser: 2, leaseMs: 1000, revocationRecords: 2 };
const registry = () => createTextSyncRegistry('test-only-secret', limits);
const input = () => ({ actor, scope, access, owner: randomUUID(), emit: vi.fn(() => true) });

it('has no enabled sync defaults and rejects invalid/unbounded resource configuration', () => {
  expect(loadConfig({}).TEXT_SYNC_LIMITS_JSON).toBeUndefined();
  expect(
    loadConfig({ TEXT_SYNC_LIMITS_JSON: JSON.stringify(limits) }).TEXT_SYNC_LIMITS_JSON,
  ).toEqual(limits);
  expect(() =>
    loadConfig({ TEXT_SYNC_LIMITS_JSON: JSON.stringify({ ...limits, subscriptions: 0 }) }),
  ).toThrow();
  expect(() => loadConfig({ TEXT_SYNC_LIMITS_JSON: '{bad JSON' })).toThrow();
});

it('expires the auth session before the lease and reports access revoked', () => {
  vi.useFakeTimers();
  const sync = registry();
  const emit = vi.fn(() => true);
  sync.open(
    { ...input(), emit, actor: { ...actor, expiresAt: new Date(Date.now() + 50).toISOString() } },
    0,
  );
  vi.advanceTimersByTime(60);
  expect(sync.entries()).toHaveLength(0);
  expect(emit).toHaveBeenCalledWith(
    'conversation.invalidated',
    expect.objectContaining({ reason: 'ACCESS_REVOKED' }),
  );
});

it('binds signed checkpoints and page cursors to process, scope and lease', () => {
  const sync = registry();
  const first = sync.open(input(), 5);
  const next = sync.open(input(), 9, first.throughCheckpoint);
  expect(next.after).toBe(5);
  const cursor = sync.cursor(next, 7);
  expect(sync.position(next, cursor)).toBe(7);
  expect(() => sync.position(first, cursor)).toThrow('CONFLICT');
  sync.close(first);
  expect(() =>
    sync.open(
      { ...input(), scope: { ...scope, channelId: '200000000000000000000001' } },
      9,
      next.throughCheckpoint,
    ),
  ).toThrow('CONFLICT');
  expect(() => registry().open(input(), 10, next.throughCheckpoint)).toThrow('CONFLICT');
  expect(() => sync.position(next, cursor + 'bad')).toThrow('CONFLICT');
  sync.stop();
});

it('rejects another auth session without deleting the original lease and invalidates revision changes', () => {
  const sync = registry();
  const entry = sync.open(input(), 0);
  expect(() =>
    sync.find(entry.token, { ...actor, authSessionId: '200000000000000000000001' }, access),
  ).toThrow('CONFLICT');
  expect(sync.find(entry.token, actor, access)).toBe(entry);
  expect(() => sync.find(entry.token, actor, { ...access, membershipRevision: 1 })).toThrow(
    'CONFLICT',
  );
  expect(sync.entries()).toHaveLength(0);
});

it('expires token/resources and enforces subscription caps, disconnect and unsubscribe ownership', () => {
  vi.useFakeTimers();
  const sync = registry();
  const first = sync.open(input(), 0);
  sync.open(input(), 0);
  expect(() => sync.open(input(), 0)).toThrow('SERVER_BUSY');
  sync.unsubscribe(first.id, 'another-connection');
  expect(sync.entries()).toHaveLength(2);
  sync.closeOwner(first.owner);
  expect(sync.entries()).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  expect(sync.entries()).toHaveLength(0);
  expect(() => sync.find(first.token, actor, access)).toThrow('CONFLICT');
});

it('fences immediately and repeated cleanup never closes a newer resource or peer session', async () => {
  const sync = registry();
  const first = sync.open(input(), 0);
  const peer = sync.open(
    { ...input(), actor: { ...actor, authSessionId: '200000000000000000000001' } },
    0,
  );
  const target = {
    kind: 'AUTH_SESSION' as const,
    userId: actor.userId,
    authSessionId: actor.authSessionId,
  };
  const revocationId = randomUUID();
  const fence = sync.revocation.fence({ revocationId, target });
  expect(first.pending).toBe(true);
  expect(peer.pending).toBe(false);
  const cleanup = {
    revocationId,
    target,
    ...fence,
    deadlineMs: performance.now() + 1000,
    signal: new AbortController().signal,
  };
  expect(await sync.revocation.revoke(cleanup)).toMatchObject({ status: 'completed' });
  const replacement = sync.open(input(), 0); // Represents a separately reauthorized registration.
  expect(sync.revocation.fence({ revocationId, target })).toEqual(fence);
  expect(await sync.revocation.revoke(cleanup)).toMatchObject({ status: 'completed' });
  expect(sync.entries().map((entry) => entry.id)).toEqual([peer.id, replacement.id]);
  sync.stop();
});
