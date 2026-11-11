import { randomUUID } from 'node:crypto';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  LiveAccessRevocation,
} from '@colearnia/contracts';
import { describe, expect, it } from 'vitest';
import { matchesMainRevocation } from './main-revocation.js';

const id = (n: number) => String(n).padStart(24, '0');
const auth: AuthenticatedContext = {
  userId: id(1),
  authSessionId: id(2),
  expiresAt: '2026-11-12T00:00:00.000Z',
};
const access: ChannelAccessStamp = {
  workspaceId: id(3),
  channelId: id(4),
  channelType: 'LIVE',
  membershipId: id(5),
  membershipIncarnation: 1,
  membershipRevision: 1,
  channelRevision: 1,
  canReadContent: true,
  canManageChannel: false,
};
const base = { operationId: randomUUID(), revision: 1 };
const events: LiveAccessRevocation[] = [
  { ...base, kind: 'AUTH_SESSION', authSessionId: auth.authSessionId },
  { ...base, kind: 'USER_AUTH_SESSIONS', userId: auth.userId },
  {
    ...base,
    kind: 'WORKSPACE_MEMBERSHIP',
    workspaceId: access.workspaceId,
    userId: auth.userId,
    membershipId: access.membershipId,
    membershipIncarnation: 1,
  },
  {
    ...base,
    kind: 'PRIVATE_CHANNEL_ACCESS',
    workspaceId: access.workspaceId,
    channelId: access.channelId,
    userId: auth.userId,
    membershipId: access.membershipId,
    membershipIncarnation: 1,
  },
  {
    ...base,
    kind: 'CHANNEL_DELETED',
    workspaceId: access.workspaceId,
    channelId: access.channelId,
  },
  { ...base, kind: 'WORKSPACE_DELETED', workspaceId: access.workspaceId },
];
const cohort = new Set([auth.authSessionId]);
describe('M1 revocation target matching', () => {
  it.each(events)('matches committed target $kind', (event) => {
    expect(matchesMainRevocation(event, auth, access, cohort)).toBe(true);
  });
  it.each(events.slice(2))('never applies $kind to another workspace', (event) => {
    expect(matchesMainRevocation(event, auth, { ...access, workspaceId: id(99) }, cohort)).toBe(
      false,
    );
  });
  it.each(
    events.filter(
      (event) => event.kind === 'WORKSPACE_MEMBERSHIP' || event.kind === 'PRIVATE_CHANNEL_ACCESS',
    ),
  )('does not revoke a newer membership incarnation for $kind', (event) => {
    expect(
      matchesMainRevocation(event, auth, { ...access, membershipIncarnation: 2 }, cohort),
    ).toBe(false);
    expect(matchesMainRevocation(event, auth, { ...access, membershipId: id(99) }, cohort)).toBe(
      false,
    );
    expect(matchesMainRevocation(event, { ...auth, userId: id(99) }, access, cohort)).toBe(false);
  });
  it.each(
    events.filter(
      (event) => event.kind === 'CHANNEL_DELETED' || event.kind === 'PRIVATE_CHANNEL_ACCESS',
    ),
  )('does not apply $kind to another channel or a newer channel revision', (event) => {
    expect(matchesMainRevocation(event, auth, { ...access, channelId: id(99) }, cohort)).toBe(
      false,
    );
    expect(matchesMainRevocation(event, auth, { ...access, channelRevision: 2 }, cohort)).toBe(
      false,
    );
  });
  it('keeps a newer membership revision outside the stale removal', () => {
    expect(
      matchesMainRevocation(events[2]!, auth, { ...access, membershipRevision: 2 }, cohort),
    ).toBe(false);
  });
  it('does not treat an uncaptured later login as part of an earlier logout-all', () => {
    expect(
      matchesMainRevocation(events[1]!, { ...auth, authSessionId: id(99) }, access, cohort),
    ).toBe(false);
  });
});
