import { randomUUID } from 'node:crypto';
import {
  canPublishMedia,
  resolveSessionPolicyContext,
} from '../../../src/live/policy/session-policy.js';
import type {
  PolicyParticipant,
  SessionPolicyState,
} from '../../../src/live/policy/session-policy.js';
import type { MediaSource } from '@colearnia/contracts';

// Executable model for SCRUM-90, not an application service or storage adapter.
const objectId = (value: number) => value.toString(16).padStart(24, '0');
export type HostPlan = Readonly<{
  token: string;
  epoch: string;
  revision: number;
  oldHostId: string | null;
  nextHostId: string | null;
  shouldEnd: boolean;
  officialTransfer: boolean;
}>;
type HostEvent =
  | { kind: 'DISCONNECT'; participantId: string }
  | { kind: 'ARRIVE'; participant: PolicyParticipant }
  | { kind: 'REVOKE'; participantId: string }
  | { kind: 'TRANSFER'; actorId: string; targetId: string }
  | { kind: 'TICK' };

export function createHostRecordingFixture(pickIndex: (count: number) => number = () => 0) {
  let now = Date.UTC(2026, 10, 11);
  const participants = new Map<string, PolicyParticipant>();
  const session: SessionPolicyState = {
    sessionId: objectId(100),
    workspaceId: objectId(101),
    channelId: objectId(102),
    epoch: randomUUID(),
    state: 'ACTIVE',
    phase: 'GUIDANCE',
    policyRevision: 0,
    hostParticipantId: objectId(1),
    helpingGroupId: null,
    round: null,
    participants,
    groups: new Map(),
  };
  const makeParticipant = (number: number, generation = 1): PolicyParticipant => {
    const access = {
      workspaceId: session.workspaceId,
      channelId: session.channelId,
      channelType: 'LIVE' as const,
      membershipId: objectId(200 + number),
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    };
    return {
      participantId: objectId(number),
      displayName: String.fromCharCode(64 + number),
      auth: {
        userId: objectId(300 + number),
        authSessionId: objectId(400 + number),
        expiresAt: new Date(now + 24 * 3600_000).toISOString(),
      },
      access,
      currentAccess: { ...access },
      callGeneration: generation,
      audienceEpoch: 0,
      connected: true,
      blocked: false,
      scope: { type: 'MAIN' },
    };
  };
  for (const number of [1, 2, 3]) {
    const participant = makeParticipant(number);
    participants.set(participant.participantId, participant);
  }
  const [a, b, c] = [...participants.values()] as [
    PolicyParticipant,
    PolicyParticipant,
    PolicyParticipant,
  ];
  let returnHostUserId: string | null = null;
  let planToken = '';
  const grace = new Map<string, number>();
  const pausedMics = new Set<string>();
  const inputFor = (participant: PolicyParticipant, generation = participant.callGeneration) => ({
    request: {
      auth: participant.auth,
      sessionId: session.sessionId,
      epoch: session.epoch,
      callGeneration: generation,
    },
    access: participant.currentAccess,
    session,
    nowMs: now,
  });
  const available = (participant: PolicyParticipant) =>
    resolveSessionPolicyContext(inputFor(participant)).ok;
  const holdsOwnership = (participant: PolicyParticipant) =>
    !participant.blocked &&
    participant.currentAccess.canReadContent &&
    participant.access.canReadContent &&
    Date.parse(participant.auth.expiresAt) > now &&
    (participant.connected || (grace.get(participant.participantId) ?? 0) > now);

  function prepare(event: HostEvent): HostPlan {
    if (session.state !== 'ACTIVE') throw new Error('Session is not active');
    const oldHostId = session.hostParticipantId;
    if (event.kind === 'TRANSFER') {
      const actor = participants.get(event.actorId),
        target = participants.get(event.targetId);
      if (!actor || oldHostId !== actor.participantId || !available(actor))
        throw new Error('Host authority required');
      if (!target || !available(target)) throw new Error('Target unavailable');
    } else if (event.kind === 'ARRIVE') {
      const incoming = structuredClone(event.participant);
      for (const [id, previous] of participants) {
        if (previous.auth.userId !== incoming.auth.userId) continue;
        if (previous.connected) throw new Error('Ownership already connected');
        participants.delete(id);
        grace.delete(id);
      }
      participants.set(incoming.participantId, incoming);
    } else if (event.kind === 'DISCONNECT' || event.kind === 'REVOKE') {
      const participant = participants.get(event.participantId);
      if (!participant) throw new Error('Participant unavailable');
      if (event.kind === 'DISCONNECT') {
        if (oldHostId === participant.participantId && !returnHostUserId)
          returnHostUserId = participant.auth.userId;
        if (!grace.has(participant.participantId))
          grace.set(participant.participantId, now + 30_000);
        participant.connected = false;
      } else {
        participant.blocked = true;
        participant.currentAccess.canReadContent = false;
        grace.delete(participant.participantId);
        if (returnHostUserId === participant.auth.userId) returnHostUserId = null;
      }
    }
    const candidates = [...participants.values()].filter(available);
    let nextHostId = event.kind === 'TRANSFER' ? event.targetId : session.hostParticipantId;
    if (
      event.kind === 'ARRIVE' &&
      event.participant.auth.userId === returnHostUserId &&
      candidates.some((p) => p.participantId === event.participant.participantId)
    )
      nextHostId = event.participant.participantId;
    if (!candidates.some((p) => p.participantId === nextHostId)) {
      nextHostId = null;
      if (candidates.length) {
        const index = pickIndex(candidates.length);
        if (!Number.isSafeInteger(index) || index < 0 || index >= candidates.length)
          throw new Error('Invalid candidate selection');
        nextHostId = candidates[index]!.participantId;
      }
    }
    // Deny the old role before any asynchronous cleanup. This fixture models the
    // authority barrier only; it does not pretend host-only resource ports exist.
    if (oldHostId !== nextHostId) session.hostParticipantId = null;
    session.policyRevision++;
    planToken = randomUUID();
    return Object.freeze({
      token: planToken,
      epoch: session.epoch,
      revision: session.policyRevision,
      oldHostId,
      nextHostId,
      shouldEnd: ![...participants.values()].some(holdsOwnership),
      officialTransfer: event.kind === 'TRANSFER',
    });
  }

  function commit(plan: HostPlan, cleanupConfirmed: boolean) {
    if (
      !cleanupConfirmed ||
      session.state !== 'ACTIVE' ||
      plan.token !== planToken ||
      plan.epoch !== session.epoch ||
      plan.revision !== session.policyRevision
    )
      return false;
    const next = plan.nextHostId ? participants.get(plan.nextHostId) : undefined;
    if (plan.nextHostId && (!next || !available(next))) return false;
    const old = plan.oldHostId ? participants.get(plan.oldHostId) : undefined;
    if (
      old?.scope.type === 'GROUP' &&
      !session.groups.get(old.scope.groupId)?.rosterParticipantIds.includes(old.participantId)
    ) {
      old.scope = { type: 'MAIN' };
      pausedMics.add(old.participantId);
    }
    if (next?.scope.type === 'GROUP') {
      next.scope = { type: 'MAIN' };
      pausedMics.add(next.participantId);
    }
    session.helpingGroupId = null;
    session.hostParticipantId = plan.nextHostId;
    if (plan.officialTransfer) returnHostUserId = null;
    if (plan.shouldEnd) session.state = 'ENDING';
    session.policyRevision++;
    return true;
  }

  type Attempt = {
    recordingId: string;
    attemptId: string;
    generation: number;
    epoch: string;
    state: 'STARTING' | 'RECORDING' | 'STOPPING' | 'PROCESSING' | 'READY' | 'FAILED';
    revision: number;
    captureStartedAt: number | null;
    deadline: number | null;
    inputStopped: boolean;
    cancelled: boolean;
    failed: boolean;
    released: boolean;
  };
  let attempt: Attempt | null = null;
  let generation = 0;
  let storageAllowed = true;
  const starts = new Map<string, Attempt>();
  const trace: string[] = [];
  type Identity = Pick<Attempt, 'recordingId' | 'attemptId' | 'generation' | 'epoch'>;
  function matches(identity: Identity) {
    return (
      !!attempt &&
      identity.recordingId === attempt.recordingId &&
      identity.attemptId === attempt.attemptId &&
      identity.generation === attempt.generation &&
      identity.epoch === attempt.epoch
    );
  }
  function requireHost(
    participant: PolicyParticipant,
    expectedRevision: number,
    callGeneration = participant.callGeneration,
  ) {
    const context = resolveSessionPolicyContext(inputFor(participant, callGeneration));
    if (
      !context.ok ||
      context.context.role !== 'HOST' ||
      expectedRevision !== session.policyRevision
    )
      throw new Error('Current host context required');
  }
  function stopInput() {
    if (!attempt || !['STARTING', 'RECORDING'].includes(attempt.state)) return;
    attempt.cancelled = attempt.state === 'STARTING';
    attempt.state = 'STOPPING';
    attempt.revision++;
    trace.push('stop-requested');
  }
  const recorder = {
    // M3/M2 test double. No encoder, byte stream, database or storage is created.
    start(
      participant: PolicyParticipant,
      requestId: string,
      expectedRevision = session.policyRevision,
      callGeneration = participant.callGeneration,
    ) {
      requireHost(participant, expectedRevision, callGeneration);
      const key = JSON.stringify([session.sessionId, participant.auth.userId, requestId]);
      const previous = starts.get(key);
      if (previous) return structuredClone(previous);
      if (attempt && !attempt.released) throw new Error('Attempt is open');
      attempt = {
        recordingId: objectId(500 + ++generation),
        attemptId: randomUUID(),
        generation,
        epoch: session.epoch,
        state: 'STARTING',
        revision: 0,
        captureStartedAt: null,
        deadline: null,
        inputStopped: false,
        cancelled: false,
        failed: false,
        released: false,
      };
      starts.set(key, attempt);
      trace.push('start-requested');
      return structuredClone(attempt);
    },
    captureReady(identity: Identity, revision: number) {
      if (
        !matches(identity) ||
        attempt!.state !== 'STARTING' ||
        attempt!.revision !== revision ||
        session.state !== 'ACTIVE'
      ) {
        trace.push('reject-late-capture');
        return false;
      }
      attempt!.state = 'RECORDING';
      attempt!.captureStartedAt = now;
      attempt!.deadline = now + 10_800_000;
      attempt!.revision++;
      return true;
    },
    stop(
      participant: PolicyParticipant,
      identity: Identity,
      expectedRevision = session.policyRevision,
    ) {
      requireHost(participant, expectedRevision);
      if (!matches(identity)) throw new Error('Stale recording attempt');
      stopInput();
    },
    tick() {
      if (attempt?.deadline !== null && attempt?.deadline !== undefined && now >= attempt.deadline)
        stopInput();
    },
    deadline(identity: Identity, deadline: number) {
      if (!matches(identity) || attempt!.deadline !== deadline || now < deadline) return false;
      stopInput();
      return true;
    },
    inputStopped(identity: Identity) {
      if (!matches(identity) || attempt!.state !== 'STOPPING') return false;
      attempt!.inputStopped = true;
      attempt!.state = attempt!.cancelled || attempt!.failed ? 'FAILED' : 'PROCESSING';
      attempt!.revision++;
      trace.push('input-stopped');
      return true;
    },
    finalized(identity: Identity, storedReceipt: boolean) {
      if (
        !matches(identity) ||
        attempt!.state !== 'PROCESSING' ||
        !attempt!.inputStopped ||
        !storedReceipt ||
        !storageAllowed
      )
        return false;
      attempt!.state = 'READY';
      attempt!.revision++;
      return true;
    },
    release(identity: Identity) {
      if (
        !matches(identity) ||
        !attempt!.inputStopped ||
        !['READY', 'FAILED'].includes(attempt!.state)
      )
        return false;
      attempt!.released = true;
      return true;
    },
    fail() {
      if (attempt && !['READY', 'FAILED'].includes(attempt.state)) {
        attempt.failed = true;
        if (attempt.state === 'PROCESSING') {
          attempt.state = 'FAILED';
          attempt.revision++;
        } else stopInput();
      }
    },
    endCall() {
      session.state = 'ENDING';
      session.hostParticipantId = null;
      stopInput();
    },
    canFinishCall: () => !attempt || attempt.inputStopped,
    denyStorage: () => {
      storageAllowed = false;
    },
    inspect: () => (attempt ? structuredClone(attempt) : null),
    eligibleSources(
      sources: readonly { participantId: string; kind: MediaSource; active: boolean }[],
    ) {
      return sources.filter((source) => {
        const participant = participants.get(source.participantId);
        if (!participant || !source.active || session.state !== 'ACTIVE') return false;
        const input = inputFor(participant);
        const context = resolveSessionPolicyContext(input);
        return (
          context.ok && context.context.scope.type === 'MAIN' && canPublishMedia(input, source.kind)
        );
      });
    },
    trace,
  };
  return {
    session,
    participants,
    a,
    b,
    c,
    prepare,
    commit,
    recorder,
    inputFor,
    makeParticipant,
    returnHost: () => returnHostUserId,
    pausedMics,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
