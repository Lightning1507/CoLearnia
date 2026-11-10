import { commonErrorHttpStatus } from '@colearnia/contracts';
import type { ApiError } from '@colearnia/contracts';
import type { NextFunction, Request, Response } from 'express';
import { createCsrf, csrfCookie, readCookie } from './csrf.js';
import { SessionReadUnavailableError } from './read-session.js';
import type { createSessionReader, VerifiedSession } from './read-session.js';
import { authCookie } from './session-credentials.js';

export type AuthLocals = {
  requestId?: string;
  auth?: VerifiedSession | undefined;
};
export type AuthResponse = Response<unknown, AuthLocals>;

export function authFailure(
  res: AuthResponse,
  code: keyof typeof commonErrorHttpStatus,
  message: string,
  fieldErrors?: ApiError['error']['fieldErrors'],
) {
  res.status(commonErrorHttpStatus[code]).json({
    error: { code, message, fieldErrors },
    requestId: res.locals.requestId,
  });
}

export function requireVerifiedSession(res: AuthResponse): VerifiedSession | undefined {
  const auth = res.locals.auth;
  if (auth && Date.parse(auth.context.expiresAt) > Date.now()) return auth;
  authFailure(res, 'AUTH_REQUIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  return undefined;
}

export function createHttpAuth(
  origin: string,
  secret: string,
  readSession: ReturnType<typeof createSessionReader>,
) {
  const csrf = createCsrf(secret);

  function requireBootstrapCsrf(req: Request, res: AuthResponse, next: NextFunction) {
    if (
      req.get('Origin') !== origin ||
      !csrf.validate(
        readCookie(req.headers.cookie, csrfCookie),
        req.get('X-CSRF-Token'),
        readCookie(req.headers.cookie, authCookie),
      )
    ) {
      authFailure(res, 'CSRF_INVALID', 'Nguồn yêu cầu hoặc mã CSRF không hợp lệ.');
      return;
    }
    next();
  }

  return {
    async requireAuth(req: Request, res: AuthResponse, next: NextFunction) {
      res.setHeader('Cache-Control', 'no-store');
      try {
        res.locals.auth =
          (await readSession(readCookie(req.headers.cookie, authCookie))) ?? undefined;
        if (!requireVerifiedSession(res)) return;
      } catch (error) {
        if (error instanceof SessionReadUnavailableError) {
          authFailure(res, 'DEPENDENCY_UNAVAILABLE', 'Không thể kiểm tra phiên lúc này.');
          return;
        }
        next(error);
        return;
      }
      next();
    },
    requireCsrf(req: Request, res: AuthResponse, next: NextFunction) {
      if (requireVerifiedSession(res)) requireBootstrapCsrf(req, res, next);
    },
    requireBootstrapCsrf,
    csrfForRequest(req: Request): { token: string; cookie?: string } {
      const authToken = readCookie(req.headers.cookie, authCookie);
      const cookie = readCookie(req.headers.cookie, csrfCookie);
      const token = cookie?.split('.', 1)[0];
      if (token && csrf.validate(cookie, token, authToken)) return { token };
      return csrf.issue(authToken);
    },
    issueCsrf: csrf.issue,
  };
}
