import { describe, expect, it } from 'vitest';
import {
  liveContextSchema,
  sessionCleanupResultSchema,
  sessionProjectionSchema,
} from '@colearnia/contracts';
import {
  beginSessionTransition,
  createSessionTransitionTiming,
} from '../session-manager/session-transition.js';
import { CleanupAdmission } from '../session-manager/cleanup-admission.js';
import type { MediaSource } from '@colearnia/contracts';
import {
  canDrawBoard,
  canFreezeBoard,
  canHelpGroup,
  canJoinGroup,
  canPublishMedia,
  canReadScope,
  canReceiveMedia,
  projectSessionFor,
  resolveSessionPolicyContext,
} from './session-policy.js';
import type {
  PolicyGroup,
  PolicyParticipant,
  SessionPolicyInput,
  SessionPolicyState,
} from './session-policy.js';

const nowMs = Date.parse('2026-11-07T10:00:00Z');
const id = (value: number) => String(value).padStart(24, '0');
const groupA = '10000000-0000-4000-8000-000000000001';
const groupB = '10000000-0000-4000-8000-000000000002';
const roundId = '10000000-0000-4000-8000-000000000003';
const main = { type: 'MAIN' } as const;
const scopeA = { type: 'GROUP', groupId: groupA } as const;
const scopeB = { type: 'GROUP', groupId: groupB } as const;
const sources: MediaSource[] = ['MIC', 'CAMERA', 'SCREEN', 'SCREEN_AUDIO'];

function fixture(mode: 'DISCUSSION' | 'ACTIVITY' = 'DISCUSSION') {
  const participants = new Map<string, PolicyParticipant>();
  for (let member = 1; member <= 5; member++) {
    const access: PolicyParticipant['access'] = {
      workspaceId: id(90),
      channelId: id(91),
      channelType: 'LIVE',
      membershipId: id(member + 30),
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
        userId: id(member + 10),
        authSessionId: id(member + 20),
        expiresAt: '2026-11-07T11:00:00Z',
      },
      access,
      currentAccess: { ...access },
      callGeneration: 1,
      audienceEpoch: 0,
      connected: true,
      blocked: false,
      scope: member === 3 ? scopeA : member === 4 ? scopeB : main,
    });
  }
  const groups = new Map<string, PolicyGroup>();
  for (const [groupId, roster] of [
    [groupA, [id(2), id(3)]],
    [groupB, [id(4)]],
  ] as const) {
    const common = {
      groupId,
      name: groupId === groupA ? 'Group A' : 'Group B',
      state: 'OPEN' as const,
      rosterParticipantIds: roster,
    };
    groups.set(groupId, mode === 'DISCUSSION' ? { ...common, mode } : { ...common, mode, roundId });
  }
  const session: SessionPolicyState = {
    sessionId: id(80),
    workspaceId: id(90),
    channelId: id(91),
    epoch: '10000000-0000-4000-8000-000000000004',
    state: 'ACTIVE',
    phase: mode === 'DISCUSSION' ? 'GUIDANCE' : 'ACTIVITY',
    policyRevision: 0,
    hostParticipantId: id(1),
    helpingGroupId: null,
    round: mode === 'DISCUSSION' ? null : { roundId, deadline: '2026-11-07T10:05:00Z' },
    participants,
    groups,
  };
  const participant = (member: number) => {
    const value = participants.get(id(member));
    if (!value) throw new Error('Missing fixture participant');
    return value;
  };
  const input = (member: number): SessionPolicyInput => {
    const value = participant(member);
    return {
      session,
      nowMs,
      access: { ...value.access },
      request: {
        auth: { ...value.auth },
        sessionId: session.sessionId,
        epoch: session.epoch,
        callGeneration: value.callGeneration,
      },
    };
  };
  return { session, participants, groups, participant, input };
}

