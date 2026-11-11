import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sessionEndInputSchema, sessionEndAckSchema } from './session-end.js';

const command = {
  requestId: randomUUID(),
  sessionId: '100000000000000000000001',
  epoch: randomUUID(),
  callGeneration: 1,
  expectedPolicyRevision: 0,
  action: 'END',
};
describe('session end contracts', () => {
  it.each(['END', 'HOST_LEAVE'])('accepts explicit host action %s', (action) => {
    expect(sessionEndInputSchema.safeParse({ ...command, action }).success).toBe(true);
  });
  it.each([
    { userId: 'forged' },
    { host: true },
    { action: 'DISCONNECTED' },
    { callGeneration: 0 },
    { expectedPolicyRevision: -1 },
  ])('refuses forged or stale-shaped input %j', (fields) => {
    expect(sessionEndInputSchema.safeParse({ ...command, ...fields }).success).toBe(false);
  });
  it('cannot report completed while state is ENDING', () => {
    expect(
      sessionEndAckSchema.safeParse({
        requestId: command.requestId,
        data: {
          status: 'completed',
          result: {
            sessionId: command.sessionId,
            epoch: command.epoch,
            state: 'ENDING',
            cleanupPending: true,
          },
        },
      }).success,
    ).toBe(false);
  });
});
