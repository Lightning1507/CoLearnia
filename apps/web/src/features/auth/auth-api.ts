import {
  apiErrorSchema,
  authenticatedResponseSchema,
  csrfResponseSchema,
} from '@colearnia/contracts';
import type { AuthenticatedData, LoginInput, RegisterInput } from '@colearnia/contracts';

export type AuthMode = 'login' | 'register';
export type AuthField = 'email' | 'password' | 'displayName';

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fieldErrors: Partial<Record<AuthField, string>> = {},
    public readonly retryAt = 0,
    public readonly uncertain = false,
  ) {
    super(message);
  }
}

// Injectable transport for tests; production always uses the same HTTP contract.
export function createAuthApi(base: string, transport: typeof fetch = fetch) {
  async function request(path: string, signal: AbortSignal, body?: object, csrfToken?: string) {
    const response = await transport(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ?? '' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      const code = parsed.success ? parsed.data.error.code : 'INVALID_RESPONSE';
      const fields: Partial<Record<AuthField, string>> = {};
      if (parsed.success) {
        for (const { field, message } of parsed.data.error.fieldErrors ?? []) {
          if (field === 'email' || field === 'password' || field === 'displayName')
            fields[field] = message;
        }
      }
      const retry = response.headers.get('Retry-After');
      const seconds = retry === null ? NaN : Number(retry);
      const retryAt =
        retry === null
          ? 0
          : Number.isFinite(seconds)
            ? Date.now() + Math.max(0, seconds) * 1000
            : Date.parse(retry);
      const messages: Record<string, string> = {
        INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
        EMAIL_EXISTS: 'Email đã được đăng ký. Bạn có thể chuyển sang đăng nhập.',
        VALIDATION_ERROR: 'Kiểm tra lại thông tin đã nhập.',
        CSRF_INVALID: 'Không xác nhận được phiên gửi form. Vui lòng thử lại.',
        RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.',
        ACCOUNT_CREATED_LOGIN_REQUIRED:
          'Tài khoản đã được tạo nhưng phiên đăng nhập đã hết hạn. Vui lòng đăng nhập.',
        DEPENDENCY_UNAVAILABLE: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
      };
      throw new AuthApiError(
        code,
        messages[code] ?? 'Không xử lý được yêu cầu. Vui lòng thử lại.',
        fields,
        Number.isFinite(retryAt) ? retryAt : 0,
        response.status >= 500 &&
          !(
            path === '/auth/register' &&
            response.status === 503 &&
            code === 'ACCOUNT_CREATED_LOGIN_REQUIRED'
          ),
      );
    }
    return json;
  }

  async function me(signal: AbortSignal): Promise<AuthenticatedData | null> {
    try {
      const data = authenticatedResponseSchema.parse(await request('/auth/me', signal)).data;
      return Date.parse(data.expiresAt) > Date.now() ? data : null;
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'AUTH_REQUIRED') return null;
      throw error;
    }
  }

  async function authenticate(
    mode: AuthMode,
    input: LoginInput | RegisterInput,
    signal: AbortSignal,
  ) {
    async function bootstrap() {
      return csrfResponseSchema.parse(await request('/auth/csrf', signal)).data.csrfToken;
    }
    // Bootstrap failures have not submitted a mutation and need no read-back.
    let token = await bootstrap();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = authenticatedResponseSchema.parse(
          await request(`/auth/${mode}`, signal, input, token),
        ).data;
        if (Date.parse(data.expiresAt) <= Date.now()) throw new Error('Expired session response');
        return data;
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof AuthApiError && error.code === 'CSRF_INVALID') {
          if (attempt === 0) {
            token = await bootstrap();
            continue;
          }
          throw error;
        }
        if (error instanceof AuthApiError && !error.uncertain) throw error;
        // A missing/malformed response can follow a committed mutation. Never replay it.
        let recovered: AuthenticatedData | null = null;
        try {
          recovered = await me(signal);
        } catch {
          // The outcome stays unknown when read-back is also unavailable.
        }
        if (signal.aborted) throw error;
        if (recovered?.user.email === input.email) return recovered;
        throw new AuthApiError(
          'OUTCOME_UNKNOWN',
          'Chưa xác nhận được kết quả. Bạn có thể thử kiểm tra phiên lại; nếu chưa đăng nhập, hãy đăng nhập bằng tài khoản vừa dùng.',
          {},
          0,
          true,
        );
      }
    }
    throw new Error('Unreachable authentication attempt');
  }
  return { me, authenticate };
}
