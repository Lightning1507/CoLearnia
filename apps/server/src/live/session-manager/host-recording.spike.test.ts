import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SessionCleanupRequest, SessionCleanupResult } from '@colearnia/contracts';
import { createHostRecordingFixture } from '../../../test/fixtures/host-recording/host-recording-fixture.js';
import { resolveSessionPolicyContext, canPublishMedia } from '../policy/session-policy.js';
import { createOperationCoordinator } from '../../lib/operation-coordinator.js';
import { beginSessionTransition, createSessionTransitionTiming } from './session-transition.js';
import { createSessionEndOperation } from './session-end-operation.js';

const host = (f: ReturnType<typeof createHostRecordingFixture>, id: string) => {
  const participant = f.participants.get(id)!;
  const context = resolveSessionPolicyContext(f.inputFor(participant));
  return context.ok && context.context.role === 'HOST';
};
const apply = (
  f: ReturnType<typeof createHostRecordingFixture>,
  event: Parameters<typeof f.prepare>[0],
) => {
  const plan = f.prepare(event);
  expect(f.commit(plan, true)).toBe(true);
  return plan;
};

describe('SCRUM-90: host succession executable model with the real session policy', () => {
  it('keeps A as the return target through A -> B -> C and B returning', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    expect(host(f, f.a.participantId)).toBe(false);
    expect(host(f, f.b.participantId)).toBe(true);
    apply(f, { kind: 'DISCONNECT', participantId: f.b.participantId });
    expect(host(f, f.c.participantId)).toBe(true);
    expect(f.returnHost()).toBe(f.a.auth.userId);
    apply(f, { kind: 'ARRIVE', participant: f.makeParticipant(2, 2) });
    expect(host(f, f.b.participantId)).toBe(false);
    expect(host(f, f.c.participantId)).toBe(true);
    f.advance(31_000);
    apply(f, { kind: 'ARRIVE', participant: f.makeParticipant(1, 2) });
    expect(host(f, f.a.participantId)).toBe(true);
    expect(host(f, f.c.participantId)).toBe(false);
  });
  it('official transfer replaces the old return entitlement', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    apply(f, { kind: 'TRANSFER', actorId: f.b.participantId, targetId: f.c.participantId });
    apply(f, { kind: 'ARRIVE', participant: f.makeParticipant(1, 2) });
    expect(f.returnHost()).toBeNull();
    expect(host(f, f.c.participantId)).toBe(true);
    expect(host(f, f.a.participantId)).toBe(false);
  });
  it('keeps the return target until official transfer cleanup and commit succeed', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    const plan = f.prepare({
      kind: 'TRANSFER',
      actorId: f.b.participantId,
      targetId: f.c.participantId,
    });
    expect(f.returnHost()).toBe(f.a.auth.userId);
    expect(f.commit(plan, false)).toBe(false);
    expect(f.returnHost()).toBe(f.a.auth.userId);
    expect(f.session.hostParticipantId).toBeNull();
    expect(f.commit(plan, true)).toBe(true);
    expect(f.returnHost()).toBeNull();
    expect(host(f, f.c.participantId)).toBe(true);
  });
  it('restores the original host when an uncommitted transfer is superseded by arrival', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    const plan = f.prepare({
      kind: 'TRANSFER',
      actorId: f.b.participantId,
      targetId: f.c.participantId,
    });
    expect(f.commit(plan, false)).toBe(false);
    apply(f, { kind: 'ARRIVE', participant: f.makeParticipant(1, 2) });
    expect(f.commit(plan, true)).toBe(false);
    expect(f.returnHost()).toBe(f.a.auth.userId);
    expect(host(f, f.a.participantId)).toBe(true);
    expect(host(f, f.c.participantId)).toBe(false);
  });
  it('a revoked original host returns as member after a fresh authorized join', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    apply(f, { kind: 'REVOKE', participantId: f.a.participantId });
    const fresh = f.makeParticipant(1, 2);
    fresh.access.membershipIncarnation++;
    fresh.currentAccess.membershipIncarnation++;
    apply(f, { kind: 'ARRIVE', participant: fresh });
    expect(f.returnHost()).toBeNull();
    expect(host(f, f.a.participantId)).toBe(false);
    expect(host(f, f.b.participantId)).toBe(true);
  });
  it('revoking a temporary host does not clear the original return target', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    apply(f, { kind: 'REVOKE', participantId: f.b.participantId });
    expect(f.returnHost()).toBe(f.a.auth.userId);
    expect(host(f, f.c.participantId)).toBe(true);
  });
  it('waits only for existing grace and ends immediately when the last ownership expires', () => {
    const f = createHostRecordingFixture();
    for (const participant of [f.a, f.b, f.c])
      apply(f, { kind: 'DISCONNECT', participantId: participant.participantId });
    expect(f.session.hostParticipantId).toBeNull();
    expect(f.session.state).toBe('ACTIVE');
    f.advance(29_999);
    apply(f, { kind: 'TICK' });
    expect(f.session.state).toBe('ACTIVE');
    f.advance(1);
    apply(f, { kind: 'TICK' });
    expect(f.session.state).toBe('ENDING');
    expect(() => f.prepare({ kind: 'ARRIVE', participant: f.makeParticipant(1, 2) })).toThrow();
  });
  it.each([0, 1])('selects only a valid candidate at injected index %s', (index) => {
    const select = vi.fn(() => index);
    const f = createHostRecordingFixture(select);
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    expect(select).toHaveBeenCalledWith(2);
    expect(f.session.hostParticipantId).toBe([f.b, f.c][index]!.participantId);
  });
  it('filters candidates by current policy, including auth expiry and deny', () => {
    const select = vi.fn(() => 0);
    const f = createHostRecordingFixture(select);
    f.b.blocked = true;
    f.c.auth.expiresAt = new Date(f.now()).toISOString();
    apply(f, { kind: 'DISCONNECT', participantId: f.a.participantId });
    expect(select).not.toHaveBeenCalled();
    expect(f.session.hostParticipantId).toBeNull();
    expect(f.session.state).toBe('ACTIVE');
  });
  it('requires cleanup and rejects an obsolete plan or epoch before granting host', () => {
    const f = createHostRecordingFixture();
    const old = f.prepare({ kind: 'DISCONNECT', participantId: f.a.participantId });
    expect(f.session.hostParticipantId).toBeNull();
    expect(f.commit(old, false)).toBe(false);
    const current = f.prepare({ kind: 'REVOKE', participantId: f.b.participantId });
    expect(f.commit(old, true)).toBe(false);
    f.session.epoch = randomUUID();
    expect(f.commit(current, true)).toBe(false);
  });
  it('keeps ordinary MAIN publishing rights when host is transferred', () => {
    const f = createHostRecordingFixture();
    apply(f, { kind: 'TRANSFER', actorId: f.a.participantId, targetId: f.b.participantId });
    expect(host(f, f.a.participantId)).toBe(false);
    expect(canPublishMedia(f.inputFor(f.a), 'SCREEN')).toBe(true);
    expect(canPublishMedia(f.inputFor(f.a), 'MIC')).toBe(true);
  });
  it('removes host-only help while preserving the group roster and deadline', () => {
    const f = createHostRecordingFixture();
    const groupId = randomUUID(),
      roundId = randomUUID();
    const deadline = new Date(f.now() + 60_000).toISOString();
    f.session.phase = 'ACTIVITY';
    f.session.round = { roundId, deadline };
    f.session.groups = new Map([
      [
        groupId,
        {
          groupId,
          roundId,
          mode: 'ACTIVITY',
          name: 'Nhóm',
          state: 'OPEN',
          rosterParticipantIds: [f.c.participantId],
        },
      ],
    ]);
    f.session.helpingGroupId = groupId;
    f.a.scope = { type: 'GROUP', groupId };
    apply(f, { kind: 'TRANSFER', actorId: f.a.participantId, targetId: f.b.participantId });
    expect(f.a.scope.type).toBe('MAIN');
    expect(f.pausedMics.has(f.a.participantId)).toBe(true);
    expect(f.session.helpingGroupId).toBeNull();
    expect(f.session.groups.get(groupId)!.rosterParticipantIds).toEqual([f.c.participantId]);
    expect(f.session.round!.deadline).toBe(deadline);
  });
});

