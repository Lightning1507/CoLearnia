import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AccessRevocation, AuthenticatedContext } from '@colearnia/contracts';
import { createOperationCoordinator } from '../lib/operation-coordinator.js';
import { createAccessRevocationCoordinator } from './access-revocation.js';
import type { MessagingRevocationPort } from '../messaging/ports.js';
import type { RevocationPersistence, RevocationAccess } from './access-revocation.js';

const userId = 'a'.repeat(24);
const workspaceId = 'b'.repeat(24);
const channelId = 'c'.repeat(24);
const membershipId = 'd'.repeat(24);
const sessionId = 'e'.repeat(24);
const auth: AuthenticatedContext = {
  userId,
  authSessionId: sessionId,
  expiresAt: '2099-01-01T00:00:00Z',
};
const access: RevocationAccess = {
  workspaceId,
  channelId,
  channelRevision: 7,
  membershipId,
  membershipIncarnation: 2,
  membershipRevision: 7,
};
function event(kind: AccessRevocation['kind'] = 'WORKSPACE_MEMBERSHIP'): AccessRevocation {
  const base = { operationId: randomUUID(), revision: 7 };
  switch (kind) {
    case 'AUTH_SESSION':
      return { ...base, kind, authSessionId: sessionId };
    case 'USER_AUTH_SESSIONS':
      return { ...base, kind, userId };
    case 'WORKSPACE_MEMBERSHIP':
      return { ...base, kind, workspaceId, userId, membershipId, membershipIncarnation: 2 };
    case 'PRIVATE_CHANNEL_ACCESS':
      return {
        ...base,
        kind,
        workspaceId,
        channelId,
        userId,
        membershipId,
        membershipIncarnation: 2,
      };
    case 'CHANNEL_DELETED':
      return { ...base, kind, workspaceId, channelId };
    case 'WORKSPACE_DELETED':
      return { ...base, kind, workspaceId };
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  limits: { maxOperations?: number; cleanupTimeoutMs?: number; maxAuthSessions?: number } = {},
) {
  const coordinator = createOperationCoordinator();
  const persistence: RevocationPersistence = {
    prepareHeld: vi.fn(async () => ({ authSessionIds: [] })),
    commitHeld: vi.fn(async () => 'committed' as const),
    reconcileHeld: vi.fn(async () => 'not_committed' as const),
  };
  const messaging = {
    fence: vi.fn((_input: Parameters<MessagingRevocationPort['fence']>[0]) => ({
      throughResourceGeneration: 42,
    })),
    revoke: vi.fn(async ({ revocationId }: { revocationId: string }) => ({
      status: 'completed' as const,
      revocationId,
    })),
  };
  const live = {
    revoke: vi.fn(async ({ operationId }: AccessRevocation) => ({
      operationId,
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: false,
    })),
  };
  const control = createAccessRevocationCoordinator({ coordinator, messaging, live, ...limits });
  const revoke = (command = event()) => control.revoke({ event: command, userId, persistence });
  const current = (actor = auth, snapshot = access) =>
    coordinator.run({ userId: actor.userId, workspaceId: snapshot.workspaceId }, (held) =>
      control.barrier.isCurrent(actor, snapshot, held),
    );
  return { coordinator, persistence, messaging, live, control, revoke, current };
}

describe('shared access revocation', () => {
  it.each([
    'AUTH_SESSION',
    'USER_AUTH_SESSIONS',
    'WORKSPACE_MEMBERSHIP',
    'PRIVATE_CHANNEL_ACCESS',
    'CHANNEL_DELETED',
    'WORKSPACE_DELETED',
  ] as const)('installs deny before adapters and dispatches exact %s scope', async (kind) => {
    const f = setup();
    const command = event(kind);
    if (kind === 'USER_AUTH_SESSIONS')
      vi.mocked(f.persistence.prepareHeld).mockResolvedValue({ authSessionIds: [sessionId] });
    f.live.revoke.mockImplementation(async (value) => {
      // Proves cleanup runs outside User/Workspace gates (no nested-entry error).
      expect(await f.current()).toBe(false);
      return {
        operationId: value.operationId,
        permissionRevoked: true,
        pendingInvalidated: true,
        cleanupPending: false,
      };
    });
    expect(await f.revoke(command)).toMatchObject({
      permissionRevoked: true,
      pendingInvalidated: true,
    });
    expect(f.live.revoke).toHaveBeenCalledWith(command);
    const expected =
      kind === 'AUTH_SESSION' || kind === 'USER_AUTH_SESSIONS'
        ? { kind: 'AUTH_SESSION', userId, authSessionId: sessionId }
        : kind === 'WORKSPACE_MEMBERSHIP' || kind === 'WORKSPACE_DELETED'
          ? { kind: 'WORKSPACE', workspaceId, userId: kind === 'WORKSPACE_DELETED' ? null : userId }
          : {
              kind: 'CHANNEL',
              workspaceId,
              channelId,
              userId: kind === 'CHANNEL_DELETED' ? null : userId,
            };
    expect(f.messaging.fence).toHaveBeenCalledWith({
      revocationId: command.operationId,
      target: expected,
    });
    expect(f.messaging.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ target: expected, throughResourceGeneration: 42 }),
    );
    expect(await f.current()).toBe(false);
    expect(
      await f.current(
        { ...auth, userId: '1'.repeat(24), authSessionId: '2'.repeat(24) },
        { ...access, workspaceId: '3'.repeat(24), membershipId: '4'.repeat(24) },
      ),
    ).toBe(true);
  });

  it('keeps deny during partial cleanup, resumes same fences and skips acknowledged legs', async () => {
    const f = setup();
    const command = event();
    f.live.revoke.mockResolvedValueOnce({
      operationId: command.operationId,
      permissionRevoked: false,
      pendingInvalidated: false,
      cleanupPending: true,
    });
    expect(await f.revoke(command)).toMatchObject({
      permissionRevoked: false,
      cleanupPending: true,
    });
    expect(await f.current()).toBe(false);
    expect(f.persistence.commitHeld).not.toHaveBeenCalled();
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.messaging.fence).toHaveBeenCalledTimes(1);
    expect(f.messaging.revoke).toHaveBeenCalledTimes(1);
    expect(f.persistence.prepareHeld).toHaveBeenCalledTimes(1);
  });

  it('keeps immutable logout-all cohort through retries and leaves newer login open', async () => {
    const f = setup();
    const command = event('USER_AUTH_SESSIONS');
    vi.mocked(f.persistence.prepareHeld).mockResolvedValue({
      authSessionIds: [sessionId, 'f'.repeat(24)],
    });
    f.live.revoke.mockRejectedValueOnce(new Error('unavailable'));
    await f.revoke(command);
    vi.mocked(f.persistence.prepareHeld).mockResolvedValue({ authSessionIds: ['1'.repeat(24)] });
    expect(await f.current({ ...auth, authSessionId: '1'.repeat(24) })).toBe(true);
    expect(f.control.revokedAuthSessions(command)).toEqual([sessionId, 'f'.repeat(24)]);
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.persistence.commitHeld).toHaveBeenCalledWith(expect.anything(), [
      sessionId,
      'f'.repeat(24),
    ]);
    expect(f.messaging.revoke).toHaveBeenCalledTimes(2);
    expect(f.messaging.fence.mock.calls.map(([value]) => value.target)).toEqual([
      { kind: 'AUTH_SESSION', userId, authSessionId: sessionId },
      { kind: 'AUTH_SESSION', userId, authSessionId: 'f'.repeat(24) },
    ]);
    const copy = f.control.revokedAuthSessions(command) as string[];
    copy.push('2'.repeat(24));
    expect(f.control.revokedAuthSessions(command)).toHaveLength(2);
    expect(() => f.control.revokedAuthSessions({ ...command, revision: 8 })).toThrow(
      'DEPENDENCY_UNAVAILABLE',
    );
  });

  it('does not turn unrelated channel/member/session rights off', async () => {
    const f = setup();
    await f.revoke(event('PRIVATE_CHANNEL_ACCESS'));
    expect(await f.current(auth, { ...access, channelId: '1'.repeat(24) })).toBe(true);
    expect(await f.current(auth, { ...access, membershipIncarnation: 3 })).toBe(true);
    expect(await f.current(auth, { ...access, channelRevision: 8 })).toBe(true);
    // Old snapshot remains denied even after later regrant.
    expect(await f.current()).toBe(false);
    const g = setup();
    await g.revoke(event('AUTH_SESSION'));
    expect(await g.current({ ...auth, authSessionId: '1'.repeat(24) })).toBe(true);
  });

  it('ignores unrelated revision increases while cleanup/DB is still pending', async () => {
    const f = setup();
    f.live.revoke.mockRejectedValue(new Error('offline'));
    await f.revoke(event('PRIVATE_CHANNEL_ACCESS'));
    expect(await f.current(auth, { ...access, channelRevision: 99 })).toBe(false);
    expect(await f.current(auth, { ...access, membershipIncarnation: 3 })).toBe(true);
  });

  it('reconciles thrown/unknown commits before retry and never restores access on DB failure', async () => {
    const f = setup();
    const command = event();
    vi.mocked(f.persistence.commitHeld).mockRejectedValueOnce(new Error('lost reply'));
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(await f.current()).toBe(false);
    vi.mocked(f.persistence.reconcileHeld).mockResolvedValueOnce('unknown');
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(f.persistence.commitHeld).toHaveBeenCalledTimes(1);
    vi.mocked(f.persistence.reconcileHeld).mockResolvedValueOnce('committed');
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.persistence.commitHeld).toHaveBeenCalledTimes(1);
    expect(f.messaging.revoke).toHaveBeenCalledTimes(1);
  });

  it('repeats CAS only after confirmed not-committed outcome', async () => {
    const f = setup();
    const command = event();
    vi.mocked(f.persistence.commitHeld).mockResolvedValueOnce('unknown');
    await f.revoke(command);
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.persistence.reconcileHeld).toHaveBeenCalledTimes(1);
    expect(f.persistence.commitHeld).toHaveBeenCalledTimes(2);
  });

  it('coalesces callers and rejects reused operation ID with changed payload', async () => {
    const f = setup();
    const command = event();
    const replies = await Promise.all([f.revoke(command), f.revoke(command)]);
    expect(replies[0]).toEqual(replies[1]);
    expect(f.persistence.commitHeld).toHaveBeenCalledTimes(1);
    await expect(f.revoke({ ...command, revision: 9 })).rejects.toThrow('CONFLICT');
    expect(await f.revoke(command)).toEqual(replies[0]);
    expect(f.live.revoke).toHaveBeenCalledTimes(1);
  });

  it('retains deny if fence throws, retries only the uncaptured watermark', async () => {
    const f = setup();
    const command = event();
    f.messaging.fence.mockImplementationOnce(() => {
      throw new Error('registry offline');
    });
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(await f.current()).toBe(false);
    expect(f.live.revoke).not.toHaveBeenCalled();
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.persistence.prepareHeld).toHaveBeenCalledTimes(1);
  });

  it('rejects wrong adapter acknowledgement and malformed cleanup result', async () => {
    const f = setup();
    const command = event();
    f.messaging.revoke.mockResolvedValueOnce({ status: 'completed', revocationId: randomUUID() });
    f.live.revoke.mockResolvedValueOnce({
      operationId: command.operationId,
      permissionRevoked: true,
      pendingInvalidated: false,
      cleanupPending: true,
    });
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(f.persistence.commitHeld).not.toHaveBeenCalled();
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
  });

  it('bounds timeout and retains a single in-flight adapter until it settles', async () => {
    const f = setup({ cleanupTimeoutMs: 15 });
    const command = event();
    const pending = deferred<{ status: 'completed'; revocationId: string }>();
    f.messaging.revoke.mockImplementationOnce(() => pending.promise);
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(await f.current()).toBe(false);
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: false });
    expect(f.messaging.revoke).toHaveBeenCalledTimes(1);
    expect(f.persistence.commitHeld).not.toHaveBeenCalled();
    pending.resolve({ status: 'completed', revocationId: command.operationId });
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
    expect(f.messaging.fence).toHaveBeenCalledTimes(1);
    expect(f.coordinator.stats().operations).toBe(0);
  });

  it('does not evict pending or completed deny records at capacity', async () => {
    const f = setup({ maxOperations: 1 });
    await f.revoke();
    await expect(f.revoke()).rejects.toThrow('SERVER_BUSY');
    expect(await f.current()).toBe(false);
    expect(f.control.metrics()).toEqual({ operations: 1, pending: 0, adapterTasks: 0 });
  });

  it('fails preparation before installing deny and permits corrected retry', async () => {
    const f = setup();
    const command = event();
    vi.mocked(f.persistence.prepareHeld).mockRejectedValueOnce(
      new Error('actor forbidden/CAS stale'),
    );
    await expect(f.revoke(command)).rejects.toThrow('actor forbidden/CAS stale');
    expect(await f.current()).toBe(true);
    expect(f.messaging.fence).not.toHaveBeenCalled();
    expect(f.control.metrics()).toEqual({ operations: 0, pending: 0, adapterTasks: 0 });
    expect(await f.revoke(command)).toMatchObject({ permissionRevoked: true });
  });

  it('bounds logout-all cohort and refuses wrong affected User gate', async () => {
    const f = setup({ maxAuthSessions: 1 });
    const command = event('USER_AUTH_SESSIONS');
    vi.mocked(f.persistence.prepareHeld).mockResolvedValue({
      authSessionIds: [sessionId, 'f'.repeat(24)],
    });
    await expect(f.revoke(command)).rejects.toThrow('SERVER_BUSY');
    expect(f.messaging.fence).not.toHaveBeenCalled();
    await expect(
      f.control.revoke({ event: command, userId: '1'.repeat(24), persistence: f.persistence }),
    ).rejects.toThrow('Affected User');
  });

  it('enforces live gate lifetime for synchronous freshness checks', async () => {
    const f = setup();
    const held = await f.coordinator.run({ userId, workspaceId }, (value) => value);
    expect(() => f.control.barrier.isCurrent(auth, access, held)).toThrow();
  });
});

