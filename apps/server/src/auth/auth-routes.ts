import { Router } from 'express';
import {
  authenticatedResponseSchema,
  csrfResponseSchema,
  loginInputSchema,
  registerInputSchema,
} from '@colearnia/contracts';
import type { OwnUser } from '@colearnia/contracts';
import { authCookieOptions, readCookie, setCsrfCookie } from './csrf.js';
import { authFailure as fail, requireVerifiedSession } from './http-auth.js';
import type { AuthResponse, createHttpAuth } from './http-auth.js';
import { InvalidCredentialsError, LoginUnavailableError, LoginUnconfirmedError } from './login.js';
import type { createLogin } from './login.js';
import { createLoginAttemptLimit } from './login-attempts.js';
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
  login: ReturnType<typeof createLogin>,
) {
  const router = Router();
  const attempts = new Map<string, number>();
  let nextWindow = performance.now() + 60_000;
  const loginByIp = createLoginAttemptLimit(10);
  const loginByEmailAndIp = createLoginAttemptLimit(5);

  function sendSession(
    res: AuthResponse,
    { user, expiresAt, token }: { user: OwnUser; expiresAt: Date; token: string },
    status: 200 | 201,
    expiredMessage: string,
  ) {
    // Set-Cookie Expires has second precision.
    if (Math.floor(expiresAt.getTime() / 1000) <= Math.floor(Date.now() / 1000)) {
      fail(
        res,
        status === 201 ? 'ACCOUNT_CREATED_LOGIN_REQUIRED' : 'DEPENDENCY_UNAVAILABLE',
        expiredMessage,
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
    res.status(status).json(payload);
  }

  function sendRateLimit(res: AuthResponse, retryAfter: number) {
    res.setHeader('Retry-After', retryAfter);
    fail(res, 'RATE_LIMITED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
  }

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

  router.post('/login', httpAuth.requireBootstrapCsrf, async (req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const ipWait = loginByIp(ip);
    if (ipWait !== undefined) {
      sendRateLimit(res, ipWait);
      return;
    }
    const parsed = loginInputSchema.safeParse(req.body);
    if (!parsed.success || /[\uD800-\uDFFF]/u.test(parsed.data.password)) {
      fail(res, 'VALIDATION_ERROR', 'Thông tin đăng nhập không hợp lệ.');
      return;
    }
    const pairWait = loginByEmailAndIp(JSON.stringify([parsed.data.email, ip]));
    if (pairWait !== undefined) {
      sendRateLimit(res, pairWait);
      return;
    }

    const disconnect = new AbortController();
    const onClose = () => disconnect.abort();
    res.once('close', onClose);
    try {
      const previousToken = readCookie(req.headers.cookie, authCookie);
      const result = await login(parsed.data, previousToken, disconnect.signal);
      if (disconnect.signal.aborted) return;
      sendSession(res, result, 200, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    } catch (error) {
      if (disconnect.signal.aborted) return;
      if (error instanceof InvalidCredentialsError) {
        fail(res, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
      } else if (error instanceof LoginUnconfirmedError) {
        fail(res, 'DEPENDENCY_UNAVAILABLE', 'Chưa xác nhận được kết quả đăng nhập.');
      } else if (error instanceof LoginUnavailableError) {
        fail(res, 'DEPENDENCY_UNAVAILABLE', 'Đăng nhập tạm thời không khả dụng.');
      } else {
        next(error);
      }
    } finally {
      res.off('close', onClose);
    }
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
      sendRateLimit(res, Math.ceil((nextWindow - now) / 1000));
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
      const result = await register(parsed.data, disconnect.signal);
      if (disconnect.signal.aborted) return;
      sendSession(
        res,
        result,
        201,
        'Tài khoản đã được tạo nhưng phiên đăng nhập đã hết hạn. Vui lòng đăng nhập.',
      );
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
