import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sessionJoinInputSchema, sessionJoinTicketInputSchema } from './session-join.js';

describe('MAIN join input contracts', () => {
  it('accepts a ticket request and an explicit takeover generation', () => {
    const requestId = randomUUID();
    expect(sessionJoinTicketInputSchema.parse({ requestId })).toEqual({ requestId });
    expect(
      sessionJoinInputSchema.safeParse({
        requestId,
        ticket: 'opaque-ticket',
        takeover: { confirmed: true, expectedCallGeneration: 1 },
      }).success,
    ).toBe(true);
  });
  it.each([
    { actorId: 'spoofed' },
    { sessionId: 'spoofed' },
    { callGeneration: 1 },
    { takeover: { confirmed: false, expectedCallGeneration: 1 } },
    { takeover: { confirmed: true, expectedCallGeneration: 0 } },
    { takeover: { confirmed: true } },
    { ticket: '' },
    { ticket: 'x'.repeat(513) },
  ])('rejects invalid or client-authoritative fields %j', (fields) => {
    expect(
      sessionJoinInputSchema.safeParse({
        requestId: randomUUID(),
        ticket: 'opaque-ticket',
        ...fields,
      }).success,
    ).toBe(false);
  });
});
