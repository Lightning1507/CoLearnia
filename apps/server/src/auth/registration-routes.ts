import { Router } from 'express';
import type { Response } from 'express';
import {
  authenticatedResponseSchema,
  commonErrorHttpStatus,
  csrfResponseSchema,
  registerInputSchema,
} from '@colearnia/contracts';
import type { ApiError } from '@colearnia/contracts';
import {
  authCookieOptions,
  createCsrf,
  csrfCookie,
  csrfCookieTtlSeconds,
  readCookie,
} from './csrf.js';
import { isCommonPassword } from './password-hash.js';
import {
  EmailExistsError,
  RegistrationUnavailableError,
  RegistrationUnconfirmedError,
} from './registration.js';
import type { createRegistration } from './registration.js';
import { authCookie } from './session-credentials.js';

function fail(
  res: Response,
  code: keyof typeof commonErrorHttpStatus,
  message: string,
  fieldErrors?: ApiError['error']['fieldErrors'],
) {
  res.status(commonErrorHttpStatus[code]).json({
    error: { code, message, fieldErrors },
    requestId: res.locals.requestId,
  });
}

export function createRegistrationRouter(
  origin: string,
  secret: string,
  register: ReturnType<typeof createRegistration>,
) {
  const router = Router();
  const csrf = createCsrf(secret);
  const attempts = new Map<string, number>();
  let nextWindow = performance.now() + 60_000;

  router.get('/csrf', (req, res) => {
    const authToken = readCookie(req.headers.cookie, authCookie);
    const existingCookie = readCookie(req.headers.cookie, csrfCookie);
    const existingToken = existingCookie?.split('.', 1)[0];
    if (csrf.validate(existingCookie, existingToken, authToken)) {
      res.json(
        csrfResponseSchema.parse({
          data: { csrfToken: existingToken },
          requestId: res.locals.requestId,
        }),
      );
      return;
    }
    const next = csrf.issue(authToken);
    res.cookie(csrfCookie, next.cookie, {
      ...authCookieOptions,
      maxAge: csrfCookieTtlSeconds * 1000,
    });
    res.json(
      csrfResponseSchema.parse({
        data: { csrfToken: next.token },
        requestId: res.locals.requestId,
      }),
    );
  });

  router.post('/register', async (req, res, next) => {
    const authToken = readCookie(req.headers.cookie, authCookie);
    if (
      req.get('Origin') !== origin ||
      !csrf.validate(readCookie(req.headers.cookie, csrfCookie), req.get('X-CSRF-Token'), authToken)
    ) {
      fail(res, 'CSRF_INVALID', 'Nguồn yêu cầu hoặc mã CSRF không hợp lệ.');
      return;
    }
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
      const freshCsrf = csrf.issue(token);
      const payload = authenticatedResponseSchema.parse({
        data: { user, expiresAt: expiresAt.toISOString(), csrfToken: freshCsrf.token },
        requestId: res.locals.requestId,
      });
      res.cookie(authCookie, token, { ...authCookieOptions, expires: expiresAt });
      res.cookie(csrfCookie, freshCsrf.cookie, {
        ...authCookieOptions,
        maxAge: csrfCookieTtlSeconds * 1000,
      });
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
