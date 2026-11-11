import { describe, expect, it } from 'vitest';
import { sessionMetadataPageSchema, sessionMetadataQuerySchema } from './session-metadata.js';

describe('session metadata query contract', () => {
  it('defaults to 20 items and permits at most 50', () => {
    expect(sessionMetadataQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(sessionMetadataQuerySchema.parse({ limit: 50 })).toEqual({ limit: 50 });
  });
  it.each([0, -1, 51, 1.5, '20', NaN, Infinity])('rejects invalid page size %s', (limit) => {
    expect(sessionMetadataQuerySchema.safeParse({ limit }).success).toBe(false);
  });
  it('rejects arbitrary DB filters and private metadata in public pages', () => {
    expect(sessionMetadataQuerySchema.safeParse({ filter: { userId: 'spoofed' } }).success).toBe(
      false,
    );
    expect(
      sessionMetadataPageSchema.safeParse({ items: [], nextCursor: null, participants: [] })
        .success,
    ).toBe(false);
  });
});
