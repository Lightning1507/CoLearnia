import { describe, expect, it } from 'vitest';
import { createChannelSchema, createWorkspaceSchema } from './workspace.js';
import { sessionCommandEnvelopeSchema } from './session.js';

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

  it('rejects session commands without a valid generation and revision', () => {
    expect(
      sessionCommandEnvelopeSchema.safeParse({
        requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
        sessionId: 'session',
        epoch: 'epoch',
        callGeneration: 0,
        expectedPolicyRevision: -1,
        payload: {},
      }).success,
    ).toBe(false);
  });
});
