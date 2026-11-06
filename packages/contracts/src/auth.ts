import { z } from 'zod';
import { apiResponseSchema, requestIdSchema } from './common.js';

// SCRUM-12: review the accompanying contract with M4 before consumer adoption.
// Do not replace resourceIdSchema globally; Workspace IDs belong to SCRUM-13.
const authDocumentIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
const authExpiresAtSchema = z.iso.datetime();
const avatarUrlSchema = z.url({ protocol: /^https$/ }).nullable();

export const authInputLimits = {
  displayNameMin: 1,
  displayNameMax: 80,
  newPasswordMin: 15,
  passwordMax: 128,
  emailMax: 254,
} as const;

// Count Unicode code points, not UTF-16 code units. Never transform passwords.
const codePointString = (min: number, max: number) =>
  z.string().refine((value) => {
    const length = [...value].length;
    return length >= min && length <= max;
  }, `Độ dài phải từ ${min} đến ${max} ký tự.`);

export const displayNameSchema = z
  .string()
  .trim()
  .pipe(codePointString(authInputLimits.displayNameMin, authInputLimits.displayNameMax));
export const authEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(authInputLimits.emailMax));
export const newPasswordSchema = codePointString(
  authInputLimits.newPasswordMin,
  authInputLimits.passwordMax,
);
// Existing credentials are verified as entered, not against new-password minimums.
const existingPasswordSchema = codePointString(1, authInputLimits.passwordMax);

export const registerInputSchema = z.strictObject({
  email: authEmailSchema,
  password: newPasswordSchema,
  displayName: displayNameSchema,
});
export const loginInputSchema = z.strictObject({
  email: authEmailSchema,
  password: existingPasswordSchema,
});
export const logoutInputSchema = z.strictObject({});
export const updateProfileInputSchema = z.strictObject({
  displayName: displayNameSchema,
  requestId: requestIdSchema,
});
export const changePasswordInputSchema = z.strictObject({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
  requestId: requestIdSchema,
});

// Safe identity projection for consumers; this is not proof of permission to read it.
export const userSummarySchema = z.strictObject({
  id: authDocumentIdSchema,
  displayName: z.string().min(1),
  avatarUrl: avatarUrlSchema,
});

// Email is included only in the authenticated user's own profile.
export const ownUserSchema = userSummarySchema.extend({ email: z.string().min(1) });
export const csrfDataSchema = z.strictObject({ csrfToken: z.string().min(1) });
export const authenticatedDataSchema = z.strictObject({
  user: ownUserSchema,
  expiresAt: authExpiresAtSchema,
  csrfToken: z.string().min(1),
});

export const csrfResponseSchema = apiResponseSchema(csrfDataSchema);
export const authenticatedResponseSchema = apiResponseSchema(authenticatedDataSchema);
export const ownUserResponseSchema = apiResponseSchema(ownUserSchema);
export const authMutationResponseSchema = apiResponseSchema(z.null());

// Created by requireAuth on the server, never accepted from an HTTP/socket payload.
export const authenticatedContextSchema = z.strictObject({
  userId: authDocumentIdSchema,
  authSessionId: authDocumentIdSchema,
  expiresAt: authExpiresAtSchema,
});

export type UserSummary = z.infer<typeof userSummarySchema>;
export type OwnUser = z.infer<typeof ownUserSchema>;
export type AuthenticatedData = z.infer<typeof authenticatedDataSchema>;
export type AuthenticatedContext = z.infer<typeof authenticatedContextSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
