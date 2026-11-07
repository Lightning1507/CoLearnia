import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  LiveContext,
  LiveContextRequest,
  LiveContextResult,
  MediaSource,
  SessionScopeRef,
} from '@colearnia/contracts';

// A consistent server-side view captured under the caller's coordination gate.
// Access snapshots must be freshly checked by M1, including runtime revocation barriers.
export type PolicyParticipant = {
  participantId: string;
  displayName: string;
  auth: AuthenticatedContext;
  // Committed participation stamp and freshly checked M1 authority are separate.
  access: ChannelAccessStamp;
  currentAccess: ChannelAccessStamp;
  callGeneration: number;
  audienceEpoch: number;
  connected: boolean;
  blocked: boolean;
  scope: SessionScopeRef;
};

export type PolicyGroup = {
  groupId: string;
  name: string;
  state: 'OPEN' | 'CLOSING' | 'CLOSED';
  rosterParticipantIds: readonly string[];
} & ({ mode: 'DISCUSSION' } | { mode: 'ACTIVITY'; roundId: string });

export type SessionPolicyState = {
  sessionId: string;
  workspaceId: string;
  channelId: string;
  epoch: string;
  state: 'ACTIVE' | 'ENDING' | 'ENDED';
  phase: 'GUIDANCE' | 'ACTIVITY_STARTING' | 'ACTIVITY' | 'ACTIVITY_ENDING';
  policyRevision: number;
  hostParticipantId: string | null;
  helpingGroupId: string | null;
  round: { roundId: string; deadline: string } | null;
  participants: ReadonlyMap<string, Readonly<PolicyParticipant>>;
  groups: ReadonlyMap<string, Readonly<PolicyGroup>>;
};

export type SessionPolicyInput = {
  request: LiveContextRequest;
  access: ChannelAccessStamp;
  session: Readonly<SessionPolicyState>;
  nowMs: number;
};

function unexpired(value: string, nowMs: number): boolean {
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) && deadline > nowMs;
}

function hasLiveAccess(access: ChannelAccessStamp, session: SessionPolicyState): boolean {
  return (
    access.channelType === 'LIVE' &&
    access.canReadContent &&
    access.workspaceId === session.workspaceId &&
    access.channelId === session.channelId
  );
}

function sameAccessStamp(left: ChannelAccessStamp, right: ChannelAccessStamp): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.channelId === right.channelId &&
    left.membershipId === right.membershipId &&
    left.membershipIncarnation === right.membershipIncarnation &&
    left.membershipRevision === right.membershipRevision &&
    left.channelRevision === right.channelRevision
  );
}

function groupIsOpen(group: PolicyGroup, session: SessionPolicyState, nowMs: number): boolean {
  if (group.state !== 'OPEN') return false;
  if (group.mode === 'DISCUSSION') return session.phase === 'GUIDANCE';
  return (
    session.phase === 'ACTIVITY' &&
    session.round !== null &&
    group.roundId === session.round.roundId &&
    unexpired(session.round.deadline, nowMs)
  );
}

function participantScope(
  participant: PolicyParticipant,
  session: SessionPolicyState,
  nowMs: number,
): LiveContext['scope'] | null {
  const isHost = session.hostParticipantId === participant.participantId;
  if (participant.scope.type === 'MAIN') {
    if (isHost && session.helpingGroupId !== null) return null;
    return { type: 'MAIN' };
  }
  const group = session.groups.get(participant.scope.groupId);
  if (!group || !groupIsOpen(group, session, nowMs)) return null;
  if (isHost) {
    if (group.mode !== 'ACTIVITY' || session.helpingGroupId !== group.groupId) return null;
  } else if (!group.rosterParticipantIds.includes(participant.participantId)) {
    return null;
  }
  if (group.mode === 'DISCUSSION') {
    return { type: 'GROUP', groupId: group.groupId, mode: 'DISCUSSION' };
  }
  // groupIsOpen has checked the round and its deadline.
  const round = session.round;
  if (!round) return null;
  return {
    type: 'GROUP',
    groupId: group.groupId,
    mode: 'ACTIVITY',
    roundId: round.roundId,
    deadline: round.deadline,
  };
}

