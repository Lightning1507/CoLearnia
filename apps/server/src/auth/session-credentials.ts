import { createHash, randomBytes } from 'node:crypto';

export const authCookie = '__Host-colearnia-session';

export function isSessionToken(token: string | undefined): token is string {
  return token !== undefined && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function newOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function hashAuthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionCredentials(ttlSeconds: number) {
  const token = newOpaqueToken();
  return {
    token,
    tokenHash: hashAuthToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}
