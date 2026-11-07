import { describe, expect, expectTypeOf, it } from 'vitest';
import { accessRevocationSchema, channelAccessSnapshotSchema } from './workspace.js';
import type { AccessRevocation, ChannelAccessSnapshot } from './workspace.js';
import type { ChannelAccessStamp, LiveAccessRevocation } from './session-context.js';
import {
  channelAccessStampSchema,
  liveAccessRevocationSchema,
  liveContextResultSchema,
  sessionCleanupRequestSchema,
  sessionCleanupResultSchema,
} from './session-context.js';

const sessionId = '1'.repeat(24);
const participantId = '2'.repeat(24);
const epoch = '10000000-0000-4000-8000-000000000001';
const groupId = '10000000-0000-4000-8000-000000000002';

const liveContext = {
  auth: {
    userId: '3'.repeat(24),
    authSessionId: '4'.repeat(24),
    expiresAt: '2026-11-07T12:30:00Z',
  },
  access: {
    workspaceId: '5'.repeat(24),
    channelId: '6'.repeat(24),
    channelType: 'LIVE',
    membershipId: '7'.repeat(24),
    membershipIncarnation: 1,
    membershipRevision: 0,
    channelRevision: 0,
    canReadContent: true,
    canManageChannel: false,
  },
  sessionId,
  participantId,
  epoch,
  callGeneration: 2,
  role: 'MEMBER',
  host: { participantId: '8'.repeat(24), userId: '9'.repeat(24) },
  scope: { type: 'MAIN' },
  audienceEpoch: 4,
  policyRevision: 9,
} as const;

const cleanupIdentity = {
  operationId: '10000000-0000-4000-8000-000000000003',
  transitionToken: '10000000-0000-4000-8000-000000000004',
  sessionId,
  epoch,
  callGeneration: 2,
  target: { type: 'PARTICIPANT_SCOPE', participantId, scope: { type: 'MAIN' }, audienceEpoch: 4 },
} as const;

const revocationTargets = [
  { kind: 'AUTH_SESSION', authSessionId: liveContext.auth.authSessionId },
  { kind: 'USER_AUTH_SESSIONS', userId: liveContext.auth.userId },
  {
    kind: 'WORKSPACE_MEMBERSHIP',
    workspaceId: liveContext.access.workspaceId,
    userId: liveContext.auth.userId,
    membershipId: liveContext.access.membershipId,
    membershipIncarnation: 1,
  },
  {
    kind: 'PRIVATE_CHANNEL_ACCESS',
    workspaceId: liveContext.access.workspaceId,
    channelId: liveContext.access.channelId,
    userId: liveContext.auth.userId,
    membershipId: liveContext.access.membershipId,
    membershipIncarnation: 1,
  },
  {
    kind: 'CHANNEL_DELETED',
    workspaceId: liveContext.access.workspaceId,
    channelId: liveContext.access.channelId,
  },
  { kind: 'WORKSPACE_DELETED', workspaceId: liveContext.access.workspaceId },
] as const;