function participantIsAvailable(
  participant: PolicyParticipant,
  session: SessionPolicyState,
  nowMs: number,
): boolean {
  return (
    participant.connected &&
    !participant.blocked &&
    unexpired(participant.auth.expiresAt, nowMs) &&
    hasLiveAccess(participant.access, session) &&
    hasLiveAccess(participant.currentAccess, session) &&
    sameAccessStamp(participant.access, participant.currentAccess)
  );
}

export function resolveSessionPolicyContext(input: SessionPolicyInput): LiveContextResult {
  const { request, access, session, nowMs } = input;
  if (!Number.isFinite(nowMs) || !unexpired(request.auth.expiresAt, nowMs)) {
    return { ok: false, errorCode: 'AUTH_REQUIRED' };
  }
  if (!hasLiveAccess(access, session)) return { ok: false, errorCode: 'FORBIDDEN' };
  if (
    session.state !== 'ACTIVE' ||
    request.sessionId !== session.sessionId ||
    request.epoch !== session.epoch
  ) {
    return { ok: false, errorCode: 'CONFLICT' };
  }
  const participant = [...session.participants.values()].find(
    (candidate) =>
      candidate.auth.userId === request.auth.userId &&
      candidate.auth.authSessionId === request.auth.authSessionId,
  );
  if (
    !participant ||
    !participantIsAvailable(participant, session, nowMs) ||
    participant.callGeneration !== request.callGeneration
  ) {
    return { ok: false, errorCode: 'CONFLICT' };
  }
  if (!sameAccessStamp(participant.access, access)) {
    return { ok: false, errorCode: 'CONFLICT' };
  }
  const scope = participantScope(participant, session, nowMs);
  if (!scope) return { ok: false, errorCode: 'FORBIDDEN' };
  const host = session.hostParticipantId && session.participants.get(session.hostParticipantId);
  const hostAvailable =
    host && participantIsAvailable(host, session, nowMs) && participantScope(host, session, nowMs);
  return {
    ok: true,
    context: {
      auth: { ...request.auth },
      access: { ...access, channelType: 'LIVE', canReadContent: true },
      sessionId: session.sessionId,
      epoch: session.epoch,
      callGeneration: participant.callGeneration,
      participantId: participant.participantId,
      role: hostAvailable && host.participantId === participant.participantId ? 'HOST' : 'MEMBER',
      host: hostAvailable ? { participantId: host.participantId, userId: host.auth.userId } : null,
      scope,
      audienceEpoch: participant.audienceEpoch,
      policyRevision: session.policyRevision,
    },
  };
}

function sameScope(left: SessionScopeRef, right: SessionScopeRef): boolean {
  return (
    left.type === right.type &&
    (left.type === 'MAIN' || (right.type === 'GROUP' && left.groupId === right.groupId))
  );
}

function mayPublish(context: LiveContext, source: MediaSource): boolean {
  const screen = source === 'SCREEN' || source === 'SCREEN_AUDIO';
  return !(screen && context.scope.type === 'GROUP' && context.scope.mode === 'DISCUSSION');
}

export function canPublishMedia(input: SessionPolicyInput, source: MediaSource): boolean {
  const resolved = resolveSessionPolicyContext(input);
  return resolved.ok && mayPublish(resolved.context, source);
}

export function canReceiveMedia(
  input: SessionPolicyInput,
  publisherParticipantId: string,
  source: MediaSource,
): boolean {
  const viewer = resolveSessionPolicyContext(input);
  const publisher = input.session.participants.get(publisherParticipantId);
  if (!viewer.ok || !publisher) return false;
  const sender = resolveSessionPolicyContext({
    ...input,
    request: {
      auth: publisher.auth,
      sessionId: input.session.sessionId,
      epoch: input.session.epoch,
      callGeneration: publisher.callGeneration,
    },
    access: publisher.currentAccess,
  });
  if (!sender.ok || !mayPublish(sender.context, source)) return false;
  if (sameScope(viewer.context.scope, sender.context.scope)) return true;
  return (
    viewer.context.scope.type === 'GROUP' &&
    viewer.context.scope.mode === 'DISCUSSION' &&
    sender.context.scope.type === 'MAIN' &&
    (source === 'SCREEN' || source === 'SCREEN_AUDIO' || sender.context.role === 'HOST')
  );
}

