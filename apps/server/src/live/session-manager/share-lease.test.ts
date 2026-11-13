import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SessionCleanupRequest } from '@colearnia/contracts';
import type {
  PolicyGroup,
  PolicyParticipant,
  SessionPolicyState,
} from '../policy/session-policy.js';
import { createShareLeaseRegistry, sharePickerLeaseMs } from './share-lease.js';
import type { HeldShareContext } from './share-lease.js';

const id = (n: number) => String(n).padStart(24, '0');

function fixture() {
  const nowMs = Date.parse('2026-11-09T08:00:00Z');
  const groupId = randomUUID();
  const roundId = randomUUID();
  const participants = new Map<string, PolicyParticipant>();
  for (let member = 1; member <= 4; member++) {
    const access = {
      workspaceId: id(90),
      channelId: id(91),
      channelType: 'LIVE' as const,
      membershipId: id(member + 10),
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    };
    participants.set(id(member), {
      participantId: id(member),
      displayName: `Member ${member}`,
      auth: {
        userId: id(member + 20),
        authSessionId: id(member + 30),
        expiresAt: new Date(nowMs + 3_600_000).toISOString(),
      },
      access,
      currentAccess: { ...access },
      callGeneration: 1,
      audienceEpoch: 0,
      connected: true,
      blocked: false,
      scope: member >= 3 ? { type: 'GROUP', groupId } : { type: 'MAIN' },
    });
  }
  const session: SessionPolicyState & { groups: Map<string, PolicyGroup> } = {
    sessionId: id(80),
    workspaceId: id(90),
    channelId: id(91),
    epoch: randomUUID(),
    state: 'ACTIVE',
    phase: 'ACTIVITY',
    policyRevision: 0,
    hostParticipantId: id(1),
    helpingGroupId: null,
    round: { roundId, deadline: new Date(nowMs + 120_000).toISOString() },
    participants,
    groups: new Map([
      [
        groupId,
        {
          groupId,
          name: 'Activity',
          mode: 'ACTIVITY',
          roundId,
          state: 'OPEN',
          rosterParticipantIds: [id(3), id(4)],
        },
      ],
    ]),
  };
  const member = (n = 1) => participants.get(id(n))!;
  const held = (
    n = 1,
    time = nowMs,
  ): HeldShareContext & { isCurrent: (request: SessionCleanupRequest) => boolean } => ({
    session,
    nowMs: time,
    access: member(n).currentAccess,
    request: {
      auth: member(n).auth,
      sessionId: session.sessionId,
      epoch: session.epoch,
      callGeneration: member(n).callGeneration,
    },
    assertHeld: vi.fn(),
    isCurrent: vi.fn(() => true),
  });
  const registry = createShareLeaseRegistry(session.sessionId, session.epoch);
  const acquire = (n = 1) => {
    const result = registry.acquireHeld(held(n));
    if (!result.ok) throw new Error(result.errorCode);
    const reserved = registry.reservePublishHeld(held(n), result.value, randomUUID());
    if (!reserved.ok) throw new Error(reserved.errorCode);
    return reserved.value;
  };
  const cleanup = (n = 1): Extract<SessionCleanupRequest, { callGeneration: number }> => ({
    operationId: randomUUID(),
    transitionToken: randomUUID(),
    sessionId: session.sessionId,
    epoch: session.epoch,
    callGeneration: member(n).callGeneration,
    target: { type: 'PARTICIPANT', participantId: id(n) },
    reason: 'ACCESS_REVOKED',
  });
  return { registry, held, member, session, nowMs, groupId, roundId, acquire, cleanup };
}

