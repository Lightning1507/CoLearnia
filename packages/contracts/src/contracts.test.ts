import { describe, expect, it } from 'vitest';
import { createChannelSchema, createWorkspaceSchema } from './workspace.js';

describe('input boundaries', () => {
  it('supports both TEXT and LIVE channels and normalizes names', () => {
    for (const type of ['TEXT', 'LIVE']) {
      expect(
        createChannelSchema.parse({
          name: '  Phòng học  ',
          type,
          requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
        }),
      ).toEqual({
        name: 'Phòng học',
        type,
        accessMode: 'WORKSPACE',
        requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
      });
    }
  });

  it('rejects injected ownership and empty workspace names', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Lớp Web', ownerId: 'attacker' }).success).toBe(
      false,
    );
    expect(createWorkspaceSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
});