describe('current session authority', () => {
  it('returns an existing LiveContext contract and derives the host from runtime authority', () => {
    const f = fixture();
    const result = resolveSessionPolicyContext(f.input(1));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected host context');
    expect(liveContextSchema.parse(result.context)).toEqual(result.context);
    expect(result.context.role).toBe('HOST');
    Object.assign(f.participant(2), { role: 'HOST' });
    const member = resolveSessionPolicyContext(f.input(2));
    expect(member.ok && member.context.role).toBe('MEMBER');
  });

  it('denies a channel administrator without content access', () => {
    const f = fixture();
    const input = f.input(2);
    input.access.canManageChannel = true;
    input.access.canReadContent = false;
    expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'FORBIDDEN' });
    expect(canReadScope(input, main)).toBe(false);
    expect(projectSessionFor(input)).toEqual({ ok: false, errorCode: 'FORBIDDEN' });
    expect(canPublishMedia(input, 'MIC')).toBe(false);
  });

  it.each(['workspaceId', 'channelId', 'channelType'] as const)(
    'denies an access snapshot for another %s',
    (field) => {
      const input = fixture().input(2);
      input.access = { ...input.access, [field]: field === 'channelType' ? 'TEXT' : id(99) };
      expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'FORBIDDEN' });
    },
  );

  it.each(['epoch', 'callGeneration', 'sessionId'] as const)('rejects a stale %s', (field) => {
    const input = fixture().input(2);
    input.request = { ...input.request, [field]: field === 'callGeneration' ? 2 : 'stale' };
    expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'CONFLICT' });
  });

  it.each([
    'membershipId',
    'membershipIncarnation',
    'membershipRevision',
    'channelRevision',
  ] as const)('rejects a replaced %s', (field) => {
    const input = fixture().input(2);
    input.access = { ...input.access, [field]: field === 'membershipId' ? id(99) : 2 };
    expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'CONFLICT' });
  });

  it('rejects expired authentication and an invalid clock', () => {
    const input = fixture().input(2);
    expect(
      resolveSessionPolicyContext({ ...input, nowMs: Date.parse(input.request.auth.expiresAt) }),
    ).toEqual({ ok: false, errorCode: 'AUTH_REQUIRED' });
    expect(resolveSessionPolicyContext({ ...input, nowMs: Number.NaN })).toEqual({
      ok: false,
      errorCode: 'AUTH_REQUIRED',
    });
  });

  it.each(['membershipRevision', 'channelRevision'] as const)(
    'continues the same ownership after the coordinator commits a revalidated %s',
    (revision) => {
      const f = fixture();
      const original = resolveSessionPolicyContext(f.input(2));
      if (!original.ok) throw new Error('Expected initial context');
      const callerAccess = { ...f.participant(2).access, [revision]: 1 };
      const publisherAccess = { ...f.participant(1).access, [revision]: 1 };
      f.participant(2).currentAccess = callerAccess;
      f.participant(1).currentAccess = publisherAccess;
      const input = { ...f.input(2), access: callerAccess };

      expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'CONFLICT' });
      expect(projectSessionFor(input).ok).toBe(false);
      expect(canReceiveMedia(input, id(1), 'CAMERA')).toBe(false);

      // Simulate the coordinator commit after M1 confirms uninterrupted access
      // for the same membership/incarnation under the shared gates, without a barrier.
      f.participant(2).access = { ...callerAccess };
      expect(canReceiveMedia(input, id(1), 'CAMERA')).toBe(false);
      f.participant(1).access = { ...publisherAccess };

      const refreshed = resolveSessionPolicyContext(input);
      expect(refreshed).toEqual({
        ok: true,
        context: { ...original.context, access: callerAccess },
      });
      const projection = projectSessionFor(input);
      expect(projection.ok).toBe(true);
      if (!projection.ok) throw new Error('Expected refreshed projection');
      expect(projection.projection.participants.map((p) => p.participantId)).toContain(id(1));
      expect(canReceiveMedia(input, id(1), 'CAMERA')).toBe(true);

      // Work captured before the refresh cannot reuse the previous access stamp.
      expect(resolveSessionPolicyContext({ ...input, access: original.context.access })).toEqual({
        ok: false,
        errorCode: 'CONFLICT',
      });
    },
  );

  it.each(['DISCUSSION', 'ACTIVITY'] as const)(
    'preserves joined %s membership after uninterrupted-access revalidation',
    (mode) => {
      const f = fixture(mode);
      const original = resolveSessionPolicyContext(f.input(3));
      if (!original.ok) throw new Error('Expected joined group context');
      const access = { ...f.participant(3).access, channelRevision: 1 };
      f.participant(3).currentAccess = access;
      const input = { ...f.input(3), access };
      expect(canDrawBoard(input, scopeA)).toBe(false);

      // Same revalidation commit as above; no group join or new ownership.
      f.participant(3).access = { ...access };
      expect(resolveSessionPolicyContext(input)).toEqual({
        ok: true,
        context: { ...original.context, access },
      });
      expect(canDrawBoard(input, scopeA)).toBe(true);
      expect(canReadScope(input, scopeB)).toBe(false);
    },
  );

  it.each(['membershipId', 'membershipIncarnation'] as const)(
    'denies a new %s even when both fresh snapshots allow content',
    (field) => {
      const f = fixture();
      f.participant(2).scope = scopeA;
      expect(canReceiveMedia(f.input(2), id(3), 'CAMERA')).toBe(true);
      const access = {
        ...f.participant(3).access,
        [field]: field === 'membershipId' ? id(99) : 2,
        membershipRevision: 1,
      };
      f.participant(3).currentAccess = access;
      const input = { ...f.input(3), access };
      expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'CONFLICT' });
      expect(projectSessionFor(input).ok).toBe(false);
      expect(canDrawBoard(input, scopeA)).toBe(false);
      expect(canReceiveMedia(f.input(2), id(3), 'CAMERA')).toBe(false);
    },
  );

  it('does not clear a revocation barrier when fresh content access becomes true again', () => {
    const f = fixture();
    f.participant(2).blocked = true;
    const access = { ...f.participant(2).access, channelRevision: 2 };
    f.participant(2).currentAccess = access;
    const input = { ...f.input(2), access };
    expect(resolveSessionPolicyContext(input)).toEqual({ ok: false, errorCode: 'CONFLICT' });
    expect(projectSessionFor(input).ok).toBe(false);
    expect(canReceiveMedia(input, id(1), 'CAMERA')).toBe(false);
    expect(f.participant(2).access.channelRevision).toBe(0);
    expect(f.participant(2).blocked).toBe(true);
  });

  it.each(['disconnected', 'denied', 'ending', 'ended'] as const)(
    'denies new access while %s',
    (state) => {
      const f = fixture();
      if (state === 'disconnected') f.participant(2).connected = false;
      if (state === 'denied') f.participant(2).blocked = true;
      if (state === 'ending') f.session.state = 'ENDING';
      if (state === 'ended') f.session.state = 'ENDED';
      expect(canPublishMedia(f.input(2), 'MIC')).toBe(false);
      expect(canReadScope(f.input(2), main)).toBe(false);
      expect(projectSessionFor(f.input(2)).ok).toBe(false);
    },
  );
});

