import { describe, expect, it } from 'vitest';
import { sessionCleanupRequestSchema, sessionCleanupResultSchema } from './session-context.js';

const identity = {
  operationId: '20000000-0000-4000-8000-000000000001',
  sessionId: '1'.repeat(24),
  epoch: '20000000-0000-4000-8000-000000000002',
  transitionToken: '20000000-0000-4000-8000-000000000003',
  callGeneration: 2,
  target: {
    type: 'PARTICIPANT_SCOPE',
    participantId: '2'.repeat(24),
    scope: { type: 'MAIN' },
    audienceEpoch: 4,
  },
} as const;

const scopeChange = { ...identity, reason: 'SCOPE_CHANGED' } as const;
const confirmed = { permissionRevoked: true, pendingInvalidated: true, cleanupPending: true };

describe('SCRUM-56 media cleanup review fixtures', () => {
  it('echoes the old audience and confirms revocation with physical cleanup still pending', () => {
    expect(sessionCleanupRequestSchema.parse(scopeChange)).toEqual(scopeChange);
    const ack = { ...identity, outcome: confirmed };
    expect(sessionCleanupResultSchema.parse(ack)).toEqual(ack);
  });

  it('reports a timed-out Consumer creation as unresolved cleanup', () => {
    const timeout = {
      ...identity,
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
        outcome: { ...confirmed, pendingInvalidated: false },
      }).success,
    ).toBe(false);
  });

  it.each([
    ['transition token', { transitionToken: '20000000-0000-4000-8000-000000000004' }],
    ['ownership generation', { callGeneration: 3 }],
    ['audience epoch', { target: { ...identity.target, audienceEpoch: 5 } }],
  ])('distinguishes a late ack from a current transition with a different %s', (_, changed) => {
    const late = sessionCleanupResultSchema.parse({ ...identity, outcome: confirmed });
    const currentIdentity = { ...identity, ...changed };
    sessionCleanupRequestSchema.parse({ ...currentIdentity, reason: scopeChange.reason });

    // The wire shape is valid, but the coordinator must compare identity before applying an ack.
    expect(late).not.toMatchObject(currentIdentity);
  });
});