describe('revocation resource boundaries', () => {
  it('retains captured resource generation on retry without closing new resources', async () => {
    const coordinator = createOperationCoordinator();
    const generations = new Set([1, 2]);
    let watermark = 2;
    let failOnce = true;
    const control = createAccessRevocationCoordinator({
      coordinator,
      messaging: {
        fence: vi.fn(() => ({ throughResourceGeneration: watermark })),
        revoke: async ({ revocationId, throughResourceGeneration }) => {
          if (failOnce) {
            failOnce = false;
            return { status: 'blocked', revocationId, retryRequired: true };
          }
          for (const generation of generations)
            if (generation <= throughResourceGeneration) generations.delete(generation);
          return { status: 'completed', revocationId };
        },
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
    const input = {
      event: event('PRIVATE_CHANNEL_ACCESS'),
      userId,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld: async () => 'committed' as const,
        reconcileHeld: async () => 'unknown' as const,
      },
    };
    expect((await control.revoke(input)).permissionRevoked).toBe(false);
    watermark = 3;
    generations.add(3); // Later incarnation/resource registration must survive old retry.
    expect((await control.revoke(input)).permissionRevoked).toBe(true);
    expect([...generations]).toEqual([3]);
  });

  it('limits concurrent orchestration before installing an additional deny', async () => {
    const coordinator = createOperationCoordinator();
    const preparation = deferred<{ authSessionIds: readonly string[] }>();
    const control = createAccessRevocationCoordinator({
      coordinator,
      maxConcurrentOperations: 1,
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
    const persistence = {
      prepareHeld: () => preparation.promise,
      commitHeld: async () => 'committed' as const,
      reconcileHeld: async () => 'unknown' as const,
    };
    const first = control.revoke({ event: event(), userId, persistence });
    await expect(control.revoke({ event: event(), userId, persistence })).rejects.toThrow(
      'SERVER_BUSY',
    );
    preparation.resolve({ authSessionIds: [] });
    expect((await first).permissionRevoked).toBe(true);
    expect((await control.revoke({ event: event(), userId, persistence })).permissionRevoked).toBe(
      true,
    );
    expect(coordinator.stats().operations).toBe(0);
  });
});

it('bounds outstanding adapters across timeout retries and different operations', async () => {
  const coordinator = createOperationCoordinator();
  const delayed = deferred<{ status: 'completed'; revocationId: string }>();
  const messaging = {
    fence: () => ({ throughResourceGeneration: 1 }),
    revoke: vi.fn(() => delayed.promise),
  };
  const live = {
    revoke: vi.fn(async ({ operationId }: AccessRevocation) => ({
      operationId,
      permissionRevoked: true,
      pendingInvalidated: true,
      cleanupPending: false,
    })),
  };
  const control = createAccessRevocationCoordinator({
    coordinator,
    messaging,
    live,
    maxInFlightAdapterTasks: 1,
    cleanupTimeoutMs: 10,
  });
  const persistence = {
    prepareHeld: async () => ({ authSessionIds: [] }),
    commitHeld: async () => 'committed' as const,
    reconcileHeld: async () => 'unknown' as const,
  };
  const command = event();
  const first = { event: command, userId, persistence };
  expect((await control.revoke(first)).permissionRevoked).toBe(false);
  expect(control.metrics().adapterTasks).toBe(1);
  expect((await control.revoke({ event: event(), userId, persistence })).permissionRevoked).toBe(
    false,
  );
  expect(messaging.revoke).toHaveBeenCalledOnce();
  expect(live.revoke).not.toHaveBeenCalled();
  delayed.resolve({ status: 'completed', revocationId: command.operationId });
  await control.revoke(first);
  expect((await control.revoke(first)).permissionRevoked).toBe(true);
  expect(control.metrics().adapterTasks).toBe(0);
  expect(messaging.revoke).toHaveBeenCalledOnce();
});

describe('revocation barrier input boundaries', () => {
  it.each([
    'AUTH_SESSION',
    'USER_AUTH_SESSIONS',
    'WORKSPACE_MEMBERSHIP',
    'PRIVATE_CHANNEL_ACCESS',
    'CHANNEL_DELETED',
    'WORKSPACE_DELETED',
  ] as const)('normalizes ObjectIds for %s while pending and after commit', async (kind) => {
    const f = setup();
    const command = event(kind);
    if (kind === 'USER_AUTH_SESSIONS')
      vi.mocked(f.persistence.prepareHeld).mockResolvedValue({ authSessionIds: [sessionId] });
    f.live.revoke.mockResolvedValueOnce({
      operationId: command.operationId,
      permissionRevoked: false,
      pendingInvalidated: false,
      cleanupPending: true,
    });
    const upperAuth = {
      ...auth,
      userId: userId.toUpperCase(),
      authSessionId: sessionId.toUpperCase(),
    };
    const variants = [
      { ...access, workspaceId: workspaceId.toUpperCase() },
      { ...access, membershipId: membershipId.toUpperCase() },
      { ...access, channelId: channelId.toUpperCase() },
      {
        ...access,
        workspaceId: workspaceId.toUpperCase(),
        membershipId: membershipId.toUpperCase(),
        channelId: channelId.toUpperCase(),
      },
    ];
    expect((await f.revoke(command)).permissionRevoked).toBe(false);
    for (const snapshot of variants) expect(await f.current(upperAuth, snapshot)).toBe(false);
    expect((await f.revoke(command)).permissionRevoked).toBe(true);
    for (const snapshot of variants) expect(await f.current(upperAuth, snapshot)).toBe(false);
    expect(await f.current(upperAuth, { ...access, workspaceId: '1'.repeat(24) })).toBe(
      kind !== 'AUTH_SESSION' && kind !== 'USER_AUTH_SESSIONS',
    );
  });

  const malformed: [string, Record<string, unknown>][] = [
    ['missing channel revision', { channelRevision: undefined }],
    ['revision without channel ID', { channelId: undefined }],
    ['NaN channel revision', { channelRevision: NaN }],
    ['infinite channel revision', { channelRevision: Infinity }],
    ['negative channel revision', { channelRevision: -1 }],
    ['fractional channel revision', { channelRevision: 0.5 }],
    ['oversized channel revision', { channelRevision: Number.MAX_SAFE_INTEGER + 1 }],
    ['null channel revision', { channelRevision: null }],
    ['string channel revision', { channelRevision: '7' }],
    ['invalid channel ID', { channelId: 'invalid' }],
    ['invalid membership ID', { membershipId: 'invalid' }],
    ['invalid membership revision', { membershipRevision: NaN }],
    ['invalid incarnation', { membershipIncarnation: 0 }],
  ];
  it.each(malformed)(
    'fails closed for %s even without an installed revocation',
    async (_name, patch) => {
      const f = setup();
      const invalid = { ...access, ...patch } as unknown as RevocationAccess;
      expect(await f.current(auth, invalid)).toBe(false);
      for (const kind of ['CHANNEL_DELETED', 'PRIVATE_CHANNEL_ACCESS'] as const) {
        expect((await f.revoke(event(kind))).permissionRevoked).toBe(true);
        expect(await f.current(auth, invalid)).toBe(false);
      }
    },
  );

  it('preserves valid Workspace-only checks and requires a valid principal', async () => {
    const f = setup();
    const workspace = {
      workspaceId,
      membershipId,
      membershipRevision: 7,
      membershipIncarnation: 2,
    };
    expect(await f.current(auth, workspace)).toBe(true);
    expect(await f.current({ ...auth, authSessionId: 'invalid' }, workspace)).toBe(false);
    await f.revoke(event('PRIVATE_CHANNEL_ACCESS'));
    expect(await f.current(auth, workspace)).toBe(true);
    await f.revoke(event('WORKSPACE_MEMBERSHIP'));
    expect(await f.current(auth, workspace)).toBe(false);
  });
});

describe('application barrier before runtime cleanup is mounted', () => {
  it('installs deny without adapters and resumes the same operation after real ports are bound', async () => {
    const f = setup();
    const control = createAccessRevocationCoordinator({ coordinator: f.coordinator });
    const command = event('USER_AUTH_SESSIONS');
    vi.mocked(f.persistence.prepareHeld).mockResolvedValue({ authSessionIds: [sessionId] });
    const isCurrent = () =>
      f.coordinator.run({ userId }, (held) => control.barrier.isCurrent(auth, undefined, held));
    expect(await isCurrent()).toBe(true);
    const pending = await control.revoke({ event: command, userId, persistence: f.persistence });
    expect(pending).toEqual({
      operationId: command.operationId,
      permissionRevoked: false,
      pendingInvalidated: false,
      cleanupPending: true,
    });
    expect(await isCurrent()).toBe(false);
    expect(f.persistence.commitHeld).not.toHaveBeenCalled();
    expect(control.revokedAuthSessions(command)).toEqual([sessionId]);
    expect(control.metrics()).toMatchObject({ operations: 1, pending: 1, adapterTasks: 0 });
    control.bindCleanupAdapters({ messaging: f.messaging, live: f.live });
    const done = await control.revoke({ event: command, userId, persistence: f.persistence });
    expect(done.permissionRevoked).toBe(true);
    expect(f.persistence.prepareHeld).toHaveBeenCalledTimes(1);
    expect(f.persistence.commitHeld).toHaveBeenCalledTimes(1);
    expect(f.messaging.fence).toHaveBeenCalledTimes(1);
    expect(f.live.revoke).toHaveBeenCalledTimes(1);
    expect(await isCurrent()).toBe(false);
  });

  it('does not install deny for a rejected business preparation when adapters are absent', async () => {
    const f = setup();
    const control = createAccessRevocationCoordinator({ coordinator: f.coordinator });
    const error = new Error('not authorized');
    vi.mocked(f.persistence.prepareHeld).mockRejectedValue(error);
    await expect(
      control.revoke({ event: event('AUTH_SESSION'), userId, persistence: f.persistence }),
    ).rejects.toBe(error);
    expect(control.metrics().operations).toBe(0);
    expect(
      await f.coordinator.run({ userId }, (held) =>
        control.barrier.isCurrent(auth, undefined, held),
      ),
    ).toBe(true);
  });

  it('rejects half-configured ports and replacing an already bound pair', () => {
    const f = setup();
    expect(() =>
      createAccessRevocationCoordinator({ coordinator: f.coordinator, messaging: f.messaging }),
    ).toThrow('supplied together');
    expect(() => f.control.bindCleanupAdapters({ messaging: f.messaging, live: f.live })).toThrow(
      'already bound',
    );
  });
});

it('keeps committed session denies until expiry without consuming active revocation capacity', async () => {
  const f = setup({ maxOperations: 1 });
  const command = event('AUTH_SESSION');
  const result = await f.control.revoke({
    event: command,
    userId,
    persistence: { ...f.persistence, authSessionExpiresAt: Date.now() + 60_000 },
  });
  expect(result.permissionRevoked).toBe(true);
  expect(f.control.isSessionDenied(auth)).toBe(true);
  expect((await f.revoke(event('WORKSPACE_MEMBERSHIP'))).permissionRevoked).toBe(true);
});
