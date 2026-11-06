import { describe, expect, it } from 'vitest';
import {
  authenticatedContextSchema,
  authenticatedResponseSchema,
  authMutationResponseSchema,
  ownUserResponseSchema,
  userSummarySchema,
  registerInputSchema,
  loginInputSchema,
  updateProfileInputSchema,
  changePasswordInputSchema,
  logoutInputSchema,
} from './auth.js';

const requestId = '1c3b90f0-0c26-4e98-9a60-000000000001';
const user = {
  id: '507f1f77bcf86cd799439011',
  email: 'quan@example.com',
  displayName: 'Quân',
  avatarUrl: null,
};
const auth = {
  user,
  expiresAt: '2026-11-13T02:00:00.000Z',
  csrfToken: 'example-csrf-token',
};

describe('auth/profile input contracts', () => {
  const registration = {
    email: ' Quan+web@Example.com ',
    password: ' hoc cung nhom web 2026 ',
    displayName: ' Quân ',
  };

  it('normalizes email/name while preserving password bytes and email tags', () => {
    expect(registerInputSchema.parse(registration)).toEqual({
      email: 'quan+web@example.com',
      password: registration.password,
      displayName: 'Quân',
    });
  });

  it('counts code points at the name and new-password limits', () => {
    for (const length of [1, 80]) {
      expect(
        registerInputSchema.safeParse({ ...registration, displayName: '😀'.repeat(length) })
          .success,
      ).toBe(true);
    }
    for (const displayName of [' ', '😀'.repeat(81)]) {
      expect(registerInputSchema.safeParse({ ...registration, displayName }).success).toBe(false);
    }
    for (const length of [15, 128]) {
      expect(
        registerInputSchema.safeParse({ ...registration, password: '😀'.repeat(length) }).success,
      ).toBe(true);
    }
    for (const length of [0, 14, 129]) {
      expect(
        registerInputSchema.safeParse({ ...registration, password: '😀'.repeat(length) }).success,
      ).toBe(false);
    }
  });

  it('does not enforce the new-password minimum when verifying existing credentials', () => {
    expect(loginInputSchema.parse({ email: user.email, password: ' old ' }).password).toBe(' old ');
    expect(loginInputSchema.safeParse({ email: user.email, password: '' }).success).toBe(false);
    expect(
      loginInputSchema.safeParse({ email: user.email, password: 'a'.repeat(129) }).success,
    ).toBe(false);
    expect(
      changePasswordInputSchema.safeParse({
        currentPassword: 'old',
        newPassword: registration.password,
        requestId,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid email and identity/privilege injection', () => {
    expect(registerInputSchema.safeParse({ ...registration, email: 'quan@' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...registration, role: 'OWNER' }).success).toBe(false);
    for (const field of ['userId', 'email', 'role', 'avatarUrl', 'publicId']) {
      expect(
        updateProfileInputSchema.safeParse({ displayName: 'Quân', requestId, [field]: 'forged' })
          .success,
      ).toBe(false);
    }
    expect(
      updateProfileInputSchema.safeParse({ displayName: 'Quân', requestId: 'bad' }).success,
    ).toBe(false);
    expect(logoutInputSchema.safeParse({ authSessionId: 'other-session' }).success).toBe(false);
    expect(logoutInputSchema.safeParse({}).success).toBe(true);
  });
});

describe('auth/profile output contracts', () => {
  it('accepts own profile, a public HTTPS avatar, and an authenticated response', () => {
    expect(ownUserResponseSchema.safeParse({ data: user, requestId }).success).toBe(true);
    expect(
      ownUserResponseSchema.safeParse({
        data: { ...user, avatarUrl: 'https://res.cloudinary.com/example/image/upload/avatar.jpg' },
        requestId,
      }).success,
    ).toBe(true);
    expect(authenticatedResponseSchema.safeParse({ data: auth, requestId }).success).toBe(true);
    expect(authMutationResponseSchema.safeParse({ data: null, requestId }).success).toBe(true);
  });

  it.each(['passwordHash', 'tokenHash', 'authSessionId', 'role', 'publicId'])(
    'rejects private or unrelated field %s in own profile',
    (field) => {
      expect(
        ownUserResponseSchema.safeParse({ data: { ...user, [field]: 'private' }, requestId })
          .success,
      ).toBe(false);
    },
  );

  it('does not let a member identity projection expose email', () => {
    expect(userSummarySchema.safeParse(user).success).toBe(false);
    expect(
      userSummarySchema.safeParse({ id: user.id, displayName: user.displayName, avatarUrl: null })
        .success,
    ).toBe(true);
  });

  it('rejects missing fields, session secrets, invalid IDs, times and avatar URLs', () => {
    const invalid = [
      { user, expiresAt: auth.expiresAt },
      { ...auth, sessionToken: 'private' },
      { ...auth, user: { ...user, id: 'runtime-uuid' } },
      { ...auth, expiresAt: '2026-11-13T09:00:00+07:00' },
      { ...auth, user: { ...user, avatarUrl: 'javascript:alert(1)' } },
      { ...auth, user: { ...user, avatarUrl: 'http://example.com/avatar.jpg' } },
    ];
    for (const data of invalid) {
      expect(authenticatedResponseSchema.safeParse({ data, requestId }).success).toBe(false);
    }
  });

  it('keeps internal session context separate from the client response', () => {
    const context = {
      userId: user.id,
      authSessionId: '507f1f77bcf86cd799439012',
      expiresAt: auth.expiresAt,
    };
    expect(authenticatedContextSchema.safeParse(context).success).toBe(true);
    expect(authenticatedContextSchema.safeParse({ ...context, role: 'OWNER' }).success).toBe(false);
    expect(authenticatedResponseSchema.safeParse({ data: context, requestId }).success).toBe(false);
  });
});
