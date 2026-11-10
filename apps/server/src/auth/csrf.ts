import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { hashAuthToken, newOpaqueToken } from './session-credentials.js';

export const csrfCookie = '__Host-colearnia-csrf';
export const csrfCookieTtlSeconds = 3600;
export const authCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

export function setCsrfCookie(res: Response, cookie: string) {
  res.cookie(csrfCookie, cookie, { ...authCookieOptions, maxAge: csrfCookieTtlSeconds * 1000 });
}

export function readCookie(header: string | undefined, name: string) {
  const prefix = name + '=';
  const matches = header
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  return matches?.length === 1 ? matches[0]!.slice(prefix.length) : undefined;
}

export function createCsrf(secret: string) {
  function sign(token: string, expiresAt: string, authToken: string | undefined) {
    const binding = authToken === undefined ? 'anonymous' : hashAuthToken(authToken);
    return createHmac('sha256', secret)
      .update(`colearnia:csrf:v1:${binding}:${expiresAt}:${token}`)
      .digest();
  }

  return {
    issue(authToken: string | undefined) {
      const token = newOpaqueToken();
      const expiresAt = String(Date.now() + csrfCookieTtlSeconds * 1000);
      const signature = sign(token, expiresAt, authToken).toString('base64url');
      return { token, cookie: `${token}.${expiresAt}.${signature}` };
    },
    validate(
      cookie: string | undefined,
      headerToken: string | undefined,
      authToken: string | undefined,
    ) {
      if (!cookie || !headerToken || !/^[\w-]{43}$/.test(headerToken)) return false;
      const parts = /^([\w-]{43})\.(\d{13})\.([\w-]{43})$/.exec(cookie);
      if (!parts) return false;
      const [, token, expiresAt, signature] = parts;
      return (
        Number(expiresAt) > Date.now() &&
        timingSafeEqual(Buffer.from(token!), Buffer.from(headerToken)) &&
        timingSafeEqual(Buffer.from(signature!, 'base64url'), sign(token!, expiresAt!, authToken))
      );
    },
  };
}
