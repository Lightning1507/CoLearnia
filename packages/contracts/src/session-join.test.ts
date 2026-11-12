import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  sessionJoinInputSchema,
  sessionJoinTicketInputSchema,
  sessionResumeInputSchema,
} from './session-join.js';

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

describe('MAIN resume input', () => {
  const input = () => ({
    requestId: randomUUID(),
    sessionId: '1'.repeat(24),
    epoch: randomUUID(),
    callGeneration: 1,
    resumeTicket: 't'.repeat(43),
  });
  it('requires the previous generation and an opaque resume ticket', () => {
    expect(sessionResumeInputSchema.safeParse(input()).success).toBe(true);
  });
  it.each([
    { callGeneration: 0 },
    { resumeTicket: '' },
    { resumeTicket: 'x'.repeat(44) },
    { resumeTicket: '!'.repeat(43) },
    { epoch: 'stale' },
    { actorId: 'spoofed' },
    { expectedPolicyRevision: 0 },
  ])('rejects invalid authority or lifecycle fields %j', (fields) => {
    expect(sessionResumeInputSchema.safeParse({ ...input(), ...fields }).success).toBe(false);
  });
});
