import { randomBytes, randomUUID } from 'node:crypto';
import {
  apiErrorSchema,
  authenticatedContextSchema,
  authenticatedResponseSchema,
  csrfResponseSchema,
} from '@colearnia/contracts';
import { verify } from 'argon2';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/auth/auth-routes.js';
import { createCsrf, csrfCookie } from '../src/auth/csrf.js';
import { createHttpAuth, requireVerifiedSession } from '../src/auth/http-auth.js';
import { authIndexRequirements, authModels } from '../src/auth/models.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { createRegistration } from '../src/auth/registration.js';
import {
  authCookie,
  hashAuthToken,
  newSessionCredentials,
} from '../src/auth/session-credentials.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';

const port = Number(process.env.COLEARNIA_DB_TEST_PORT ?? '27017');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Invalid COLEARNIA_DB_TEST_PORT');
}
const databaseName = `colearnia_test_scrum18_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(
  `mongodb://127.0.0.1:${port}/${databaseName}?replicaSet=rs0&directConnection=true`,
);
const { User, AuthSession } = authModels(database.connection);
let ownsDatabase = false;
const secret = randomBytes(32).toString('hex');
const origin = 'https://colearnia.example.test';
const config = loadConfig({ NODE_ENV: 'test', APP_ORIGIN: origin });
const prefix = '/api/v1/auth';

function client(
  register = createRegistration(database, () => true, 604800),
  readSession = createSessionReader(database, () => true),
  onMutation = vi.fn(),
) {
  const httpAuth = createHttpAuth(origin, secret, readSession);
  const router = createAuthRouter(httpAuth, register);
  router.post('/test-mutation', httpAuth.requireAuth, httpAuth.requireCsrf, (_req, res) => {
    onMutation();
    res.json(requireVerifiedSession(res)?.context);
  });
  return request(
    createApp(
      config,
      () => ({
        name: 'CoLearnia',
        database: 'connected',
        media: 'disabled',
        ready: false,
      }),
      router,
    ),
  );
}

function cookie(response: Response, name: string) {
  const values = response.headers['set-cookie'] as string[] | undefined;
  const value = values?.find((entry) => entry.startsWith(name + '='));
  if (!value) throw new Error('Expected cookie header was missing');
  return value;
}

async function bootstrap(http: ReturnType<typeof client>) {
  const response = await http.get(prefix + '/csrf').expect(200);
  const { csrfToken } = csrfResponseSchema.parse(response.body).data;
  return { csrfToken, cookie: cookie(response, csrfCookie).split(';', 1)[0]! };
}

function input() {
  return {
    email: `${randomUUID()}@example.test`,
    password: '  Học theo nhóm 🌱 hôm nay  ',
    displayName: '  Quân  ',
  };
}

function register(http: ReturnType<typeof client>, csrf: Awaited<ReturnType<typeof bootstrap>>) {
  return http
    .post(prefix + '/register')
    .set('Origin', origin)
    .set('Cookie', csrf.cookie)
    .set('X-CSRF-Token', csrf.csrfToken);
}

beforeAll(async () => {
  await database.connect();
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs0');
  expect(hello.isWritablePrimary).toBe(true);
  expect(database.connection.name).toBe(databaseName);
  expect(await database.connection.db!.listCollections().toArray()).toHaveLength(0);
  ownsDatabase = true;
  await User.createCollection();
  await AuthSession.createCollection();
  await User.createIndexes();
  await AuthSession.createIndexes();
  expect((await preflightIndexes(database.connection, authIndexRequirements)).ready).toBe(true);
});

