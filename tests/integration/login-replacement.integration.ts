import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  setup,
  initializeDatabase,
  disposeFixtures,
  closeDatabase,
  AuthSession,
  mediaTransportCreateAckSchema,
} from '../../apps/server/test/main-auth-media-harness.js';

beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);

// SCRUM-94 / issue #130: real auth, DB, Socket.IO, MAIN registry and native transport.
// Messaging/board cleanup remain explicit test doubles in this harness.
it('cleans only the replaced login session and keeps the new login usable in MAIN', async () => {
  const f = await setup();
  const other = await f.signUp();
  const independent = await f.loginStandalone(f.host);
  const independentSocket = await f.connect(independent);
  const socket = await f.connect(f.host);
  const joined = await f.join(f.host, socket);
  const transport = mediaTransportCreateAckSchema.parse(
    await socket.timeout(5000).emitWithAck('media.transport.create', {
      requestId: randomUUID(),
      sessionId: joined.ticket.sessionId,
      epoch: joined.ticket.epoch,
      callGeneration: joined.result.callGeneration,
      expectedPolicyRevision: 1,
      payload: { direction: 'SEND' },
    }),
  );
  if ('error' in transport) throw new Error(transport.error.code);
  expect(f.native).toHaveLength(1);
  expect(f.native[0]!.closed).toBe(false);

  const replacement = await f.loginAgain(f.host);
  expect(replacement.auth.userId).toBe(f.host.auth.userId);
  expect(replacement.auth.authSessionId).not.toBe(f.host.auth.authSessionId);
  await f.http.get('/api/v1/auth/me').set('Cookie', f.host.cookie).expect(401);
  await f.http.get('/api/v1/auth/me').set('Cookie', replacement.cookie).expect(200);
  await f.http.get('/api/v1/auth/me').set('Cookie', other.cookie).expect(200);
  await f.http.get('/api/v1/auth/me').set('Cookie', independent.cookie).expect(200);
  expect(independentSocket.connected).toBe(true);
  expect((await AuthSession.findById(f.host.auth.authSessionId).lean())?.revokedAt).toBeInstanceOf(
    Date,
  );
  expect((await AuthSession.findById(replacement.auth.authSessionId).lean())?.revokedAt).toBeNull();
  const replacementSocket = await f.connect(replacement);
  expect(replacementSocket.connected).toBe(true);

  await vi.waitFor(
    () =>
      expect({
        oldSocketConnected: socket.connected,
        oldTransportClosed: f.native[0]!.closed,
        oldOwnerships: f.registry.stats().ownerships,
      }).toEqual({ oldSocketConnected: false, oldTransportClosed: true, oldOwnerships: 0 }),
    { timeout: 1500 },
  );

  // Once M1/M4 cleanup is fixed, the new auth session can acquire MAIN and an
  // old-session retry must not revoke the new socket or transport generation.
  const current = await f.join(replacement, replacementSocket);
  expect(current.result.callGeneration).toBeGreaterThan(joined.result.callGeneration);
  const expectedPolicyRevision = await f.registry.withContext(
    replacementSocket.id!,
    {
      sessionId: current.ticket.sessionId,
      epoch: current.ticket.epoch,
      callGeneration: current.result.callGeneration,
    },
    (resolved) => {
      if (!resolved.ok) throw new Error(resolved.errorCode);
      return resolved.context.policyRevision;
    },
  );
  const newTransport = mediaTransportCreateAckSchema.parse(
    await replacementSocket.timeout(5000).emitWithAck('media.transport.create', {
      requestId: randomUUID(),
      sessionId: current.ticket.sessionId,
      epoch: current.ticket.epoch,
      callGeneration: current.result.callGeneration,
      expectedPolicyRevision,
      payload: { direction: 'SEND' },
    }),
  );
  if ('error' in newTransport) throw new Error(newTransport.error.code);
  for (const request of f.cleanupRequests) await f.retryOldCleanup(request);
  expect(f.native.at(-1)!.closed).toBe(false);
  expect(replacementSocket.connected).toBe(true);
  await f.http.get('/api/v1/auth/me').set('Cookie', replacement.cookie).expect(200);
});

it('denies pending native creation, closes its late result and retries replacement without leaking a session', async () => {
  const f = await setup();
  const socket = await f.connect(f.host);
  const joined = await f.join(f.host, socket);
  const entered = f.delayNext();
  const creating = socket
    .timeout(5000)
    .emitWithAck('media.transport.create', {
      requestId: randomUUID(),
      sessionId: joined.ticket.sessionId,
      epoch: joined.ticket.epoch,
      callGeneration: joined.result.callGeneration,
      expectedPolicyRevision: 1,
      payload: { direction: 'SEND' },
    })
    .catch(() => undefined);
  await entered;
  try {
    const failed = await f.requestLogin(f.host).expect(503);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect(f.revocations.isSessionDenied(f.host.auth)).toBe(true);
    await vi.waitFor(() => expect(socket.connected).toBe(false));
    expect(await AuthSession.countDocuments({ userId: f.host.auth.userId })).toBe(1);
    expect((await AuthSession.findById(f.host.auth.authSessionId).lean())?.revokedAt).toBeNull();
    await f.http.get('/api/v1/auth/me').set('Cookie', f.host.cookie).expect(401);
  } finally {
    f.release();
  }
  await creating;
  await vi.waitFor(() => expect(f.native[0]!.closed).toBe(true));
  const replacement = await f.loginAgain(f.host);
  expect(await AuthSession.countDocuments({ userId: f.host.auth.userId })).toBe(2);
  const freshSocket = await f.connect(replacement);
  await f.join(replacement, freshSocket);
  expect(freshSocket.connected).toBe(true);
});

it('can switch accounts while revoking only the presented account session', async () => {
  const f = await setup();
  const old = await f.connect(f.host);
  await f.join(f.host, old);
  const member = await f.signUp();
  await f.member(member);
  const independent = await f.connect(member);
  const replacement = await f.loginAgain(member, f.host);
  expect(replacement.auth.userId).toBe(member.auth.userId);
  await vi.waitFor(() => expect(old.connected).toBe(false));
  expect(independent.connected).toBe(true);
  await f.http.get('/api/v1/auth/me').set('Cookie', member.cookie).expect(200);
  const freshSocket = await f.connect(replacement);
  await f.join(replacement, freshSocket);
  for (const request of f.cleanupRequests) await f.retryOldCleanup(request);
  expect(freshSocket.connected).toBe(true);
});