describe('session context and cleanup contracts', () => {
  it('accepts the exact M1 access snapshot including channel-management authority', () => {
    expect(channelAccessStampSchema).toBe(channelAccessSnapshotSchema);
    expectTypeOf<ChannelAccessStamp>().toEqualTypeOf<ChannelAccessSnapshot>();
    for (const canManageChannel of [false, true]) {
      const access = channelAccessSnapshotSchema.parse({ ...liveContext.access, canManageChannel });
      const context = { ...liveContext, access };
      expect(liveContextResultSchema.parse({ ok: true, context })).toEqual({ ok: true, context });
    }
  });

  it('keeps management authority separate from permission to read LIVE content', () => {
    const access = channelAccessSnapshotSchema.parse({
      ...liveContext.access,
      canManageChannel: true,
      canReadContent: false,
    });
    expect(
      liveContextResultSchema.safeParse({ ok: true, context: { ...liveContext, access } }).success,
    ).toBe(false);
    expect(
      liveContextResultSchema.safeParse({
        ok: true,
        context: {
          ...liveContext,
          access: channelAccessSnapshotSchema.parse({ ...liveContext.access, channelType: 'TEXT' }),
        },
      }).success,
    ).toBe(false);
  });

  it('represents the current host for a member and an explicitly unavailable host', () => {
    expect(liveContextResultSchema.parse({ ok: true, context: liveContext })).toEqual({
      ok: true,
      context: liveContext,
    });
    expect(
      liveContextResultSchema.safeParse({ ok: true, context: { ...liveContext, host: null } })
        .success,
    ).toBe(true);
    for (const host of [undefined, { participantId: '8'.repeat(24) }, { userId: '9'.repeat(24) }]) {
      expect(
        liveContextResultSchema.safeParse({ ok: true, context: { ...liveContext, host } }).success,
      ).toBe(false);
    }
  });

  it('uses the shared M1 revocation schema and inferred type directly', () => {
    expect(liveAccessRevocationSchema).toBe(accessRevocationSchema);
    expectTypeOf<LiveAccessRevocation>().toEqualTypeOf<AccessRevocation>();
  });

  it.each(revocationTargets)('accepts the M1 $kind payload without mapping fields', (target) => {
    const payload = accessRevocationSchema.parse({
      operationId: cleanupIdentity.operationId,
      revision: 4,
      ...target,
    });
    expect(liveAccessRevocationSchema.parse(payload)).toEqual(payload);
  });

  it('requires both PRIVATE membership fields and preserves the old incarnation', () => {
    const payload = {
      operationId: cleanupIdentity.operationId,
      revision: 4,
      ...revocationTargets[3],
    };
    const { membershipId, membershipIncarnation, ...unbound } = payload;
    for (const invalid of [
      unbound,
      { ...unbound, membershipId },
      { ...unbound, membershipIncarnation },
      { ...payload, membershipIncarnation: 0 },
    ]) {
      expect(liveAccessRevocationSchema.safeParse(invalid).success).toBe(false);
    }
    expect(liveAccessRevocationSchema.parse(payload)).toEqual(payload);
  });

  it('rejects legacy kinds, injected authority and unsafe shared revisions', () => {
    const payload = {
      operationId: cleanupIdentity.operationId,
      revision: 4,
      ...revocationTargets[3],
    };
    for (const invalid of [
      { ...payload, kind: 'PRIVATE_CHANNEL' },
      {
        operationId: payload.operationId,
        revision: 4,
        kind: 'USER_SESSIONS',
        userId: '3'.repeat(24),
      },
      { ...payload, actorId: liveContext.auth.userId },
      { ...payload, revision: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(liveAccessRevocationSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('accepts a server-resolved LIVE context and confirmed revocation with deferred physical cleanup', () => {
    const resolved = { ok: true, context: liveContext };
    expect(liveContextResultSchema.parse(resolved)).toEqual(resolved);
    expect(
      sessionCleanupRequestSchema.safeParse({ ...cleanupIdentity, reason: 'SCOPE_CHANGED' })
        .success,
    ).toBe(true);
    const result = {
      ...cleanupIdentity,
      outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending: true },
    };
    expect(sessionCleanupResultSchema.parse(result)).toEqual(result);
  });

  it('accepts a deny response without exposing the caller context', () => {
    const denied = { ok: false, errorCode: 'FORBIDDEN' };
    expect(liveContextResultSchema.parse(denied)).toEqual(denied);
    expect(liveContextResultSchema.safeParse({ ...denied, context: liveContext }).success).toBe(
      false,
    );
    expect(
      liveContextResultSchema.safeParse({
        ok: true,
        context: { ...liveContext, access: { ...liveContext.access, canReadContent: false } },
      }).success,
    ).toBe(false);
  });

  it('represents a timeout as unresolved cleanup and rejects conflicting success flags', () => {
    const timeout = {
      ...cleanupIdentity,
      outcome: {
        permissionRevoked: false,
        pendingInvalidated: false,
        cleanupPending: true,
        errorCode: 'DEPENDENCY_UNAVAILABLE',
        retryable: true,
      },
    };
    expect(sessionCleanupResultSchema.parse(timeout)).toEqual(timeout);
    expect(
      sessionCleanupResultSchema.safeParse({
        ...timeout,
        outcome: { ...timeout.outcome, cleanupPending: false },
      }).success,
    ).toBe(false);
    expect(
      sessionCleanupResultSchema.safeParse({
        ...cleanupIdentity,
        outcome: { permissionRevoked: true, pendingInvalidated: false, cleanupPending: false },
      }).success,
    ).toBe(false);
  });

  it('requires an ownership generation for participant cleanup and an audience for scope cleanup of a participant', () => {
    const { callGeneration, ...unbound } = cleanupIdentity;
    expect(
      sessionCleanupRequestSchema.safeParse({ ...unbound, reason: 'SCOPE_CHANGED' }).success,
    ).toBe(false);
    expect(
      sessionCleanupRequestSchema.safeParse({
        ...unbound,
        callGeneration,
        target: { type: 'PARTICIPANT_SCOPE', participantId, scope: { type: 'MAIN' } },
        reason: 'SCOPE_CHANGED',
      }).success,
    ).toBe(false);
    expect(
      sessionCleanupRequestSchema.safeParse({
        ...unbound,
        target: { type: 'SCOPE', scope: { type: 'GROUP', groupId } },
        reason: 'SCOPE_CLOSED',
      }).success,
    ).toBe(true);
  });

  it('requires a round and deadline for ACTIVITY and excludes raw credentials from context', () => {
    const activity = { ...liveContext, scope: { type: 'GROUP', groupId, mode: 'ACTIVITY' } };
    expect(liveContextResultSchema.safeParse({ ok: true, context: activity }).success).toBe(false);
    expect(
      liveContextResultSchema.safeParse({
        ok: true,
        context: { ...liveContext, auth: { ...liveContext.auth, cookie: 'fake-cookie' } },
      }).success,
    ).toBe(false);
  });

  it('limits membership revocation to the exact incarnation and refuses unrelated fields', () => {
    const revoke = {
      kind: 'WORKSPACE_MEMBERSHIP',
      operationId: cleanupIdentity.operationId,
      revision: 4,
      workspaceId: liveContext.access.workspaceId,
      userId: liveContext.auth.userId,
      membershipId: liveContext.access.membershipId,
    };
    expect(liveAccessRevocationSchema.safeParse(revoke).success).toBe(false);
    const target = { ...revoke, membershipIncarnation: 1 };
    expect(liveAccessRevocationSchema.parse(target)).toEqual(target);
    expect(
      liveAccessRevocationSchema.safeParse({ ...target, channelId: liveContext.access.channelId })
        .success,
    ).toBe(false);
  });
});