describe('SCRUM-21 HTTP session and CSRF with MongoDB', () => {
  async function signUp(http: ReturnType<typeof client>) {
    const response = await register(http, await bootstrap(http))
      .send(input())
      .expect(201);
    return {
      sessionCookie: cookie(response, authCookie).split(';', 1)[0]!,
      csrfCookieValue: cookie(response, csrfCookie).split(';', 1)[0]!,
      data: authenticatedResponseSchema.parse(response.body).data,
    };
  }

  it('reads the registered session and current profile without renewing either valid cookie', async () => {
    const http = client();
    const signedIn = await signUp(http);
    await User.updateOne(
      { _id: signedIn.data.user.id },
      {
        displayName: 'Tên mới',
        avatar: { secureUrl: 'https://example.test/avatar.png', publicId: 'private-id' },
      },
    );
    const response = await http
      .get(prefix + '/me')
      .set('Cookie', `${signedIn.sessionCookie}; ${signedIn.csrfCookieValue}`)
      .expect(200);
    expect(authenticatedResponseSchema.parse(response.body).data).toEqual({
      ...signedIn.data,
      user: {
        ...signedIn.data.user,
        displayName: 'Tên mới',
        avatarUrl: 'https://example.test/avatar.png',
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain(signedIn.sessionCookie.split('=')[1]);
  });

  it('rejects absent, malformed, duplicate, forged, expired and revoked sessions', async () => {
    const http = client();
    const { sessionCookie, data } = await signUp(http);
    const session = await AuthSession.findOne({ userId: data.user.id }).orFail();
    const expiresAt = session.expiresAt;
    const forgedToken = newSessionCredentials(60).token;
    async function expectUnauthorized(cookieHeader: string) {
      const response = await http
        .get(prefix + '/me')
        .set('Cookie', cookieHeader)
        .expect(401);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('AUTH_REQUIRED');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
    }
    for (const invalid of [
      '',
      `${authCookie}=bad-token`,
      `${sessionCookie}; ${sessionCookie}`,
      `${authCookie}=${forgedToken}`,
    ]) {
      await expectUnauthorized(invalid);
    }

    // Advance the server clock without giving MongoDB TTL a chance to delete the row.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expiresAt.getTime());
    try {
      await expectUnauthorized(sessionCookie);
      expect(await AuthSession.exists({ _id: session._id })).not.toBeNull();
    } finally {
      clock.mockRestore();
    }
    await AuthSession.updateOne({ _id: session._id }, { revokedAt: new Date() });
    await expectUnauthorized(sessionCookie);
  });

  it('rejects disabled or missing users and distinguishes DB unavailability from invalid credentials', async () => {
    const http = client();
    const { sessionCookie, data } = await signUp(http);
    const unavailable = client(
      undefined,
      createSessionReader(database, () => false),
    );
    const response = await unavailable
      .get(prefix + '/me')
      .set('Cookie', sessionCookie)
      .expect(503);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
    await User.updateOne({ _id: data.user.id }, { status: 'DISABLED' });
    const disabled = await http
      .get(prefix + '/me')
      .set('Cookie', sessionCookie)
      .expect(401);
    expect(apiErrorSchema.parse(disabled.body).error.code).toBe('AUTH_REQUIRED');
    await User.deleteOne({ _id: data.user.id });
    const missing = await http
      .get(prefix + '/me')
      .set('Cookie', sessionCookie)
      .expect(401);
    expect(apiErrorSchema.parse(missing.body).error.code).toBe('AUTH_REQUIRED');
  });

  it.each(['/me', '/test-mutation'] as const)(
    'rejects %s if revocation commits before the User read',
    async (path) => {
      const onMutation = vi.fn();
      const http = client(undefined, undefined, onMutation);
      const { sessionCookie, csrfCookieValue, data } = await signUp(http);
      const session = await AuthSession.findOne({ userId: data.user.id }).orFail();
      const findUser = User.findOne.bind(User);
      const lookup = vi.spyOn(User, 'findOne').mockImplementationOnce((...args) => {
        const query = findUser(...args);
        const exec = query.exec.bind(query);
        query.exec = async () => {
          await AuthSession.updateOne({ _id: session._id }, { revokedAt: new Date() }).orFail();
          await User.updateOne({ _id: data.user.id }, { displayName: 'Sau khi thu hồi' }).orFail();
          return exec();
        };
        return query;
      });
      try {
        const call =
          path === '/me'
            ? http.get(prefix + path)
            : http
                .post(prefix + path)
                .set('Origin', origin)
                .set('X-CSRF-Token', data.csrfToken);
        const response = await call
          .set('Cookie', `${sessionCookie}; ${csrfCookieValue}`)
          .expect(401);
        expect(lookup).toHaveBeenCalledOnce();
        expect(apiErrorSchema.parse(response.body).error.code).toBe('AUTH_REQUIRED');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.text).not.toContain('Sau khi thu hồi');
        expect(onMutation).not.toHaveBeenCalled();
      } finally {
        lookup.mockRestore();
      }
    },
  );

  it('renews missing, expired or wrong-session CSRF and enforces both guards before a mutation', async () => {
    const onMutation = vi.fn();
    const http = client(undefined, undefined, onMutation);
    const first = await signUp(http);
    const second = await signUp(http);
    const rawToken = first.sessionCookie.slice(authCookie.length + 1);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_600_001);
    const expired = (() => {
      try {
        return createCsrf(secret).issue(rawToken);
      } finally {
        clock.mockRestore();
      }
    })();
    const expireCookie = `${csrfCookie}=${expired.cookie}`;
    const invalidSignature = first.csrfCookieValue.replace(
      /(\.\d{13}\.)(.)/,
      (_match, prefix: string, first: string) => prefix + (first === 'A' ? 'B' : 'A'),
    );
    const mutation = (csrfValue: string, token: string, sessionCookie = first.sessionCookie) =>
      http
        .post(prefix + '/test-mutation')
        .set('Origin', origin)
        .set('Cookie', `${sessionCookie}; ${csrfValue}`)
        .set('X-CSRF-Token', token);
    const wrongSession = await mutation(second.csrfCookieValue, second.data.csrfToken).expect(403);
    expect(apiErrorSchema.parse(wrongSession.body).error.code).toBe('CSRF_INVALID');
    await mutation(first.csrfCookieValue, first.data.csrfToken, '').expect(401);
    await mutation(first.csrfCookieValue, first.data.csrfToken).unset('Origin').expect(403);
    await mutation(first.csrfCookieValue, first.data.csrfToken)
      .set('Origin', 'https://other.example.test')
      .expect(403);
    await mutation(first.csrfCookieValue, first.data.csrfToken).unset('X-CSRF-Token').expect(403);
    await mutation(first.csrfCookieValue, second.data.csrfToken).expect(403);
    await mutation(invalidSignature, first.data.csrfToken).expect(403);
    await mutation(expireCookie, expired.token).expect(403);
    expect(onMutation).not.toHaveBeenCalled();

    for (const invalid of ['', expireCookie, second.csrfCookieValue]) {
      const response = await http
        .get(prefix + '/me')
        .set('Cookie', [first.sessionCookie, invalid].filter(Boolean).join('; '))
        .expect(200);
      const { data } = authenticatedResponseSchema.parse(response.body);
      expect(data.csrfToken).not.toBe(first.data.csrfToken);
      expect(data.expiresAt).toBe(first.data.expiresAt);
      expect(response.headers['set-cookie']).toHaveLength(1);
      const csrfHeader = cookie(response, csrfCookie);
      expect(csrfHeader).toContain('HttpOnly; Secure; SameSite=Lax');
      const success = await mutation(csrfHeader.split(';', 1)[0]!, data.csrfToken).expect(200);
      const session = await AuthSession.findOne({ userId: first.data.user.id }).orFail();
      expect(authenticatedContextSchema.parse(success.body)).toEqual({
        userId: first.data.user.id,
        authSessionId: session.id,
        expiresAt: first.data.expiresAt,
      });
      expect(session.expiresAt.toISOString()).toBe(first.data.expiresAt);
    }
    expect(onMutation).toHaveBeenCalledTimes(3);
  });

  it('lets a tab recover after another tab replaces the CSRF cookie', async () => {
    const onMutation = vi.fn();
    const http = client(undefined, undefined, onMutation);
    const { sessionCookie, data } = await signUp(http);
    const refresh = () =>
      http
        .get(prefix + '/me')
        .set('Cookie', sessionCookie)
        .expect(200);
    const [firstTab, secondTab] = await Promise.all([refresh(), refresh()]);
    const firstToken = authenticatedResponseSchema.parse(firstTab.body).data.csrfToken;
    const sharedCookie = `${sessionCookie}; ${cookie(secondTab, csrfCookie).split(';', 1)[0]}`;
    const mutate = (token: string) =>
      http
        .post(prefix + '/test-mutation')
        .set('Origin', origin)
        .set('Cookie', sharedCookie)
        .set('X-CSRF-Token', token);

    const stale = await mutate(firstToken).expect(403);
    expect(apiErrorSchema.parse(stale.body).error.code).toBe('CSRF_INVALID');
    expect(onMutation).not.toHaveBeenCalled();
    const recovered = await http
      .get(prefix + '/me')
      .set('Cookie', sharedCookie)
      .expect(200);
    const current = authenticatedResponseSchema.parse(recovered.body).data;
    expect(current.user.id).toBe(data.user.id);
    expect(current.csrfToken).toBe(
      authenticatedResponseSchema.parse(secondTab.body).data.csrfToken,
    );
    expect(recovered.headers['set-cookie']).toBeUndefined();
    await mutate(current.csrfToken).expect(200);
    expect(onMutation).toHaveBeenCalledOnce();
  });
});

afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === databaseName)
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('SCRUM-18 registration with MongoDB', () => {
  it('commits a user and session before responding and binds rotated CSRF to the new cookie', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    const body = input();
    const response = await register(http, csrf)
      .send({ ...body, email: ` ${body.email.toUpperCase()} ` })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { data } = authenticatedResponseSchema.parse(response.body);
    expect(data.user).toMatchObject({ email: body.email, displayName: 'Quân', avatarUrl: null });
    expect(data.csrfToken).not.toBe(csrf.csrfToken);
    const sessionHeader = cookie(response, authCookie);
    expect(sessionHeader).toMatch(/Path=\/; Expires=.*; HttpOnly; Secure; SameSite=Lax/);
    const rawToken = sessionHeader.split(';', 1)[0]!.slice(authCookie.length + 1);
    const csrfHeader = cookie(response, csrfCookie);
    expect(csrfHeader).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(response.text).not.toContain(rawToken);

    const user = await User.findById(data.user.id).select('+passwordHash').orFail();
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=32768,t=2,p=1\$/);
    expect(await verify(user.passwordHash, body.password)).toBe(true);
    expect(await verify(user.passwordHash, body.password.trim())).toBe(false);
    const session = await AuthSession.findOne({ userId: user._id }).select('+tokenHash').orFail();
    expect(session.tokenHash).toBe(hashAuthToken(rawToken));
    expect(session.expiresAt.toISOString()).toBe(data.expiresAt);
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(604_790_000);

    const rotatedCookie = csrfHeader.split(';', 1)[0]!;
    await register(http, { ...csrf, cookie: `${csrf.cookie}; ${authCookie}=${rawToken}` })
      .send(input())
      .expect(403);
    const reissued = await http
      .get(prefix + '/csrf')
      .set('Cookie', `${rotatedCookie}; ${authCookie}=${rawToken}`)
      .expect(200);
    expect(csrfResponseSchema.parse(reissued.body).data.csrfToken).toBe(data.csrfToken);
  });

  it('rejects cross-origin, missing, tampered and expired CSRF without writing', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    const body = input();
    const forgedCookie = csrf.cookie.replace(
      /(\.\d{13}\.)(.)/,
      (_match, prefix: string, first: string) => prefix + (first === 'A' ? 'B' : 'A'),
    );
    const issued = createCsrf(secret);
    const expired = (() => {
      // Sign a real but already expired cookie by using the clock offset only during issuance.
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_700_000);
      try {
        return issued.issue(undefined);
      } finally {
        clock.mockRestore();
      }
    })();
    for (const call of [
      () => register(http, csrf).set('Origin', 'https://other.example.test'),
      () => register(http, csrf).unset('X-CSRF-Token'),
      () => register(http, csrf).unset('Cookie'),
      () => register(http, { ...csrf, cookie: forgedCookie }),
      () => register(http, { csrfToken: expired.token, cookie: `${csrfCookie}=${expired.cookie}` }),
    ]) {
      const response = await call().send(body).expect(403);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('CSRF_INVALID');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await User.exists({ emailNormalized: body.email })).toBeNull();
  });

  it('rejects invalid input and common passwords without echoing the submitted values', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    const body = input();
    for (const invalid of [
      { ...body, displayName: '  ' },
      { ...body, role: 'OWNER' },
      { ...body, password: 'PasswordPassword' },
      { ...body, password: 'x'.repeat(16) + '\uD800' },
    ]) {
      const response = await register(http, csrf).send(invalid).expect(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.text).not.toContain(invalid.password);
    }
    expect(await User.exists({ emailNormalized: body.email })).toBeNull();
  });

  it('allows only one user and one session for concurrent normalized duplicate emails', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    const body = input();
    const results = await Promise.all([
      register(http, csrf).send(body),
      register(http, csrf).send({ ...body, email: ` ${body.email.toUpperCase()} ` }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const duplicate = results.find((response) => response.status === 409)!;
    expect(apiErrorSchema.parse(duplicate.body).error.code).toBe('EMAIL_EXISTS');
    expect(duplicate.headers['set-cookie']).toBeUndefined();
    const users = await User.find({ emailNormalized: body.email });
    expect(users).toHaveLength(1);
    expect(await AuthSession.countDocuments({ userId: users[0]!._id })).toBe(1);
  });

  it('rolls the user back when MongoDB refuses the session insert', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    const body = input();
    const db = database.connection.db!;
    const totalSessions = await AuthSession.countDocuments();
    await db.command({ collMod: 'authSessions', validator: { expiresAt: { $lt: new Date(0) } } });
    try {
      const response = await register(http, csrf).send(body).expect(500);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('INTERNAL_ERROR');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await User.exists({ emailNormalized: body.email })).toBeNull();
      expect(await AuthSession.countDocuments()).toBe(totalSessions);
    } finally {
      await db.command({ collMod: 'authSessions', validator: {} });
    }
  });

  it('withholds cookies when commit is unconfirmed even if data actually committed', async () => {
    const unconfirmed = createRegistration(
      {
        ...database,
        async transaction(work) {
          await database.transaction(work);
          const error = new mongoose.mongo.MongoServerError({ message: 'test commit outcome' });
          error.addErrorLabel('UnknownTransactionCommitResult');
          throw error;
        },
      },
      () => true,
      604800,
    );
    const http = client(unconfirmed);
    const csrf = await bootstrap(http);
    const body = input();
    const response = await register(http, csrf).send(body).expect(503);
    expect(apiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Chưa xác nhận được kết quả đăng ký.',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    const user = await User.findOne({ emailNormalized: body.email }).orFail();
    expect(await AuthSession.countDocuments({ userId: user._id })).toBe(1);
  });

  it('withholds cookies when a committed session expires before the response', async () => {
    const ttl = loadConfig({ AUTH_TTL_SECONDS: '60' }).AUTH_TTL_SECONDS;
    const registerUser = createRegistration(database, () => true, ttl);
    const clock = vi.spyOn(Date, 'now');
    const http = client(async (body, signal) => {
      const result = await registerUser(body, signal);
      // Move the response clock forward only after the real commit.
      clock.mockReturnValue(result.expiresAt.getTime());
      return result;
    });
    const body = input();
    try {
      const csrf = await bootstrap(http);
      const response = await register(http, csrf).send(body).expect(503);
      expect(apiErrorSchema.parse(response.body).error).toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Tài khoản đã được tạo nhưng phiên đăng nhập đã hết hạn. Vui lòng đăng nhập.',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
    expect(await User.exists({ emailNormalized: body.email })).not.toBeNull();
  });

  it('rejects writes when index preflight detects a missing unique index', async () => {
    const db = database.connection.db!;
    const users = db.collection('users');
    const body = input();
    await users.dropIndex('uq_user_email');
    try {
      const { ready } = await preflightIndexes(database.connection, authIndexRequirements);
      expect(ready).toBe(false);
      const http = client(createRegistration(database, () => ready, 604800));
      const csrf = await bootstrap(http);
      const response = await register(http, csrf).send(body).expect(503);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await User.exists({ emailNormalized: body.email })).toBeNull();
    } finally {
      await User.createIndexes();
    }
  });

  it('rate-limits before admission and ignores a client-supplied forwarded IP by default', async () => {
    const http = client();
    const csrf = await bootstrap(http);
    for (let i = 0; i < 10; i++) await register(http, csrf).send({}).expect(400);
    const response = await register(http, csrf)
      .set('X-Forwarded-For', '203.0.113.10')
      .send(input())
      .expect(429);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});
