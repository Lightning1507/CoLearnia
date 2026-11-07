import { describe, expect, it } from 'vitest';
import {
  accessCleanupResultSchema,
  accessRevocationSchema,
  changeMemberRoleSchema,
  channelAccessSnapshotSchema,
  channelResponseSchema,
  createChannelSchema,
  createWorkspaceSchema,
  renameChannelSchema,
  workspaceDocumentIdSchema,
} from './workspace.js';

const id = '507f1f77bcf86cd799439011';
const requestId = '1c3b90f0-0c26-4e98-9a60-000000000001';
const mutation = { requestId, expectedRevision: 0 };

describe('Workspace/channel contracts', () => {
  it('accepts all four type/access combinations without coupling privacy to media', () => {
    for (const type of ['TEXT', 'LIVE']) {
      for (const accessMode of ['WORKSPACE', 'PRIVATE']) {
        expect(
          createChannelSchema.parse({ name: '  Học nhóm  ', type, accessMode, requestId }),
        ).toEqual({ name: 'Học nhóm', type, accessMode, requestId });
      }
    }
    expect(
      createChannelSchema.safeParse({
        name: 'c',
        type: 'TEXT',
        accessMode: 'RESTRICTED',
        requestId,
      }).success,
    ).toBe(false);
  });

  it('validates document IDs independently of runtime UUIDs', () => {
    expect(workspaceDocumentIdSchema.safeParse(id.toUpperCase()).success).toBe(true);
    for (const value of [requestId, 'not-an-id', 'g'.repeat(24), 'a'.repeat(23)]) {
      expect(workspaceDocumentIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it('counts name code points and rejects missing operation IDs and injected authority', () => {
    expect(
      createWorkspaceSchema.parse({ name: ` ${'😀'.repeat(80)} `, requestId }).name,
    ).toHaveLength(160);
    expect(createWorkspaceSchema.safeParse({ name: '😀'.repeat(81), requestId }).success).toBe(
      false,
    );
    expect(createWorkspaceSchema.safeParse({ name: 'a', requestId }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'Lớp Web' }).success).toBe(false);
    expect(
      createChannelSchema.safeParse({ name: 'c', type: 'TEXT', requestId, actorId: id }).success,
    ).toBe(false);
  });

  it('rejects immutable channel changes, owner assignment and invalid revisions', () => {
    expect(renameChannelSchema.parse({ name: 'Mới', ...mutation }).expectedRevision).toBe(0);
    for (const extra of [{ type: 'LIVE' }, { accessMode: 'PRIVATE' }]) {
      expect(renameChannelSchema.safeParse({ name: 'Mới', ...mutation, ...extra }).success).toBe(
        false,
      );
    }
    expect(changeMemberRoleSchema.safeParse({ ...mutation, role: 'OWNER' }).success).toBe(false);
    for (const expectedRevision of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, '0']) {
      expect(
        renameChannelSchema.safeParse({ name: 'Mới', ...mutation, expectedRevision }).success,
      ).toBe(false);
    }
  });

  it('keeps management separate from content in the server access snapshot', () => {
    const snapshot = {
      workspaceId: id,
      channelId: id,
      channelType: 'LIVE',
      membershipId: id,
      membershipIncarnation: 2,
      membershipRevision: 3,
      channelRevision: 4,
      canReadContent: false,
      canManageChannel: true,
    };
    expect(channelAccessSnapshotSchema.parse(snapshot).canReadContent).toBe(false);
    expect(
      channelAccessSnapshotSchema.safeParse({ ...snapshot, membershipIncarnation: 0 }).success,
    ).toBe(false);
    // Parsing this structure is not an ACL decision; adapters must recheck current state.
  });

  it('rejects leaked fields from API projections', () => {
    const data = {
      id,
      workspaceId: id,
      name: 'general',
      type: 'TEXT',
      accessMode: 'WORKSPACE',
      revision: 0,
    };
    expect(channelResponseSchema.safeParse({ data, requestId }).success).toBe(true);
    expect(
      channelResponseSchema.safeParse({ data: { ...data, tokenHash: 'example-only' }, requestId })
        .success,
    ).toBe(false);
  });

  it('requires exact revocation targets for all six scopes', () => {
    const base = { operationId: requestId, revision: 1 };
    const targets = [
      { kind: 'AUTH_SESSION', authSessionId: id },
      { kind: 'USER_SESSIONS', userId: id },
      {
        kind: 'WORKSPACE_MEMBERSHIP',
        workspaceId: id,
        userId: id,
        membershipId: id,
        membershipIncarnation: 2,
      },
      {
        kind: 'PRIVATE_CHANNEL',
        workspaceId: id,
        channelId: id,
        userId: id,
        membershipId: id,
        membershipIncarnation: 2,
      },
      { kind: 'CHANNEL_DELETED', workspaceId: id, channelId: id },
      { kind: 'WORKSPACE_DELETED', workspaceId: id },
    ];
    for (const target of targets) {
      expect(accessRevocationSchema.safeParse({ ...base, ...target }).success).toBe(true);
      expect(accessRevocationSchema.safeParse({ ...base, ...target, actorId: id }).success).toBe(
        false,
      );
    }
    expect(
      accessRevocationSchema.safeParse({ ...base, kind: 'PRIVATE_CHANNEL', channelId: id }).success,
    ).toBe(false);
    expect(
      accessRevocationSchema.safeParse({
        ...base,
        kind: 'WORKSPACE_DELETED',
        workspaceId: id,
        channelId: id,
      }).success,
    ).toBe(false);
    expect(
      accessCleanupResultSchema.parse({
        operationId: requestId,
        permissionRevoked: false,
        pendingInvalidated: false,
        cleanupPending: true,
      }).permissionRevoked,
    ).toBe(false);
  });
});
