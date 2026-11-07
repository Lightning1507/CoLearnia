import type { AuthenticatedContext, SessionScopeRef } from '@colearnia/contracts';

// Server-only ports for SCRUM-14. Never deserialize these authorities from a client.
export type MessagingFailure =
  'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'DEPENDENCY_UNAVAILABLE';
export type PortResult<T> = { ok: true; value: T } | { ok: false; code: MessagingFailure };

export type MessagingTarget =
  | { kind: 'CHANNEL' | 'DIRECT'; workspaceId: string; conversationId: string }
  | {
      kind: 'SESSION' | 'GROUP' | 'HOST_PRIVATE';
      workspaceId: string;
      conversationId: string;
      sessionId: string;
      epoch: string;
      callGeneration: number;
      expectedPolicyRevision: number;
      scope: SessionScopeRef;
    };

export type MembershipVersion = {
  membershipId: string;
  incarnation: number;
  revision: number;
};

// A freshness stamp, never an ACL grant. M1/M4 must authorize before issuing it.
export type MessagingAuthorization = {
  auth: AuthenticatedContext;
  workspaceId: string;
  conversationId: string;
  memberships: readonly [MembershipVersion] | readonly [MembershipVersion, MembershipVersion];
  channel: { channelId: string; revision: number } | null;
  runtime: {
    sessionId: string;
    epoch: string;
    callGeneration: number;
    policyRevision: number;
    scope: SessionScopeRef;
    // ACTIVITY deadline in Unix milliseconds; null for scopes without a countdown.
    deadlineMs: number | null;
  } | null;
};

export interface MessagingAccessPort {
  // M1 revalidates auth/Workspace/channel and both DIRECT memberships.
  // M4 additionally resolves runtime membership/scope/host/deadline when applicable.
  authorize(input: {
    actor: AuthenticatedContext;
    target: MessagingTarget;
    action: 'read' | 'send' | 'subscribe' | 'download';
    signal: AbortSignal;
  }): Promise<PortResult<MessagingAuthorization>>;
}

export interface GeneralConversationFactory<TDbSession> {
  // M1 owns the transaction and IDs. M2 only inserts CHANNEL using this exact session.
  create(input: {
    workspaceId: string;
    channelId: string;
    conversationId: string;
    createdAt: Date;
    dbSession: TDbSession;
  }): Promise<{ conversationId: string }>;
}

export type MessagingRevocationTarget =
  | { kind: 'AUTH_SESSION'; userId: string; authSessionId: string }
  | { kind: 'USER'; userId: string }
  | { kind: 'WORKSPACE'; workspaceId: string; userId: string | null }
  | { kind: 'CHANNEL'; workspaceId: string; channelId: string; userId: string | null }
  | {
      kind: 'RUNTIME';
      sessionId: string;
      epoch: string;
      scope: SessionScopeRef;
      userId: string | null;
      // Highest old policy revision being revoked; retries must not close newer resources.
      throughPolicyRevision: number;
    };

export interface MessagingRevocationPort {
  // Synchronous registration fence/watermark, called under M1/M4 shared coordination
  // after deny is installed. Same ID/target must return the same watermark on retry.
  fence(input: { revocationId: string; target: MessagingRevocationTarget }): {
    throughResourceGeneration: number;
  };
  // Called by M1/M4 only after installing the shared deny barrier.
  // Repeating the same revocation must be safe; it never grants access.
  revoke(input: {
    revocationId: string;
    target: MessagingRevocationTarget;
    // Server registry watermark captured with the barrier; cleanup never touches later resources.
    throughResourceGeneration: number;
    deadlineMs: number;
    signal: AbortSignal;
  }): Promise<
    | { status: 'completed'; revocationId: string }
    | { status: 'blocked'; revocationId: string; retryRequired: true }
  >;
}

// Compare a pending operation against a newly authorized snapshot, under the shared gate.
// This helper neither queries ACL nor makes a previously issued snapshot authoritative.
export function isMessagingAuthorizationCurrent(
  pending: MessagingAuthorization,
  current: MessagingAuthorization,
  nowMs: number,
): boolean {
  if (!Number.isFinite(nowMs)) return false;
  const expiresAt = Date.parse(current.auth.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
  const membershipKey = (values: MessagingAuthorization['memberships']) =>
    values.map((value) => `${value.membershipId}:${value.incarnation}:${value.revision}`).sort();
  const scopeKey = (scope: SessionScopeRef) =>
    scope.type === 'MAIN' ? ['MAIN'] : ['GROUP', scope.groupId];
  const key = (value: MessagingAuthorization) => [
    value.auth.userId,
    value.auth.authSessionId,
    value.auth.expiresAt,
    value.workspaceId,
    value.conversationId,
    membershipKey(value.memberships),
    value.channel && [value.channel.channelId, value.channel.revision],
    value.runtime && [
      value.runtime.sessionId,
      value.runtime.epoch,
      value.runtime.callGeneration,
      value.runtime.policyRevision,
      scopeKey(value.runtime.scope),
      value.runtime.deadlineMs,
    ],
  ];
  const deadline = current.runtime?.deadlineMs;
  if (deadline != null && (!Number.isFinite(deadline) || deadline <= nowMs)) return false;
  return JSON.stringify(key(pending)) === JSON.stringify(key(current));
}