function cleanupAck(value: SessionCleanupRequest): SessionCleanupResult {
  const identity = {
    operationId: value.operationId,
    sessionId: value.sessionId,
    epoch: value.epoch,
    transitionToken: value.transitionToken,
    outcome: {
      permissionRevoked: true as const,
      pendingInvalidated: true as const,
      cleanupPending: false,
    },
  };
  return 'callGeneration' in value
    ? { ...identity, callGeneration: value.callGeneration, target: value.target }
    : { ...identity, target: value.target };
}

describe('SCRUM-90: host cleanup using the existing coordinator and transition engine', () => {
  it.each([false, true])(
    'does not keep the gate or grant from stale cleanup (superseded=%s)',
    async (superseded) => {
      const f = createHostRecordingFixture();
      const coordinator = createOperationCoordinator();
      let finish!: (value: SessionCleanupResult) => void;
      const pending = new Promise<SessionCleanupResult>((resolve) => {
        finish = resolve;
      });
      const request: SessionCleanupRequest = {
        operationId: randomUUID(),
        sessionId: f.session.sessionId,
        epoch: f.session.epoch,
        transitionToken: randomUUID(),
        callGeneration: f.a.callGeneration,
        target: { type: 'PARTICIPANT', participantId: f.a.participantId },
        reason: 'DISCONNECTED',
      };
      const prepared = await coordinator.run(
        { workspaceId: f.session.workspaceId },
        async (held) => {
          const plan = f.prepare({ kind: 'DISCONNECT', participantId: f.a.participantId });
          const context = {
            assertHeld: () => held.assertHeld({ workspaceId: f.session.workspaceId }),
            isCurrent: () =>
              plan.epoch === f.session.epoch && plan.revision === f.session.policyRevision,
          };
          const handle = beginSessionTransition(
            request,
            context,
            {
              media: { revoke: cleanupAck },
              board: () => pending,
              messaging: async (value) => cleanupAck(value),
            },
            { userId: f.a.auth.userId, timing: createSessionTransitionTiming() },
          );
          return { handle, plan };
        },
      );
      const cleaning = prepared.handle.runForeground();
      await coordinator.run({ workspaceId: f.session.workspaceId }, async () => {
        expect(f.session.hostParticipantId).toBeNull();
        if (superseded) f.prepare({ kind: 'REVOKE', participantId: f.b.participantId });
      });
      finish(cleanupAck(request));
      expect((await cleaning).permissionRevoked).toBe(true);
      const result = await coordinator.run({ workspaceId: f.session.workspaceId }, async (held) =>
        prepared.handle.commitHeld(
          {
            assertHeld: () => held.assertHeld({ workspaceId: f.session.workspaceId }),
            isCurrent: () =>
              prepared.plan.epoch === f.session.epoch &&
              prepared.plan.revision === f.session.policyRevision,
          },
          () => f.commit(prepared.plan, true),
        ),
      );
      expect(result.ok).toBe(!superseded);
      expect(host(f, f.b.participantId)).toBe(!superseded);
    },
  );
});

