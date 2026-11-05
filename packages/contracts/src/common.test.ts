import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, apiResponseSchema, commandAckSchema } from './common.js';
import { commonErrorCodeSchema, commonErrorHttpStatus } from './errors.js';

const requestId = '1c3b90f0-0c26-4e98-9a60-000000000001';
const resultSchema = z.strictObject({ id: z.string() });

describe('shared API contracts', () => {
  it('shares an explicit code/status mapping and rejects unknown common codes', () => {
    expect(commonErrorHttpStatus.CONFLICT).toBe(409);
    expect(commonErrorHttpStatus.RATE_LIMITED).toBe(429);
    expect(commonErrorCodeSchema.parse('AUTH_REQUIRED')).toBe('AUTH_REQUIRED');
    expect(commonErrorCodeSchema.safeParse('DATABASE_SECRET_ERROR').success).toBe(false);
  });

  it('validates command success data and rejects ambiguous success/error envelopes', () => {
    const schema = commandAckSchema(resultSchema);
    expect(schema.safeParse({ data: { id: 'group-id' }, requestId }).success).toBe(true);
    expect(schema.safeParse({ data: { wrong: true }, requestId }).success).toBe(false);
    expect(
      schema.safeParse({
        data: { id: 'group-id' },
        error: { code: 'CONFLICT', message: 'Đã đổi.' },
        requestId,
      }).success,
    ).toBe(false);
    expect(apiResponseSchema(z.null()).safeParse({ data: null, requestId }).success).toBe(true);
  });

  it('supports validation feedback and bounded-shape retry hints without raw extra fields', () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Kiểm tra dữ liệu.',
        fieldErrors: [{ field: 'name', message: 'Tên không hợp lệ.' }],
      },
      requestId,
    };
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(apiErrorSchema.safeParse({ ...body, stack: 'private' }).success).toBe(false);
    expect(
      apiErrorSchema.safeParse({ ...body, error: { ...body.error, password: 'private' } }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({ ...body, error: { ...body.error, retryAfterMs: -1 } }).success,
    ).toBe(false);
    expect(apiErrorSchema.safeParse({ ...body, requestId: 'invalid' }).success).toBe(false);
    expect(
      commandAckSchema(resultSchema).safeParse({
        error: { code: 'RATE_LIMITED', message: 'Chờ rồi thử lại.', retryAfterMs: 1000 },
        requestId,
      }).success,
    ).toBe(true);
  });
});