describe('share lease and media gate', () => {
  it('checks generation for publish, consume, cancel and release without changing the slot', () => {
    const f = fixture();
    const lease = f.acquire();
    const stale = { ...lease, leaseGeneration: lease.leaseGeneration + 1 };
    expect(f.registry.reservePublishHeld(f.held(), stale, randomUUID()).ok).toBe(false);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'CREATE', stale)).toBe(false);
    expect(f.registry.commitHeld(f.held(), stale).ok).toBe(false);
    expect(f.registry.cancelHeld(f.held(), stale)).toBe(false);
    expect(f.registry.commitHeld(f.held(), lease).ok).toBe(true);
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', stale)).toBe(false);
    expect(f.registry.beginReleaseHeld(f.held(), stale)).toBe(false);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'READY', lease)).toBe(true);
    expect(f.registry.beginReleaseHeld(f.held(), lease)).toBe(true);
    expect(f.registry.releaseHeld(f.held(), stale)).toBe(false);
    expect(f.registry.acquireHeld(f.held(2)).ok).toBe(false);
    expect(f.registry.releaseHeld(f.held(), lease)).toBe(true);
    const next = f.acquire(2);
    expect(next.leaseGeneration).toBeGreaterThan(lease.leaseGeneration);
  });

  it('binds one SCREEN publication before await and M3 single-flight reuses the same result', async () => {
    const f = fixture();
    const acquired = f.registry.acquireHeld(f.held());
    if (!acquired.ok) throw new Error(acquired.errorCode);
    const lease = acquired.value;
    const publicationId = randomUUID();
    const producer = { id: randomUUID() };
    const createProducer = vi.fn(async () => producer);
    const pending = new Map<string, Promise<typeof producer>>();
    const create = (requestId: string) => {
      const reservation = f.registry.reservePublishHeld(f.held(), lease, requestId);
      if (!reservation.ok) return Promise.reject(new Error(reservation.errorCode));
      const previous = pending.get(requestId);
      if (previous) return previous;
      const result = createProducer().then((value) => {
        expect(f.registry.commitHeld(f.held(), reservation.value).ok).toBe(true);
        return value;
      });
      pending.set(requestId, result);
      return result;
    };
    const first = create(publicationId);
    const retry = create(publicationId);
    await expect(create(randomUUID())).rejects.toThrow('CONFLICT');
    expect(retry).toBe(first);
    expect(await first).toBe(producer);
    expect(await create(publicationId)).toBe(producer);
    expect(createProducer).toHaveBeenCalledOnce();
    expect(
      f.registry.canPublishHeld(f.held(), 'SCREEN', 'CREATE', { ...lease, publicationId }),
    ).toBe(false);
    expect(f.registry.commitHeld(f.held(), { ...lease, publicationId: randomUUID() }).ok).toBe(
      false,
    );
  });

  it('serializes MAIN ownership, allows members, and keeps ACTIVITY independent', () => {
    const f = fixture();
    f.acquire(2);
    expect(f.registry.acquireHeld(f.held())).toEqual({ ok: false, errorCode: 'SHARE_BUSY' });
    const activity = f.acquire(3);
    expect(f.registry.commitHeld(f.held(3), activity).ok).toBe(true);
    expect(f.registry.acquireHeld(f.held(4))).toEqual({ ok: false, errorCode: 'SHARE_BUSY' });
  });

  it('does not allocate a share slot in DISCUSSION', () => {
    const f = fixture();
    f.session.phase = 'GUIDANCE';
    f.session.round = null;
    f.session.groups.set(f.groupId, {
      groupId: f.groupId,
      name: 'Discussion',
      mode: 'DISCUSSION',
      state: 'OPEN',
      rosterParticipantIds: [id(3), id(4)],
    });
    expect(f.registry.acquireHeld(f.held(3))).toEqual({ ok: false, errorCode: 'FORBIDDEN' });
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN_AUDIO', 'CREATE')).toBe(false);
  });

  it('expires precisely at 30 seconds and rejects late publish/release against a new slot', () => {
    const f = fixture();
    const old = f.acquire();
    expect(old.expiresAtMs).toBe(f.nowMs + sharePickerLeaseMs);
    expect(f.registry.acquireHeld(f.held(2, old.expiresAtMs - 1)).ok).toBe(false);
    const newer = f.registry.acquireHeld(f.held(2, old.expiresAtMs));
    expect(newer.ok).toBe(true);
    expect(f.registry.commitHeld(f.held(1, old.expiresAtMs), old).ok).toBe(false);
    expect(f.registry.cancelHeld(f.held(), old)).toBe(false);
    expect(f.registry.beginReleaseHeld(f.held(), old)).toBe(false);
    expect(f.registry.releaseHeld(f.held(), old)).toBe(false);
    expect(f.registry.acquireHeld(f.held()).ok).toBe(false);
  });

  it('cancels a pending picker idempotently and rejects a different owner', () => {
    const f = fixture();
    const lease = f.acquire();
    expect(f.registry.cancelHeld(f.held(2), lease)).toBe(false);
    expect(f.registry.cancelHeld(f.held(), lease)).toBe(true);
    expect(f.registry.cancelHeld(f.held(), lease)).toBe(false);
    expect(f.registry.acquireHeld(f.held(2)).ok).toBe(true);
  });

  it('requires commit before ready/audio and keeps published ownership beyond picker expiry', () => {
    const f = fixture();
    const lease = f.acquire();
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'CREATE', lease)).toBe(true);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'READY', lease)).toBe(false);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN_AUDIO', 'CREATE', lease)).toBe(false);
    expect(f.registry.commitHeld(f.held(), lease).ok).toBe(true);
    expect(f.registry.commitHeld(f.held(), lease).ok).toBe(true);
    const later = f.held(1, lease.expiresAtMs + 1);
    expect(f.registry.canPublishHeld(later, 'SCREEN', 'READY', lease)).toBe(true);
    expect(f.registry.canPublishHeld(later, 'SCREEN_AUDIO', 'CREATE', lease)).toBe(true);
    expect(f.registry.acquireHeld(f.held(2, later.nowMs)).ok).toBe(false);
    f.session.hostParticipantId = id(2);
    f.session.policyRevision++;
    expect(f.registry.canPublishHeld(later, 'SCREEN', 'READY', lease)).toBe(true);
  });

  it.each([
    'disconnect',
    'barrier',
    'auth',
    'generation',
    'audience',
    'membership',
    'revision',
    'scope',
    'ending',
  ] as const)('rechecks %s after asynchronous work', (change) => {
    const f = fixture();
    const lease = f.acquire(2);
    const p = f.member(2);
    switch (change) {
      case 'disconnect':
        p.connected = false;
        break;
      case 'barrier':
        p.blocked = true;
        break;
      case 'auth':
        p.auth = { ...p.auth, authSessionId: id(99) };
        break;
      case 'generation':
        p.callGeneration++;
        break;
      case 'audience':
        p.audienceEpoch++;
        break;
      case 'membership':
        p.access.membershipIncarnation++;
        p.currentAccess.membershipIncarnation++;
        break;
      case 'revision':
        p.currentAccess.channelRevision++;
        break;
      case 'scope':
        p.scope = { type: 'GROUP', groupId: f.groupId };
        break;
      case 'ending':
        f.session.state = 'ENDING';
        break;
    }
    expect(f.registry.commitHeld(f.held(2), lease).ok).toBe(false);
    expect(f.registry.canPublishHeld(f.held(2), 'SCREEN', 'READY', lease)).toBe(false);
  });

  it('checks ACTIVITY deadline and round identity even if group ID is reused', () => {
    const f = fixture();
    const lease = f.acquire(3);
    expect(f.registry.canPublishHeld(f.held(3, f.nowMs + 120_000), 'SCREEN', 'CREATE', lease)).toBe(
      false,
    );
    const roundId = randomUUID();
    f.session.round = { roundId, deadline: new Date(f.nowMs + 180_000).toISOString() };
    f.session.groups.set(f.groupId, {
      groupId: f.groupId,
      name: 'New round',
      mode: 'ACTIVITY',
      roundId,
      state: 'OPEN',
      rosterParticipantIds: [id(3), id(4)],
    });
    expect(f.registry.commitHeld(f.held(3), lease).ok).toBe(false);
  });

  it('revokes immediately, retains busy until media closure, and fences old callbacks', () => {
    const f = fixture();
    const lease = f.acquire();
    f.registry.commitHeld(f.held(), lease);
    expect(f.registry.revokeHeld(f.held(), f.cleanup())).toEqual([
      expect.objectContaining({ leaseId: lease.leaseId, leaseGeneration: lease.leaseGeneration }),
    ]);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN_AUDIO', 'READY', lease)).toBe(false);
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', lease)).toBe(false);
    expect(f.registry.acquireHeld(f.held(2)).ok).toBe(false);
    expect(f.registry.releaseHeld(f.held(), lease)).toBe(true);
    const next = f.acquire(2);
    expect(f.registry.releaseHeld(f.held(), lease)).toBe(false);
    expect(f.registry.beginReleaseHeld(f.held(), lease)).toBe(false);
    expect(f.registry.commitHeld(f.held(2), next).ok).toBe(true);
  });

  it('handles track-ended without restoring authority or releasing another scope', () => {
    const f = fixture();
    const main = f.acquire();
    const activity = f.acquire(3);
    f.registry.commitHeld(f.held(), main);
    f.registry.commitHeld(f.held(3), activity);
    expect(f.registry.releaseHeld(f.held(), main)).toBe(false);
    expect(f.registry.beginReleaseHeld(f.held(), main)).toBe(true);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'READY', main)).toBe(false);
    expect(f.registry.releaseHeld(f.held(), main)).toBe(true);
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN', 'READY', activity)).toBe(true);
  });

  it('matches cleanup generation/scope/audience and removes pending leases', () => {
    const f = fixture();
    const lease = f.acquire();
    const request = f.cleanup();
    expect(f.registry.revokeHeld(f.held(), { ...request, callGeneration: 2 })).toEqual([]);
    expect(
      f.registry.revokeHeld(f.held(), {
        ...request,
        target: {
          type: 'PARTICIPANT_SCOPE',
          participantId: id(1),
          scope: { type: 'MAIN' },
          audienceEpoch: 1,
        },
      }),
    ).toEqual([]);
    expect(f.registry.revokeHeld(f.held(), request)).toEqual([
      expect.objectContaining({ leaseId: lease.leaseId, leaseGeneration: lease.leaseGeneration }),
    ]);
    expect(f.registry.acquireHeld(f.held()).ok).toBe(true);
    expect(f.registry.revokeHeld(f.held(), { ...request, epoch: randomUUID() })).toEqual([]);
  });

  it('rechecks receive policy and original source lease at create and ready', () => {
    const f = fixture();
    const lease = f.acquire();
    f.registry.commitHeld(f.held(), lease);
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', lease)).toBe(true);
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN')).toBe(false);
    expect(
      f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', {
        leaseId: randomUUID(),
        leaseGeneration: 1,
      }),
    ).toBe(false);
    expect(f.registry.canReceiveHeld(f.held(3), id(1), 'SCREEN', lease)).toBe(false);
    f.member(2).blocked = true;
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', lease)).toBe(false);
    f.member(2).blocked = false;
    f.member(1).connected = false;
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'SCREEN', lease)).toBe(false);
  });

  it('preserves mic/camera policy without requiring a share slot', () => {
    const f = fixture();
    expect(f.registry.canPublishHeld(f.held(), 'MIC', 'CREATE')).toBe(true);
    expect(f.registry.canPublishHeld(f.held(), 'CAMERA', 'READY')).toBe(true);
    expect(f.registry.canReceiveHeld(f.held(2), id(1), 'MIC')).toBe(true);
    f.member(1).blocked = true;
    expect(f.registry.canPublishHeld(f.held(), 'CAMERA', 'READY')).toBe(false);
  });

  it('requires the live session gate and rejects another incarnation', () => {
    const f = fixture();
    const held = f.held();
    held.assertHeld = () => {
      throw new Error('Gate not held');
    };
    expect(() => f.registry.acquireHeld(held)).toThrow('Gate not held');
    const other = fixture();
    expect(() => f.registry.acquireHeld(other.held())).toThrow('another session incarnation');
    expect(() => f.registry.acquireHeld(f.held(1, NaN))).toThrow('Invalid share clock');
  });

  it('ignores cleanup from a retired transition even when participant identity is unchanged', () => {
    const f = fixture();
    const lease = f.acquire();
    f.registry.commitHeld(f.held(), lease);
    const held = f.held();
    held.isCurrent = () => false;
    expect(f.registry.revokeHeld(held, f.cleanup())).toEqual([]);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'READY', lease)).toBe(true);
  });

  it('blocks expired authentication and ending ACTIVITY at media ready', () => {
    const f = fixture();
    const lease = f.acquire(3);
    f.registry.commitHeld(f.held(3), lease);
    f.member(3).auth.expiresAt = new Date(f.nowMs).toISOString();
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN_AUDIO', 'READY', lease)).toBe(false);
    f.member(3).auth.expiresAt = new Date(f.nowMs + 60_000).toISOString();
    f.session.phase = 'ACTIVITY_ENDING';
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN', 'READY', lease)).toBe(false);
    expect(f.registry.canReceiveHeld(f.held(4), id(3), 'SCREEN', lease)).toBe(false);
  });

  it('allows DISCUSSION to receive a permitted MAIN screen without publishing its own', () => {
    const f = fixture();
    const lease = f.acquire();
    f.registry.commitHeld(f.held(), lease);
    f.session.phase = 'GUIDANCE';
    f.session.round = null;
    f.session.groups.set(f.groupId, {
      groupId: f.groupId,
      name: 'Discussion',
      mode: 'DISCUSSION',
      state: 'OPEN',
      rosterParticipantIds: [id(3), id(4)],
    });
    expect(f.registry.canReceiveHeld(f.held(3), id(1), 'SCREEN', lease)).toBe(true);
    expect(f.registry.canReceiveHeld(f.held(3), id(1), 'SCREEN_AUDIO', lease)).toBe(true);
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN', 'CREATE', lease)).toBe(false);
  });

  it('stops only the exact lease after its owner changes scope', () => {
    const f = fixture();
    const main = f.acquire();
    const activity = f.acquire(3);
    const closeMain = vi.fn(() => true);
    f.registry.bindPublicationHeld(f.held(), main, {
      close: closeMain,
      isStopped: () => false,
    });
    expect(f.registry.commitHeld(f.held(), main).ok).toBe(true);
    expect(f.registry.commitHeld(f.held(3), activity).ok).toBe(true);
    expect(f.registry.stopHeld(f.held(2), main)).toBe(false);

    f.session.helpingGroupId = f.groupId;
    f.member(1).scope = { type: 'GROUP', groupId: f.groupId };
    f.member(1).audienceEpoch++;
    expect(f.registry.stopHeld(f.held(), main)).toBe(true);
    expect(closeMain).toHaveBeenCalledOnce();
    expect(f.registry.canPublishHeld(f.held(3), 'SCREEN', 'READY', activity)).toBe(true);
    expect(f.registry.stopHeld(f.held(), main)).toBe(false);
  });

  it('closes a late created resource when the reserved lease has expired', async () => {
    const f = fixture();
    const lease = f.acquire();
    const close = vi.fn();
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'CREATE', lease)).toBe(true);
    const resource = await Promise.resolve({ close });
    const completed = f.held(1, lease.expiresAtMs);
    const next = f.registry.acquireHeld(f.held(2, lease.expiresAtMs));
    if (!f.registry.commitHeld(completed, lease).ok) resource.close();
    expect(close).toHaveBeenCalledOnce();
    expect(next.ok).toBe(true);
    expect(f.registry.acquireHeld(completed).ok).toBe(false);
  });

  it('keeps ownership after uninterrupted access revalidation but never bypasses a deny barrier', () => {
    const f = fixture();
    const lease = f.acquire(2);
    f.registry.commitHeld(f.held(2), lease);
    f.member(2).currentAccess.channelRevision++;
    expect(f.registry.canPublishHeld(f.held(2), 'SCREEN', 'READY', lease)).toBe(false);
    f.member(2).access = { ...f.member(2).currentAccess };
    expect(f.registry.canPublishHeld(f.held(2), 'SCREEN', 'READY', lease)).toBe(true);
    f.member(2).blocked = true;
    expect(f.registry.canPublishHeld(f.held(2), 'SCREEN', 'READY', lease)).toBe(false);
  });

  it('revokes only the requested scope and keeps it busy until both screen sources close', () => {
    const f = fixture();
    const main = f.acquire();
    const activity = f.acquire(3);
    f.registry.commitHeld(f.held(), main);
    f.registry.commitHeld(f.held(3), activity);
    const request: SessionCleanupRequest = {
      operationId: randomUUID(),
      transitionToken: randomUUID(),
      sessionId: f.session.sessionId,
      epoch: f.session.epoch,
      target: { type: 'SCOPE', scope: { type: 'GROUP', groupId: f.groupId } },
      reason: 'SCOPE_CLOSED',
    };
    expect(f.registry.revokeHeld(f.held(), request)).toEqual([
      expect.objectContaining({
        leaseId: activity.leaseId,
        leaseGeneration: activity.leaseGeneration,
      }),
    ]);
    expect(f.registry.canPublishHeld(f.held(), 'SCREEN', 'READY', main)).toBe(true);
    expect(f.registry.acquireHeld(f.held(4)).ok).toBe(false);
    expect(f.registry.releaseHeld(f.held(), activity)).toBe(true);
    const next = f.acquire(4);
    expect(f.registry.commitHeld(f.held(4), next).ok).toBe(true);
    expect(f.registry.canReceiveHeld(f.held(3), id(4), 'SCREEN', activity)).toBe(false);
    expect(f.registry.canReceiveHeld(f.held(3), id(4), 'SCREEN', next)).toBe(true);
  });
});
