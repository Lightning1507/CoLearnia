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

// Deliberately red while M1/M4 issue #130 is open.
// Run with vitest.login-replacement.config.ts; this is not default gate evidence.
it('cleans only the replaced login session and keeps the new login usable in MAIN', async () => {
  const f = await setup();
  const other = await f.signUp();
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
  for (const request of f.cleanupRequests) f.retryOldCleanup(request);
  expect(f.native.at(-1)!.closed).toBe(false);
  expect(replacementSocket.connected).toBe(true);
  await f.http.get('/api/v1/auth/me').set('Cookie', replacement.cookie).expect(200);
});
