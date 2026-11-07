import { describe, expect, it } from 'vitest';
import { messagingBudgetSchema } from './budget.js';

// Test-only numbers, not reviewed runtime defaults or a capacity claim.
const fixture = () => ({
  process: { inFlight: 8, queued: 16, bytes: 1024 },
  database: { maxPoolSize: 4, waitQueueTimeoutMs: 100, queryTimeoutMs: 500 },
  revocation: { reservedInFlight: 2, cleanupBatchSize: 4, executionMs: 1000 },
  handlers: {
    text: {
      processInFlight: 6,
      processQueued: 8,
      processBytes: 512,
      perUserInFlight: 1,
      perScopeInFlight: 4,
      payloadBytes: 128,
      queueWaitMs: 100,
      executionMs: 500,
    },
  },
});

describe('handler budget contract', () => {
  it('permits only configured handler classes and allows no waiting queue', () => {
    const value = fixture();
    value.handlers.text.processQueued = 0;
    expect(messagingBudgetSchema.parse(value).handlers.upload).toBeUndefined();
    expect(
      messagingBudgetSchema.safeParse({ ...value, handlers: { typo: value.handlers.text } })
        .success,
    ).toBe(false);
  });

  it.each([0, -1, Infinity, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid finite limit %s',
    (limit) => {
      const value = fixture();
      value.database.maxPoolSize = limit;
      expect(messagingBudgetSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects missing budgets and capacity that consumes the revocation reserve', () => {
    expect(messagingBudgetSchema.safeParse({}).success).toBe(false);
    const value = fixture();
    value.handlers.text.processInFlight = 7;
    expect(messagingBudgetSchema.safeParse(value).success).toBe(false);
  });

  it('rejects per-user, payload and queued budgets exceeding parent capacities', () => {
    for (const change of [
      { perUserInFlight: 7 },
      { perScopeInFlight: 7 },
      { processQueued: 17 },
      { processBytes: 1025 },
      { payloadBytes: 513 },
    ]) {
      const value = fixture();
      Object.assign(value.handlers.text, change);
      expect(messagingBudgetSchema.safeParse(value).success).toBe(false);
    }
  });
});
