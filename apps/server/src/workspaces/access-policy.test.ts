import { describe, expect, it } from 'vitest';
import { allowsWorkspaceAction, channelPermissions, hasWorkspaceAccess } from './access-policy.js';
import type { ChannelAccessState, WorkspaceAction } from './access-policy.js';
import type { WorkspaceRole } from '@colearnia/contracts';

function state(role: WorkspaceRole = 'MEMBER'): ChannelAccessState {
  return {
    workspace: { id: 'workspace', ownerId: role === 'OWNER' ? 'actor' : 'owner', deleted: false },
    membership: {
      id: 'membership',
      userId: 'actor',
      workspaceId: 'workspace',
      role,
      status: 'ACTIVE',
      incarnation: 2,
      revision: 7,
    },
    channel: {
      id: 'channel',
      workspaceId: 'workspace',
      type: 'TEXT',
      accessMode: 'PRIVATE',
      revision: 9,
      deleted: false,
    },
    grant: null,
  };
}
const roles = ['OWNER', 'ADMIN', 'MEMBER'] as const;
const actions: WorkspaceAction[] = [
  'read',
  'rename',
  'delete',
  'createChannel',
  'manageInvitation',
];
describe('shared Workspace/channel allow and deny matrix', () => {
  it('does not treat a call-host role or legacy channel enum as access authority', () => {
    const current = state();
    current.membership!.role = 'HOST' as WorkspaceRole;
    expect(hasWorkspaceAccess(current, 'actor')).toBe(false);
    current.membership!.role = 'MEMBER';
    current.grant = {
      workspaceId: 'workspace',
      channelId: 'channel',
      membershipId: 'membership',
      membershipIncarnation: 2,
      revoked: false,
    };
    current.channel!.accessMode = 'RESTRICTED' as 'PRIVATE';
    expect(channelPermissions(current, 'actor').canKnowChannel).toBe(false);
  });
  it.each(roles)('%s follows the Workspace action matrix', (role) => {
    const expected =
      role === 'OWNER'
        ? [true, true, true, true, true]
        : role === 'ADMIN'
          ? [true, true, false, true, true]
          : [true, false, false, false, false];
    expect(actions.map((action) => allowsWorkspaceAction(state(role), 'actor', action))).toEqual(
      expected,
    );
  });
  it.each(roles)('%s checks target membership for role changes/removal', (role) => {
    for (const targetRole of roles) {
      const target = {
        ...state(targetRole).membership!,
        userId: targetRole === 'OWNER' ? 'owner' : 'target',
      };
      const owner = role === 'OWNER' && targetRole !== 'OWNER';
      expect(allowsWorkspaceAction(state(role), 'actor', 'changeRole', target)).toBe(owner);
      expect(allowsWorkspaceAction(state(role), 'actor', 'removeMember', target)).toBe(
        owner || (role === 'ADMIN' && targetRole === 'MEMBER'),
      );
    }
    for (const target of [
      undefined,
      state(role).membership!,
      { ...state().membership!, userId: 'other', status: 'REMOVED' as const },
      { ...state().membership!, workspaceId: 'other', userId: 'other' },
    ]) {
      expect(allowsWorkspaceAction(state(role), 'actor', 'changeRole', target)).toBe(false);
      expect(allowsWorkspaceAction(state(role), 'actor', 'removeMember', target)).toBe(false);
    }
  });
  it.each(roles)('%s must hold PRIVATE grant even when able to manage', (role) => {
    for (const type of ['TEXT', 'LIVE'] as const) {
      for (const accessMode of ['WORKSPACE', 'PRIVATE'] as const) {
        for (const granted of [true, false]) {
          const current = state(role);
          current.channel = { ...current.channel!, type, accessMode };
          if (granted)
            current.grant = {
              workspaceId: 'workspace',
              channelId: 'channel',
              membershipId: 'membership',
              membershipIncarnation: 2,
              revoked: false,
            };
          const readable = accessMode === 'WORKSPACE' || granted;
          expect(channelPermissions(current, 'actor')).toEqual({
            canKnowChannel: role !== 'MEMBER' || readable,
            canReadContent: readable,
            canManageChannel: role !== 'MEMBER',
          });
        }
      }
    }
  });
  it('denies revoked, old-incarnation and cross-scope PRIVATE grants', () => {
    const grant = {
      workspaceId: 'workspace',
      channelId: 'channel',
      membershipId: 'membership',
      membershipIncarnation: 2,
      revoked: false,
    };
    for (const delta of [
      { revoked: true },
      { membershipIncarnation: 1 },
      { membershipId: 'another' },
      { workspaceId: 'another' },
      { channelId: 'another' },
    ]) {
      const current = state();
      current.grant = { ...grant, ...delta };
      expect(channelPermissions(current, 'actor').canReadContent).toBe(false);
    }
  });
  it('denies absent/deleted/cross-scope state or an actor mismatch', () => {
    const states: ChannelAccessState[] = [
      { ...state(), workspace: null },
      { ...state(), membership: null },
      { ...state(), workspace: { ...state().workspace!, deleted: true } },
      { ...state(), membership: { ...state().membership!, status: 'REMOVED' } },
      { ...state(), membership: { ...state().membership!, workspaceId: 'other' } },
      { ...state(), membership: { ...state().membership!, userId: 'other' } },
      { ...state('OWNER'), workspace: { ...state().workspace!, ownerId: 'other' } },
    ];
    for (const current of states) {
      expect(hasWorkspaceAccess(current, 'actor')).toBe(false);
      expect(allowsWorkspaceAction(current, 'actor', 'read')).toBe(false);
      expect(channelPermissions(current, 'actor').canKnowChannel).toBe(false);
    }
    for (const channel of [
      null,
      { ...state().channel!, deleted: true },
      { ...state().channel!, workspaceId: 'other' },
    ]) {
      expect(channelPermissions({ ...state('ADMIN'), channel }, 'actor').canKnowChannel).toBe(
        false,
      );
    }
  });
});