describe('scope membership and host support', () => {
  it('lets a roster member request join without granting group content before join', () => {
    const f = fixture();
    expect(canJoinGroup(f.input(2), groupA)).toBe(true);
    expect(canReadScope(f.input(2), scopeA)).toBe(false);
    expect(canReceiveMedia(f.input(2), id(3), 'MIC')).toBe(false);
    expect(canJoinGroup(f.input(5), groupA)).toBe(false);
    expect(canJoinGroup(f.input(2), 'unknown')).toBe(false);
  });

  it('rejects a fabricated group position outside the eligible roster', () => {
    const f = fixture();
    f.participant(5).scope = scopeA;
    expect(canReadScope(f.input(5), scopeA)).toBe(false);
    expect(canDrawBoard(f.input(5), scopeA)).toBe(false);
  });

  it('allows self-rejoin only to the assigned ACTIVITY', () => {
    const f = fixture('ACTIVITY');
    expect(canJoinGroup(f.input(2), groupA)).toBe(true);
    expect(canJoinGroup(f.input(2), groupB)).toBe(false);
    expect(canJoinGroup(f.input(1), groupA)).toBe(false);
    expect(canHelpGroup(f.input(1), groupA)).toBe(true);
    expect(canHelpGroup(f.input(2), groupA)).toBe(false);
  });

  it('restricts host support to the currently visited ACTIVITY', () => {
    const f = fixture('ACTIVITY');
    expect(canReadScope(f.input(1), scopeA)).toBe(false);
    f.participant(1).scope = scopeA;
    f.session.helpingGroupId = groupA;
    expect(canReadScope(f.input(1), scopeA)).toBe(true);
    expect(canReadScope(f.input(1), scopeB)).toBe(false);
    expect(canReadScope(f.input(1), main)).toBe(false);
    expect(canDrawBoard(f.input(1), main)).toBe(false);
    expect(canReceiveMedia(f.input(1), id(3), 'MIC')).toBe(true);
    expect(canReceiveMedia(f.input(4), id(1), 'MIC')).toBe(false);
    expect(canReceiveMedia(f.input(2), id(1), 'MIC')).toBe(false);
    f.session.helpingGroupId = groupB;
    expect(canReadScope(f.input(1), scopeA)).toBe(false);
  });

  it('does not grant DISCUSSION access to the host', () => {
    const f = fixture();
    expect(canHelpGroup(f.input(1), groupA)).toBe(false);
    f.participant(1).scope = scopeA;
    f.session.helpingGroupId = groupA;
    expect(canReadScope(f.input(1), scopeA)).toBe(false);
  });

  it('denies group grants at the ACTIVITY deadline and for a replaced round', () => {
    const f = fixture('ACTIVITY');
    const expired = { ...f.input(3), nowMs: Date.parse(f.session.round!.deadline) };
    expect(canReadScope(expired, scopeA)).toBe(false);
    expect(canReceiveMedia(expired, id(3), 'MIC')).toBe(false);
    expect(canJoinGroup({ ...f.input(2), nowMs: expired.nowMs }, groupA)).toBe(false);
    f.session.round = { roundId: 'replacement', deadline: '2026-11-07T10:05:00Z' };
    expect(canReadScope(f.input(3), scopeA)).toBe(false);
  });

  it.each(['CLOSING', 'CLOSED'] as const)(
    'denies joins and existing group reads when %s',
    (state) => {
      const f = fixture();
      f.groups.set(groupA, { ...f.groups.get(groupA)!, state });
      expect(canJoinGroup(f.input(2), groupA)).toBe(false);
      expect(canReadScope(f.input(3), scopeA)).toBe(false);
    },
  );

  it.each(['ACTIVITY_STARTING', 'ACTIVITY_ENDING', 'ACTIVITY'] as const)(
    'blocks DISCUSSION during %s',
    (phase) => {
      const f = fixture();
      f.session.phase = phase;
      expect(canJoinGroup(f.input(2), groupA)).toBe(false);
      expect(canReadScope(f.input(3), scopeA)).toBe(false);
    },
  );
});

