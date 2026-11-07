import { describe, expect, it } from 'vitest';
import { liveContextSchema } from '@colearnia/contracts';
import type {
  GeneralConversationFactory,
  MessagingAccessPort,
  MessagingAuthorization,
  MessagingRevocationPort,
} from './ports.js';
import { isMessagingAuthorizationCurrent } from './ports.js';

const now = Date.parse('2026-11-07T10:00:00Z');
const authorization = (): MessagingAuthorization => ({
  auth: {
    userId: '000000000000000000000001',
    authSessionId: '000000000000000000000002',
    expiresAt: '2026-11-07T11:00:00Z',
  },
  workspaceId: '000000000000000000000003',
  conversationId: '000000000000000000000004',
  memberships: [{ membershipId: '000000000000000000000005', incarnation: 1, revision: 0 }],
  channel: { channelId: '000000000000000000000006', revision: 0 },
  runtime: null,
});

describe('SCRUM-14 consumer fixture (not a production ACL provider)', () => {
  it('shares the exact M1 transaction and stable IDs with the general factory', async () => {
    const dbSession = { testTransaction: Symbol('M1') };
    const calls: unknown[] = [];
    const factory: GeneralConversationFactory<typeof dbSession> = {
      async create(input) {
        expect(input.dbSession).toBe(dbSession);
        calls.push(input);
        return { conversationId: input.conversationId };
      },
    };
    const input = {
      workspaceId: authorization().workspaceId,
      channelId: authorization().channel!.channelId,
      conversationId: authorization().conversationId,
      createdAt: new Date(now),
      dbSession,
    };
    expect(await factory.create(input)).toEqual({ conversationId: input.conversationId });
    expect(calls).toHaveLength(1);
  });

  it('requires fresh authorization and rejects work issued before revoke/re-add', async () => {
    const pending = authorization();
    let allowed = true;
    let current = authorization();
    const access: MessagingAccessPort = {
      async authorize({ actor }) {
        if (actor.authSessionId !== current.auth.authSessionId) {
          return { ok: false, code: 'AUTH_REQUIRED' };
        }
        return allowed ? { ok: true, value: current } : { ok: false, code: 'NOT_FOUND' };
      },
    };
    const request = {
      actor: pending.auth,
      target: {
        kind: 'CHANNEL' as const,
        workspaceId: pending.workspaceId,
        conversationId: pending.conversationId,
      },
      action: 'send' as const,
      signal: new AbortController().signal,
    };
    expect((await access.authorize(request)).ok).toBe(true);
    allowed = false; // M1 barrier denies before cleanup starts.
    expect(await access.authorize(request)).toEqual({ ok: false, code: 'NOT_FOUND' });
    current = { ...authorization(), channel: { ...pending.channel!, revision: 2 } };
    allowed = true; // Explicit re-add permits new operations/history, not the old pending one.
    const result = await access.authorize(request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Fixture should allow new operations.');
    expect(isMessagingAuthorizationCurrent(pending, result.value, now)).toBe(false);
    expect(isMessagingAuthorizationCurrent(result.value, result.value, now)).toBe(true);
  });

  it('reports blocked cleanup and fences retries from newer resources', async () => {
    const resources = new Set([1, 2]);
    let fail = true;
    const cleanup: MessagingRevocationPort = {
      fence() {
        return { throughResourceGeneration: 2 };
      },
      async revoke(input) {
        if (fail)
          return { status: 'blocked', revocationId: input.revocationId, retryRequired: true };
        for (const generation of resources) {
          if (generation <= input.throughResourceGeneration) resources.delete(generation);
        }
        return { status: 'completed', revocationId: input.revocationId };
      },
    };
    const input = {
      revocationId: 'fixture-revoke-1',
      target: { kind: 'USER' as const, userId: authorization().auth.userId },
      ...cleanup.fence({
        revocationId: 'fixture-revoke-1',
        target: { kind: 'USER', userId: authorization().auth.userId },
      }),
      deadlineMs: now + 1000,
      signal: new AbortController().signal,
    };
    expect((await cleanup.revoke(input)).status).toBe('blocked');
    fail = false;
    resources.add(3); // A separately authorized new registration after explicit re-add.
    expect((await cleanup.revoke(input)).status).toBe('completed');
    await cleanup.revoke(input);
    expect([...resources]).toEqual([3]);
  });
});

describe('pending authorization freshness', () => {
  it.each([
    {
      scenario: 'host changes',
      host: { participantId: '5'.repeat(24), userId: '6'.repeat(24) },
      revisionDelta: 1,
    },
    {
      scenario: 'original host returns',
      host: { participantId: '3'.repeat(24), userId: '4'.repeat(24) },
      revisionDelta: 2,
    },
    { scenario: 'host unavailable', host: null, revisionDelta: 1 },
  ])(
    'invalidates pending host-private work when $scenario after an await',
    async ({ host, revisionDelta }) => {
      const member = authorization();
      const context = liveContextSchema.parse({
        auth: member.auth,
        access: {
          workspaceId: member.workspaceId,
          channelId: member.channel!.channelId,
          channelType: 'LIVE',
          membershipId: member.memberships[0].membershipId,
          membershipIncarnation: 1,
          membershipRevision: 0,
          channelRevision: 0,
          canReadContent: true,
          canManageChannel: false,
        },
        sessionId: '1'.repeat(24),
        participantId: '2'.repeat(24),
        epoch: '10000000-0000-4000-8000-000000000001',
        callGeneration: 1,
        role: 'MEMBER',
        host: { participantId: '3'.repeat(24), userId: '4'.repeat(24) },
        scope: { type: 'MAIN' },
        audienceEpoch: 0,
        policyRevision: 9,
      });
      const pending = {
        ...member,
        runtime: {
          sessionId: context.sessionId,
          epoch: context.epoch,
          callGeneration: context.callGeneration,
          policyRevision: context.policyRevision,
          scope: { type: 'MAIN' as const },
          deadlineMs: null,
        },
      };
      expect(isMessagingAuthorizationCurrent(pending, pending, now)).toBe(true);
      const resumed = await Promise.resolve(
        liveContextSchema.parse({
          ...context,
          host,
          policyRevision: context.policyRevision + revisionDelta,
        }),
      );
      const current = {
        ...pending,
        runtime: { ...pending.runtime, policyRevision: resumed.policyRevision },
      };
      expect(isMessagingAuthorizationCurrent(pending, current, now)).toBe(false);
    },
  );

  it('accepts unchanged authority and rejects expired auth at the boundary', () => {
    const stamp = authorization();
    expect(isMessagingAuthorizationCurrent(stamp, stamp, now)).toBe(true);
    expect(isMessagingAuthorizationCurrent(stamp, stamp, Date.parse(stamp.auth.expiresAt))).toBe(
      false,
    );
    expect(isMessagingAuthorizationCurrent(stamp, stamp, Number.NaN)).toBe(false);
  });

  it.each(['incarnation', 'revision'] as const)('rejects a changed membership %s', (field) => {
    const pending = authorization();
    const current = authorization();
    current.memberships[0][field]++;
    expect(isMessagingAuthorizationCurrent(pending, current, now)).toBe(false);
  });

  it('checks both DIRECT memberships without depending on array ordering', () => {
    const pending = authorization();
    pending.channel = null;
    const other = { membershipId: '000000000000000000000007', incarnation: 1, revision: 0 };
    pending.memberships = [pending.memberships[0], other];
    const current = { ...pending, memberships: [other, pending.memberships[0]] as const };
    expect(isMessagingAuthorizationCurrent(pending, current, now)).toBe(true);
    current.memberships = [{ ...other, incarnation: 2 }, pending.memberships[0]];
    expect(isMessagingAuthorizationCurrent(pending, current, now)).toBe(false);
  });

  it('rejects expired ACTIVITY after DB await and old connection/runtime revisions', () => {
    const pending = authorization();
    pending.runtime = {
      sessionId: '000000000000000000000008',
      epoch: 'a899eb72-cf74-4818-8ecf-36572ea2359c',
      callGeneration: 1,
      policyRevision: 0,
      scope: { type: 'GROUP', groupId: 'b899eb72-cf74-4818-8ecf-36572ea2359c' },
      deadlineMs: now + 1000,
    };
    expect(isMessagingAuthorizationCurrent(pending, pending, now + 1000)).toBe(false);
    for (const change of [{ callGeneration: 2 }, { policyRevision: 1 }, { epoch: 'new-epoch' }]) {
      const current = { ...pending, runtime: { ...pending.runtime, ...change } };
      expect(isMessagingAuthorizationCurrent(pending, current, now)).toBe(false);
    }
  });
});
