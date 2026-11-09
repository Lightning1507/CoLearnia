import { Router } from 'express';
import {
  authenticatedResponseSchema,
  csrfResponseSchema,
  registerInputSchema,
} from '@colearnia/contracts';
import { authCookieOptions, setCsrfCookie } from './csrf.js';
import { authFailure as fail, requireVerifiedSession } from './http-auth.js';
import type { createHttpAuth } from './http-auth.js';
import { isCommonPassword } from './password-hash.js';
import {
  EmailExistsError,
  RegistrationUnavailableError,
  RegistrationUnconfirmedError,
} from './registration.js';
import type { createRegistration } from './registration.js';
import { authCookie } from './session-credentials.js';

export function createAuthRouter(
  httpAuth: ReturnType<typeof createHttpAuth>,
  register: ReturnType<typeof createRegistration>,
) {
  const router = Router();
  const attempts = new Map<string, number>();
  let nextWindow = performance.now() + 60_000;

  router.get('/csrf', (req, res) => {
    const csrf = httpAuth.csrfForRequest(req);
    const payload = csrfResponseSchema.parse({
      data: { csrfToken: csrf.token },
      requestId: res.locals.requestId,
    });
    if (csrf.cookie) setCsrfCookie(res, csrf.cookie);
    res.json(payload);
  });

  router.get('/me', httpAuth.requireAuth, (req, res) => {
    const auth = requireVerifiedSession(res);
    if (!auth) return;
    const csrf = httpAuth.csrfForRequest(req);
    const payload = authenticatedResponseSchema.parse({
      data: { user: auth.user, expiresAt: auth.context.expiresAt, csrfToken: csrf.token },
      requestId: res.locals.requestId,
    });
    if (csrf.cookie) setCsrfCookie(res, csrf.cookie);
    res.json(payload);
  });

  router.post('/register', httpAuth.requireBootstrapCsrf, async (req, res, next) => {
    const now = performance.now();
    if (now >= nextWindow) {
      attempts.clear();
      nextWindow = now + 60_000;
    }
    const ip = req.ip ?? 'unknown';
    const count = attempts.get(ip) ?? 0;
    if (count >= 10 || (count === 0 && attempts.size >= 4096)) {
      res.setHeader('Retry-After', Math.ceil((nextWindow - now) / 1000));
      fail(res, 'RATE_LIMITED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
      return;
    }
    attempts.set(ip, count + 1);

    const parsed = registerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors = (['email', 'displayName', 'password'] as const)
        .filter((field) => parsed.error.issues.some((issue) => issue.path[0] === field))
        .map((field) => ({ field, message: 'Giá trị không hợp lệ.' }));
      fail(res, 'VALIDATION_ERROR', 'Thông tin đăng ký không hợp lệ.', fieldErrors);
      return;
    }
    if (/[\uD800-\uDFFF]/u.test(parsed.data.password)) {
      fail(res, 'VALIDATION_ERROR', 'Mật khẩu chứa ký tự Unicode không hợp lệ.', [
        { field: 'password', message: 'Mật khẩu chứa ký tự Unicode không hợp lệ.' },
      ]);
      return;
    }
    if (isCommonPassword(parsed.data.password)) {
      fail(res, 'VALIDATION_ERROR', 'Vui lòng chọn mật khẩu khác.', [
        { field: 'password', message: 'Mật khẩu này quá phổ biến hoặc dễ đoán.' },
      ]);
      return;
    }

    const disconnect = new AbortController();
    const onClose = () => disconnect.abort();
    res.once('close', onClose);
    try {
      const { user, expiresAt, token } = await register(parsed.data, disconnect.signal);
      if (disconnect.signal.aborted) return;
      // Set-Cookie Expires has second precision.
      if (Math.floor(expiresAt.getTime() / 1000) <= Math.floor(Date.now() / 1000)) {
        fail(
          res,
          'DEPENDENCY_UNAVAILABLE',
          'Tài khoản đã được tạo nhưng phiên đăng nhập đã hết hạn. Vui lòng đăng nhập.',
        );
        return;
      }
      const freshCsrf = httpAuth.issueCsrf(token);
      const payload = authenticatedResponseSchema.parse({
        data: { user, expiresAt: expiresAt.toISOString(), csrfToken: freshCsrf.token },
        requestId: res.locals.requestId,
      });
      res.cookie(authCookie, token, { ...authCookieOptions, expires: expiresAt });
      setCsrfCookie(res, freshCsrf.cookie);
      res.status(201).json(payload);
    } catch (error) {
      if (disconnect.signal.aborted) return;
      if (error instanceof EmailExistsError) {
        fail(res, 'EMAIL_EXISTS', 'Email đã được đăng ký.');
      } else if (error instanceof RegistrationUnconfirmedError) {
        fail(res, 'DEPENDENCY_UNAVAILABLE', 'Chưa xác nhận được kết quả đăng ký.');
      } else if (error instanceof RegistrationUnavailableError) {
        fail(
          res,
          'DEPENDENCY_UNAVAILABLE',
          'Đăng ký tạm thời không khả dụng. Vui lòng thử lại sau.',
        );
      } else {
        next(error);
      }
    } finally {
      res.off('close', onClose);
    }
  });

  return router;
}