describe('media and board rights', () => {
  it.each(sources)('allows MAIN participants to publish and receive %s', (source) => {
    const f = fixture();
    expect(canPublishMedia(f.input(2), source)).toBe(true);
    expect(canReceiveMedia(f.input(1), id(2), source)).toBe(true);
  });

  it.each(sources)('enforces DISCUSSION source rules for %s', (source) => {
    const f = fixture();
    const screen = source === 'SCREEN' || source === 'SCREEN_AUDIO';
    expect(canPublishMedia(f.input(3), source)).toBe(!screen);
    expect(canReceiveMedia(f.input(3), id(2), source)).toBe(screen);
    expect(canReceiveMedia(f.input(3), id(1), source)).toBe(true);
    expect(canReceiveMedia(f.input(4), id(3), source)).toBe(false);
    expect(canReceiveMedia(f.input(2), id(3), source)).toBe(false);
  });

  it.each(sources)('keeps ACTIVITY %s inside its group and permits member sharing', (source) => {
    const f = fixture('ACTIVITY');
    f.participant(2).scope = scopeA;
    expect(canPublishMedia(f.input(3), source)).toBe(true);
    expect(canReceiveMedia(f.input(2), id(3), source)).toBe(true);
    expect(canReceiveMedia(f.input(3), id(1), source)).toBe(false);
    expect(canReceiveMedia(f.input(4), id(3), source)).toBe(false);
  });

  it('rejects sources whose publisher lost access or became blocked', () => {
    const f = fixture();
    f.participant(1).access.canReadContent = false;
    expect(canReceiveMedia(f.input(3), id(1), 'CAMERA')).toBe(false);
    f.participant(2).blocked = true;
    expect(canReceiveMedia(f.input(3), id(2), 'SCREEN')).toBe(false);
    expect(canReceiveMedia(f.input(3), 'unknown', 'MIC')).toBe(false);
  });

  it('rejects a publisher with revoked or replaced M1 authority despite its old runtime stamp', () => {
    const f = fixture();
    f.participant(1).currentAccess.canReadContent = false;
    expect(canReceiveMedia(f.input(3), id(1), 'MIC')).toBe(false);
    f.participant(2).currentAccess.membershipIncarnation = 2;
    expect(canReceiveMedia(f.input(3), id(2), 'SCREEN')).toBe(false);
    const projection = projectSessionFor(f.input(5));
    expect(projection.ok && projection.projection.participants.map((p) => p.participantId)).toEqual(
      [id(5)],
    );
  });

  it('restricts MAIN drawing to the current host and freeze to joined groups', () => {
    const f = fixture();
    expect(canDrawBoard(f.input(1), main)).toBe(true);
    expect(canDrawBoard(f.input(2), main)).toBe(false);
    expect(canFreezeBoard(f.input(1), main)).toBe(false);
    expect(canFreezeBoard(f.input(3), scopeA)).toBe(true);
    expect(canDrawBoard(f.input(3), scopeA)).toBe(true);
    expect(canDrawBoard(f.input(3), scopeB)).toBe(false);
    f.session.hostParticipantId = id(2);
    f.session.policyRevision++;
    expect(canDrawBoard(f.input(1), main)).toBe(false);
    expect(canDrawBoard(f.input(2), main)).toBe(true);
  });
});

