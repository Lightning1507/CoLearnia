import { randomUUID } from 'node:crypto';
import type { LiveContext } from '@colearnia/contracts';
import {
  mediaBootstrapResponseSchema,
  mediaContextHeaderSchema,
  mediaIceCredentialsResponseSchema,
} from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { csrfCookie } from '../../auth/csrf.js';
import { createHttpAuth } from '../../auth/http-auth.js';
import { authCookie, newOpaqueToken } from '../../auth/session-credentials.js';
import { loadConfig } from '../../config/env.js';
import { createMediaBootstrapRouter } from './media-bootstrap-routes.js';
import { createMediaBootstrap, mediaIceTtlSeconds } from './media-bootstrap.js';

const time = Date.now();
const identity = { sessionId: '1'.repeat(24), epoch: randomUUID(), callGeneration: 1 };
const auth = {
  userId: '2'.repeat(24),
  authSessionId: '3'.repeat(24),
  expiresAt: new Date(time + 86_400_000).toISOString(),
};
const router = {
  closed: false,
  rtpCapabilities: { codecs: [], headerExtensions: [] },
} as unknown as MediaTypes.Router;
const iceServers = [{ urls: 'turns:relay.invalid:443', username: 'test', credential: 'fixture' }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  let now = time;
  let owner: string | null = null;
  const context: LiveContext = {
    ...identity,
    auth,
    participantId: '4'.repeat(24),
    audienceEpoch: 2,
    policyRevision: 3,
    scope: { type: 'MAIN' },
    role: 'MEMBER',
    host: null,
    access: {
      workspaceId: '5'.repeat(24),
      channelId: '6'.repeat(24),
      channelType: 'LIVE',
      membershipId: '7'.repeat(24),
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    },
  };
  const issueIceServers = vi.fn(async () => iceServers);
  const service = createMediaBootstrap({
    now: () => now,
    issueIceServers,
    registry: {
      async withContext(socketId, _input, use) {
        if (socketId !== owner) return use({ ok: false, errorCode: 'FORBIDDEN' });
        type Policy = NonNullable<Parameters<typeof use>[2]>;
        const policy = {
          session: { participants: new Map([[context.participantId, { connected: true }]]) },
        } as unknown as Policy;
        return use({ ok: true, context }, router, policy);
      },
    },
  });
  async function issue(socketId = 'tab-a', requestId = randomUUID(), expectedPolicyRevision = 3) {
    const reply = vi.fn<(result: { token: string; expiresAt: string }) => void>();
    await service.issue(
      socketId,
      auth,
      { ...identity, requestId, expectedPolicyRevision, payload: {} },
      reply,
    );
    return mediaContextHeaderSchema.parse(reply.mock.calls[0]?.[0].token);
  }
  return {
    service,
    issue,
    issueIceServers,
    advancePolicy: () => {
      context.policyRevision++;
    },
    setOwner: (socket: string) => {
      owner = socket;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

it('rejects a changed expected policy revision under an existing proof request ID', async () => {
  const f = fixture();
  f.setOwner('tab-a');
  const requestId = randomUUID();
  await f.issue('tab-a', requestId);
  f.advancePolicy();
  await expect(f.issue('tab-a', requestId, 4)).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.issue('tab-a', randomUUID(), 4)).resolves.toHaveLength(43);
});

it('requires ownership before issue and rejects rotated, expired and old-tab proofs', async () => {
  const f = fixture();
  const reply = vi.fn();
  await expect(f.issue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  f.setOwner('tab-a');
  const requestId = randomUUID();
  const original = await f.issue('tab-a', requestId);
  expect(await f.issue('tab-a', requestId)).toBe(original);
  await f.service.bootstrap(identity, auth, original, reply);
  expect(reply).toHaveBeenCalledWith(router.rtpCapabilities);
  const rotated = await f.issue();
  expect(rotated).not.toBe(original);
  await expect(f.issue('tab-a', requestId)).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.service.bootstrap(identity, auth, original, reply)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  f.setOwner('tab-b');
  await expect(f.service.bootstrap(identity, auth, rotated, reply)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const lastRequestId = randomUUID();
  const fromB = await f.issue('tab-b', lastRequestId);
  f.advance(60_000);
  await expect(f.service.bootstrap(identity, auth, fromB, reply)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(f.issue('tab-b', lastRequestId)).rejects.toMatchObject({ code: 'CONFLICT' });
});

it('replays valid ICE intent and renews with a new intent at the refresh threshold', async () => {
  const f = fixture();
  f.setOwner('tab-a');
  const reply = vi.fn();
  const requestId = randomUUID();
  const original = await f.issue();
  await f.service.ice(identity, auth, original, requestId, reply);
  f.advance((mediaIceTtlSeconds - 3600) * 1000);
  const rotated = await f.issue();
  await f.service.ice(identity, auth, rotated, requestId, reply);
  expect(f.issueIceServers).toHaveBeenCalledTimes(1);
  expect(reply.mock.calls[1]?.[0].expiresAt).toBe(reply.mock.calls[0]?.[0].expiresAt);
  await f.service.ice(identity, auth, rotated, randomUUID(), reply);
  expect(f.issueIceServers).toHaveBeenCalledTimes(2);
  f.advance(3_600_000);
  const current = await f.issue();
  await expect(f.service.ice(identity, auth, current, requestId, reply)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

it('withholds a provider result when ownership is revoked while ICE is pending', async () => {
  const f = fixture();
  f.setOwner('tab-a');
  const entered = deferred<void>();
  const upstream = deferred<typeof iceServers>();
  f.issueIceServers.mockImplementationOnce(() => {
    entered.resolve();
    return upstream.promise;
  });
  const token = await f.issue();
  const reply = vi.fn();
  const response = f.service.ice(identity, auth, token, randomUUID(), reply);
  await entered.promise;
  f.service.revokeSocket('tab-a');
  upstream.resolve(iceServers);
  await expect(response).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(reply).not.toHaveBeenCalled();
});

it('enforces cookies, context proof and CSRF at the HTTP entry points', async () => {
  const f = fixture();
  const config = loadConfig({ NODE_ENV: 'test' });
  const authToken = newOpaqueToken();
  const httpAuth = createHttpAuth(config.APP_ORIGIN, 'test-secret'.repeat(4), async (token) =>
    token === authToken
      ? {
          context: auth,
          user: {
            id: auth.userId,
            email: 'test@example.invalid',
            displayName: 'Fixture',
            avatarUrl: null,
          },
        }
      : null,
  );
  const app = createApp(
    config,
    () => ({ name: 'CoLearnia', database: 'disconnected', media: 'disabled', ready: false }),
    undefined,
    undefined,
    createMediaBootstrapRouter(httpAuth, f.service),
  );
  const base = `/api/v1/live-sessions/${identity.sessionId}/media`;
  const bootstrap = `${base}/bootstrap?epoch=${identity.epoch}&callGeneration=${identity.callGeneration}`;
  const csrf = httpAuth.issueCsrf(authToken);
  const cookies = `${authCookie}=${authToken}; ${csrfCookie}=${csrf.cookie}`;
  f.setOwner('tab-a');
  const proof = await f.issue();

  await request(app).get(bootstrap).set('X-Media-Context', proof).expect(401);
  await request(app).get(bootstrap).set('Cookie', cookies).expect(403);
  const loaded = await request(app)
    .get(bootstrap)
    .set('Cookie', cookies)
    .set('X-Media-Context', proof)
    .expect('Cache-Control', 'no-store')
    .expect(200);
  expect(mediaBootstrapResponseSchema.parse(loaded.body).data.routerRtpCapabilities).toEqual(
    router.rtpCapabilities,
  );

  const sendIce = (origin: string) =>
    request(app)
      .post(`${base}/ice-credentials`)
      .set('Cookie', cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.token)
      .set('X-Media-Context', proof)
      .send({
        requestId: randomUUID(),
        epoch: identity.epoch,
        callGeneration: identity.callGeneration,
      });
  await sendIce('https://other.example.invalid').expect(403);
  expect(f.issueIceServers).not.toHaveBeenCalled();
  const issued = await sendIce(config.APP_ORIGIN).expect('Cache-Control', 'no-store').expect(200);
  expect(mediaIceCredentialsResponseSchema.parse(issued.body).data.iceServers).toEqual(iceServers);
});
