import { describe, expect, it, vi } from 'vitest';
import { AuthApiError, createAuthApi } from './auth-api';

const input = { email: 'learner@example.com', password: 'example-password-only' };
const identity = {
  user: {
    id: '000000000000000000000001',
    email: input.email,
    displayName: 'Học viên',
    avatarUrl: null,
  },
  expiresAt: '2099-01-01T00:00:00.000Z',
  csrfToken: 'example-csrf-proof',
};
const requestId = '00000000-0000-4000-8000-000000000001';
function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, requestId }), { status });
}
function fail(code: string, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error: { code, message: 'test error' }, requestId }), {
    status,
    ...(headers ? { headers } : {}),
  });
}
function setup(...responses: (Response | Error)[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetcher.mockRejectedValueOnce(response);
    else fetcher.mockResolvedValueOnce(response);
  }
  return { fetcher, api: createAuthApi('/api/v1', fetcher), signal: new AbortController().signal };
}
const bootstrap = () => ok({ csrfToken: 'example-bootstrap-proof' });

describe('auth browser HTTP contract', () => {
  it('restores identity and proof from me without reading cookies in JavaScript', async () => {
    const { api, fetcher, signal } = setup(ok(identity));
    expect(await api.me(signal)).toEqual(identity);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({ credentials: 'include', cache: 'no-store', method: 'GET' }),
    );
  });
  it('does not restore an already expired session response', async () => {
    const { api, signal } = setup(ok({ ...identity, expiresAt: '2000-01-01T00:00:00.000Z' }));
    expect(await api.me(signal)).toBeNull();
  });
  it('only treats AUTH_REQUIRED as anonymous, not service failures', async () => {
    const { api, signal } = setup(fail('AUTH_REQUIRED', 401), fail('DEPENDENCY_UNAVAILABLE', 503));
    expect(await api.me(signal)).toBeNull();
    await expect(api.me(signal)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it.each(['login', 'register'] as const)(
    'bootstraps CSRF before %s and preserves the password',
    async (mode) => {
      const { api, fetcher, signal } = setup(
        bootstrap(),
        ok(identity, mode === 'register' ? 201 : 200),
      );
      const payload = {
        ...input,
        password: '  ví dụ mật khẩu  ',
        ...(mode === 'register' ? { displayName: 'Học viên' } : {}),
      };
      expect(await api.authenticate(mode, payload, signal)).toEqual(identity);
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        '/api/v1/auth/csrf',
        `/api/v1/auth/${mode}`,
      ]);
      expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
        headers: { 'X-CSRF-Token': 'example-bootstrap-proof' },
      });
    },
  );
  it('refreshes rejected CSRF only once, keeping the same body', async () => {
    const { api, fetcher, signal } = setup(
      bootstrap(),
      fail('CSRF_INVALID', 403),
      ok({ csrfToken: 'example-fresh-proof' }),
      ok(identity),
    );
    await api.authenticate('login', input, signal);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(fetcher.mock.calls[3]?.[1]?.body);
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({
      'X-CSRF-Token': 'example-fresh-proof',
    });
  });
  it('stops after a second CSRF rejection', async () => {
    const { api, fetcher, signal } = setup(
      bootstrap(),
      fail('CSRF_INVALID', 403),
      bootstrap(),
      fail('CSRF_INVALID', 403),
    );
    await expect(api.authenticate('login', input, signal)).rejects.toMatchObject({
      code: 'CSRF_INVALID',
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each([
    ['INVALID_CREDENTIALS', 401],
    ['EMAIL_EXISTS', 409],
  ] as const)('does not replay or reconcile %s', async (code, status) => {
    const { api, fetcher, signal } = setup(bootstrap(), fail(code, status));
    await expect(api.authenticate('login', input, signal)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('honors Retry-After without retrying automatically', async () => {
    const { api, fetcher, signal } = setup(
      bootstrap(),
      fail('RATE_LIMITED', 429, { 'Retry-After': '30' }),
    );
    const before = Date.now();
    const error = await api.authenticate('login', input, signal).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AuthApiError);
    expect((error as AuthApiError).retryAt).toBeGreaterThanOrEqual(before + 30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    new TypeError('network'),
    fail('DEPENDENCY_UNAVAILABLE', 503),
    new Response('broken JSON', { status: 200 }),
  ])('reconciles uncertain mutation results with me without replay', async (failure) => {
    const { api, fetcher, signal } = setup(bootstrap(), failure, ok(identity));
    expect(await api.authenticate('login', input, signal)).toEqual(identity);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
      '/api/v1/auth/me',
    ]);
  });
  it.each([null, { ...identity, user: { ...identity.user, email: 'another@example.com' } }])(
    'does not claim an unconfirmed mutation succeeded with another identity or no session',
    async (value) => {
      const { api, fetcher, signal } = setup(
        bootstrap(),
        new TypeError('network'),
        value ? ok(value) : fail('AUTH_REQUIRED', 401),
      );
      await expect(
        api.authenticate('register', { ...input, displayName: 'Học viên' }, signal),
      ).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN', uncertain: true });
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it('retains unknown outcome when reconciliation is unavailable', async () => {
    const { api, signal } = setup(bootstrap(), new TypeError('network'), new TypeError('offline'));
    await expect(api.authenticate('login', input, signal)).rejects.toMatchObject({
      code: 'OUTCOME_UNKNOWN',
    });
  });
  it('does not submit a mutation when bootstrap failed', async () => {
    const { api, fetcher, signal } = setup(new TypeError('offline'));
    await expect(api.authenticate('login', input, signal)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not reconcile or retry an abandoned operation', async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(bootstrap())
      .mockImplementationOnce(async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      });
    await expect(
      createAuthApi('/api/v1', fetcher).authenticate('login', input, controller.signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('directs confirmed registration to login without read-back or another POST', async () => {
    const { api, fetcher, signal } = setup(
      bootstrap(),
      fail('ACCOUNT_CREATED_LOGIN_REQUIRED', 503),
      fail('AUTH_REQUIRED', 401),
    );
    await expect(
      api.authenticate('register', { ...input, displayName: 'Học viên' }, signal),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CREATED_LOGIN_REQUIRED', uncertain: false });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/register',
    ]);
  });
});