describe('SCRUM-90: recording protocol test double, not a capture/storage pipeline', () => {
  it('the real end coordinator waits for input-stop confirmation but not encoder/storage completion', async () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(attempt, 0);
    const coordinator = createOperationCoordinator();
    let inputStopped!: () => void;
    const waitForInput = new Promise<void>((resolve) => {
      inputStopped = resolve;
    });
    const media = vi.fn(async (request: SessionCleanupRequest) => {
      await waitForInput;
      if (!f.recorder.canFinishCall()) throw new Error('Input still active');
      const ack = cleanupAck(request);
      ack.outcome.cleanupPending = true;
      return ack;
    });
    const complete = vi.fn(async (guard: () => void) => {
      guard();
      expect(f.recorder.canFinishCall()).toBe(true);
    });
    const operation = await coordinator.run(
      { workspaceId: f.session.workspaceId },
      async (held) => {
        f.recorder.endCall();
        return createSessionEndOperation({
          input: {
            requestId: randomUUID(),
            sessionId: f.session.sessionId,
            epoch: f.session.epoch,
            callGeneration: f.a.callGeneration,
            expectedPolicyRevision: f.session.policyRevision,
            action: 'END',
          },
          context: {
            assertHeld: () => held.assertHeld({ workspaceId: f.session.workspaceId }),
            isCurrent: (request) =>
              f.session.state === 'ENDING' && request.epoch === f.session.epoch,
          },
          timing: createSessionTransitionTiming(),
          targets: [
            {
              userId: f.a.auth.userId,
              request: {
                operationId: randomUUID(),
                sessionId: f.session.sessionId,
                epoch: f.session.epoch,
                transitionToken: randomUUID(),
                callGeneration: f.a.callGeneration,
                target: { type: 'PARTICIPANT', participantId: f.a.participantId },
                reason: 'SESSION_ENDED',
              },
            },
          ],
          adapters: {
            media,
            messaging: async (request) => cleanupAck(request),
            board: async (request) => cleanupAck(request),
          },
          beginEnding: async (guard) => {
            guard();
          },
          completeEnding: complete,
          finalize: async (guard) => {
            guard();
            f.session.state = 'ENDED';
          },
        });
      },
    );
    const ending = operation.run();
    await vi.waitFor(() => expect(media).toHaveBeenCalledOnce());
    await coordinator.run({ workspaceId: f.session.workspaceId }, async () => {
      expect(complete).not.toHaveBeenCalled();
    });
    expect(f.recorder.inputStopped({ ...attempt, generation: attempt.generation + 1 })).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(f.recorder.inputStopped(attempt)).toBe(true);
    inputStopped();
    const result = await ending;
    if (!('data' in result)) throw new Error('Expected an end acknowledgement');
    expect(result.data.result.state).toBe('ENDED');
    expect(result.data.result.cleanupPending).toBe(true);
    expect(f.recorder.inspect()!.state).toBe('PROCESSING');
    expect(f.recorder.finalized(attempt, true)).toBe(true);
  });
  it('survives host handoff and allows only the current host to control the same attempt', () => {
    const f = createHostRecordingFixture();
    const key = randomUUID();
    const attempt = f.recorder.start(f.a, key);
    apply(f, { kind: 'TRANSFER', actorId: f.a.participantId, targetId: f.b.participantId });
    expect(f.recorder.captureReady(attempt, 0)).toBe(true);
    expect(() => f.recorder.stop(f.a, attempt)).toThrow('Current host');
    expect(() => f.recorder.start(f.b, key)).toThrow('Attempt is open');
    f.recorder.stop(f.b, attempt);
    expect(f.recorder.inspect()?.attemptId).toBe(attempt.attemptId);
    expect(f.recorder.trace.filter((value) => value === 'start-requested')).toHaveLength(1);
  });
  it('replays start for the same actor/intent without creating another attempt', () => {
    const f = createHostRecordingFixture();
    const key = randomUUID();
    const first = f.recorder.start(f.a, key);
    expect(f.recorder.start(f.a, key).attemptId).toBe(first.attemptId);
    expect(f.recorder.trace.filter((value) => value === 'start-requested')).toHaveLength(1);
    expect(() => f.recorder.start(f.a, randomUUID(), f.session.policyRevision, 0)).toThrow();
  });
  it('starts the three-hour limit at capture-ready and never resets it on host transfer', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.advance(15_000);
    f.recorder.captureReady(attempt, 0);
    const deadline = f.recorder.inspect()!.deadline!;
    expect(deadline).toBe(f.now() + 10_800_000);
    f.advance(7_200_000);
    apply(f, { kind: 'TRANSFER', actorId: f.a.participantId, targetId: f.b.participantId });
    expect(f.recorder.inspect()!.deadline).toBe(deadline);
    f.advance(3_599_999);
    f.recorder.tick();
    expect(f.recorder.inspect()!.state).toBe('RECORDING');
    f.advance(1);
    f.recorder.tick();
    expect(f.recorder.inspect()!.state).toBe('STOPPING');
    expect(f.session.state).toBe('ACTIVE');
  });
  it('cancels STARTING and rejects capture-ready arriving after Stop', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.stop(f.a, attempt);
    expect(f.recorder.captureReady(attempt, 0)).toBe(false);
    expect(f.recorder.inspect()!.captureStartedAt).toBeNull();
    expect(f.recorder.inputStopped(attempt)).toBe(true);
    expect(f.recorder.inspect()!.state).toBe('FAILED');
    expect(f.recorder.finalized(attempt, true)).toBe(false);
  });
  it('separates input-stopped from finalized/stored so call end never waits for READY', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(attempt, 0);
    f.recorder.endCall();
    expect(f.recorder.canFinishCall()).toBe(false);
    expect(f.recorder.finalized(attempt, true)).toBe(false);
    f.recorder.inputStopped(attempt);
    expect(f.recorder.canFinishCall()).toBe(true);
    expect(f.recorder.inspect()!.state).toBe('PROCESSING');
    expect(f.recorder.finalized(attempt, false)).toBe(false);
    f.session.state = 'ENDED';
    expect(f.recorder.finalized(attempt, true)).toBe(true);
  });
  it('does not reuse a slot in PROCESSING or before release and ignores old-attempt callbacks', () => {
    const f = createHostRecordingFixture();
    const first = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(first, 0);
    f.recorder.stop(f.a, first);
    f.recorder.inputStopped(first);
    expect(() => f.recorder.start(f.a, randomUUID())).toThrow('Attempt is open');
    f.recorder.finalized(first, true);
    expect(() => f.recorder.start(f.a, randomUUID())).toThrow('Attempt is open');
    f.recorder.release(first);
    const next = f.recorder.start(f.a, randomUUID());
    expect(next.attemptId).not.toBe(first.attemptId);
    expect(f.recorder.inputStopped(first)).toBe(false);
    expect(f.recorder.deadline(first, 0)).toBe(false);
    expect(() => f.recorder.stop(f.a, first)).toThrow('Stale recording attempt');
    expect(f.recorder.inspect()!.state).toBe('STARTING');
  });
  it('a storage deny fences READY even after input is stopped', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(attempt, 0);
    f.recorder.stop(f.a, attempt);
    f.recorder.inputStopped(attempt);
    f.recorder.denyStorage();
    expect(f.recorder.finalized(attempt, true)).toBe(false);
    expect(f.recorder.inspect()!.state).toBe('PROCESSING');
  });
  it('recorder failure does not end the call or automatically start a replacement', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(attempt, 0);
    f.recorder.fail();
    expect(f.session.state).toBe('ACTIVE');
    expect(f.recorder.canFinishCall()).toBe(false);
    f.recorder.inputStopped(attempt);
    expect(f.recorder.inspect()!.state).toBe('FAILED');
    expect(f.recorder.trace.filter((value) => value === 'start-requested')).toHaveLength(1);
  });
  it('fails PROCESSING without allowing a late finalization to restore READY', () => {
    const f = createHostRecordingFixture();
    const attempt = f.recorder.start(f.a, randomUUID());
    f.recorder.captureReady(attempt, 0);
    f.recorder.stop(f.a, attempt);
    f.recorder.inputStopped(attempt);
    expect(f.recorder.inspect()!.state).toBe('PROCESSING');
    const revision = f.recorder.inspect()!.revision;
    f.recorder.fail();
    expect(f.recorder.inspect()).toMatchObject({
      state: 'FAILED',
      revision: revision + 1,
      inputStopped: true,
    });
    f.recorder.fail();
    expect(f.recorder.inspect()!.revision).toBe(revision + 1);
    expect(f.recorder.finalized(attempt, true)).toBe(false);
    expect(f.recorder.inspect()!.state).toBe('FAILED');
    expect(f.session.state).toBe('ACTIVE');
    expect(f.recorder.canFinishCall()).toBe(true);
    expect(f.recorder.trace.filter((value) => value === 'start-requested')).toHaveLength(1);
    expect(f.recorder.release(attempt)).toBe(true);
  });
  it('selects MAIN sources by the real policy and never follows the host into ACTIVITY', () => {
    const f = createHostRecordingFixture();
    const groupId = randomUUID(),
      roundId = randomUUID();
    f.session.phase = 'ACTIVITY';
    f.session.round = { roundId, deadline: new Date(f.now() + 60_000).toISOString() };
    f.session.groups = new Map([
      [
        groupId,
        {
          groupId,
          roundId,
          mode: 'ACTIVITY',
          name: 'Nhóm',
          state: 'OPEN',
          rosterParticipantIds: [f.c.participantId],
        },
      ],
    ]);
    f.session.helpingGroupId = groupId;
    f.a.scope = { type: 'GROUP', groupId };
    f.c.scope = { type: 'GROUP', groupId };
    const sources = [
      { participantId: f.a.participantId, kind: 'MIC' as const, active: true },
      { participantId: f.c.participantId, kind: 'CAMERA' as const, active: true },
      { participantId: f.b.participantId, kind: 'MIC' as const, active: true, localGain: 0 },
      { participantId: f.b.participantId, kind: 'CAMERA' as const, active: false },
    ];
    expect(f.recorder.eligibleSources(sources)).toEqual([sources[2]]);
    f.b.blocked = true;
    expect(f.recorder.eligibleSources(sources)).toEqual([]);
  });
});