describe('recipient projection', () => {
  it('denies media/board/projection through a live transition until cleanup and commit complete', async () => {
    const f = fixture();
    const participant = f.participant(3);
    const context = { assertHeld: () => undefined, isCurrent: () => true };
    const cleanup = async (value: import('@colearnia/contracts').SessionCleanupRequest) => {
      const result = { ...value };
      Reflect.deleteProperty(result, 'reason');
      return sessionCleanupResultSchema.parse({
        ...result,
        outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending: false },
      });
    };
    const transition = beginSessionTransition(
      {
        operationId: '10000000-0000-4000-8000-000000000005',
        sessionId: f.session.sessionId,
        epoch: f.session.epoch,
        transitionToken: '10000000-0000-4000-8000-000000000006',
        callGeneration: participant.callGeneration,
        reason: 'SCOPE_CHANGED',
        target: {
          type: 'PARTICIPANT_SCOPE',
          participantId: participant.participantId,
          audienceEpoch: participant.audienceEpoch,
          scope: participant.scope,
        },
      },
      context,
      { media: cleanup, messaging: cleanup, board: cleanup },
      {
        userId: participant.auth.userId,
        timing: createSessionTransitionTiming(),
        admission: new CleanupAdmission({ perUser: 3, perSession: 8, process: 32 }),
      },
    );
    const input = () => {
      participant.blocked = transition.blocks({
        sessionId: f.session.sessionId,
        epoch: f.session.epoch,
        participantId: participant.participantId,
        callGeneration: participant.callGeneration,
        audienceEpoch: participant.audienceEpoch,
        scope: participant.scope,
      });
      return f.input(3);
    };
    expect(canPublishMedia(input(), 'MIC')).toBe(false);
    expect(canDrawBoard(input(), scopeA)).toBe(false);
    expect(projectSessionFor(input()).ok).toBe(false);
    await transition.runForeground();
    expect(projectSessionFor(input()).ok).toBe(false);
    expect(
      transition.commitHeld(context, () => {
        participant.scope = { type: 'MAIN' };
        participant.audienceEpoch++;
        f.session.policyRevision++;
        return true;
      }),
    ).toEqual({ ok: true });
    expect(projectSessionFor(input()).ok).toBe(true);
    expect(canPublishMedia(input(), 'MIC')).toBe(true);
    expect(canDrawBoard(input(), scopeA)).toBe(false);
  });
  it.each(['DISCUSSION', 'ACTIVITY'] as const)(
    'matches the public projection contract in %s',
    (mode) => {
      const f = fixture(mode);
      for (const member of [1, 2, 3, 4, 5]) {
        const result = projectSessionFor(f.input(member));
        if (!result.ok) throw new Error('Expected eligible participant');
        expect(sessionProjectionSchema.parse(result.projection)).toEqual(result.projection);
      }
    },
  );
  it('returns only same-scope participants and public group summaries to a roster-only member', () => {
    const f = fixture();
    const result = projectSessionFor(f.input(2));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected projection');
    expect(result.projection.participants.map((p) => p.participantId)).toEqual([
      id(1),
      id(2),
      id(5),
    ]);
    expect(result.projection.groups.find((g) => g.groupId === groupA)).toEqual({
      groupId: groupA,
      name: 'Group A',
      mode: 'DISCUSSION',
      memberCount: 1,
      canJoin: true,
    });
    expect(result.projection.permissions.drawBoard).toBe(false);
    expect(result.projection.permissions.freezeBoard).toBe(false);
  });

  it('omits private runtime and auth fields by picking a fixed set of fields', () => {
    const f = fixture();
    Object.assign(f.participant(3), {
      producerId: 'private-producer',
      frameUrl: 'private-frame',
      messages: ['private-message'],
    });
    Object.assign(f.groups.get(groupA)!, { purpose: 'private-purpose', board: 'private-board' });
    const result = projectSessionFor(f.input(1));
    const serialized = JSON.stringify(result);
    for (const hidden of [
      'private-producer',
      'private-frame',
      'private-message',
      'private-purpose',
      'private-board',
      'authSessionId',
      'membershipId',
      'rosterParticipantIds',
      'canManageChannel',
    ]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it('projects host support into one group without counting the host as an assigned member', () => {
    const f = fixture('ACTIVITY');
    f.participant(1).scope = scopeA;
    f.session.helpingGroupId = groupA;
    const result = projectSessionFor(f.input(1));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected projection');
    expect(result.projection.participants.map((p) => p.participantId)).toEqual([id(1), id(3)]);
    expect(result.projection.groups.find((g) => g.groupId === groupA)?.memberCount).toBe(1);
  });

  it('leaves the input untouched and returns independent projection objects', () => {
    const f = fixture();
    const before = structuredClone(f.session);
    const result = projectSessionFor(f.input(3));
    expect(f.session).toEqual(before);
    if (!result.ok) throw new Error('Expected projection');
    result.projection.viewer.scope.type = 'MAIN';
    result.projection.groups[0]!.name = 'Changed outside runtime';
    expect(f.session).toEqual(before);
  });
});
