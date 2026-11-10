import { z } from 'zod';

// Shared transport mapping. Feature-specific codes need their own reviewed contract.
export const commonErrorHttpStatus = {
  INVALID_JSON: 400,
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  CSRF_INVALID: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CALL_ALREADY_ACTIVE: 409,
  EMAIL_EXISTS: 409,
  INVITATION_UNAVAILABLE: 410,
  SESSION_ENDED: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  DEPENDENCY_UNAVAILABLE: 503,
  SERVER_BUSY: 503,
} as const;

export type CommonErrorCode = keyof typeof commonErrorHttpStatus;
export const commonErrorCodeSchema = z.enum(
  Object.keys(commonErrorHttpStatus) as [CommonErrorCode, ...CommonErrorCode[]],
);
