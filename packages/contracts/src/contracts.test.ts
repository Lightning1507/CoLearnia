import { describe, expect, it } from 'vitest';
import { createChannelSchema, createWorkspaceSchema } from './workspace.js';

describe('input boundaries', () => {
  it('supports both TEXT and LIVE channels and normalizes names', () => {
    for (const type of ['TEXT', 'LIVE']) {
      expect(createChannelSchema.parse({ name: '  Phòng học  ', type })).toEqual({
        name: 'Phòng học',
        type,
        accessMode: 'WORKSPACE',
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