export function canReadScope(input: SessionPolicyInput, scope: SessionScopeRef): boolean {
  const resolved = resolveSessionPolicyContext(input);
  return resolved.ok && sameScope(resolved.context.scope, scope);
}

export function canDrawBoard(input: SessionPolicyInput, scope: SessionScopeRef): boolean {
  const resolved = resolveSessionPolicyContext(input);
  return (
    resolved.ok &&
    sameScope(resolved.context.scope, scope) &&
    (scope.type === 'GROUP' || resolved.context.role === 'HOST')
  );
}

export function canFreezeBoard(input: SessionPolicyInput, scope: SessionScopeRef): boolean {
  return scope.type === 'GROUP' && canReadScope(input, scope);
}

function mayJoinGroup(
  context: LiveContext,
  group: PolicyGroup,
  input: SessionPolicyInput,
): boolean {
  return (
    context.role === 'MEMBER' &&
    context.scope.type === 'MAIN' &&
    groupIsOpen(group, input.session, input.nowMs) &&
    group.rosterParticipantIds.includes(context.participantId)
  );
}

export function canJoinGroup(input: SessionPolicyInput, groupId: string): boolean {
  const resolved = resolveSessionPolicyContext(input);
  const group = input.session.groups.get(groupId);
  return resolved.ok && !!group && mayJoinGroup(resolved.context, group, input);
}

export function canHelpGroup(input: SessionPolicyInput, groupId: string): boolean {
  const resolved = resolveSessionPolicyContext(input);
  const group = input.session.groups.get(groupId);
  return (
    resolved.ok &&
    resolved.context.role === 'HOST' &&
    !!group &&
    group.mode === 'ACTIVITY' &&
    groupIsOpen(group, input.session, input.nowMs)
  );
}

export function projectSessionFor(input: SessionPolicyInput) {
  const resolved = resolveSessionPolicyContext(input);
  if (!resolved.ok) return resolved;
  const context = resolved.context;
  const participants = [...input.session.participants.values()].filter(
    (participant) =>
      participantIsAvailable(participant, input.session, input.nowMs) &&
      participantScope(participant, input.session, input.nowMs) !== null,
  );
  return {
    ok: true as const,
    projection: {
      sessionId: context.sessionId,
      epoch: context.epoch,
      phase: input.session.phase,
      policyRevision: context.policyRevision,
      hostParticipantId: context.host?.participantId ?? null,
      viewer: {
        participantId: context.participantId,
        role: context.role,
        callGeneration: context.callGeneration,
        audienceEpoch: context.audienceEpoch,
        scope: { ...context.scope },
      },
      participants: participants
        .filter((participant) => sameScope(participant.scope, context.scope))
        .map((participant) => ({
          participantId: participant.participantId,
          displayName: participant.displayName,
          role:
            participant.participantId === context.host?.participantId
              ? ('HOST' as const)
              : ('MEMBER' as const),
        })),
      groups: [...input.session.groups.values()]
        .filter((group) => groupIsOpen(group, input.session, input.nowMs))
        .map((group) => ({
          groupId: group.groupId,
          name: group.name,
          mode: group.mode,
          memberCount: participants.filter(
            (participant) =>
              participant.participantId !== input.session.hostParticipantId &&
              participant.scope.type === 'GROUP' &&
              participant.scope.groupId === group.groupId,
          ).length,
          canJoin: mayJoinGroup(context, group, input),
        })),
      permissions: {
        publishMic: mayPublish(context, 'MIC'),
        publishCamera: mayPublish(context, 'CAMERA'),
        publishScreen: mayPublish(context, 'SCREEN'),
        readBoard: true,
        drawBoard: context.scope.type === 'GROUP' || context.role === 'HOST',
        freezeBoard: context.scope.type === 'GROUP',
      },
    },
  };
}
