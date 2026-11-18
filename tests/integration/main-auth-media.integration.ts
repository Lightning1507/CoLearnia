import { randomUUID } from 'node:crypto';
import { origin } from '../../apps/server/test/main-auth-media-harness.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  setup,
  initializeDatabase,
  disposeFixtures,
  closeDatabase,
  registerDisposer,
  AuthSession,
  Channel,
  Membership,
  SessionParticipant,
  sessionJoinAckSchema,
  mediaTransportCreateAckSchema,
  mediaHttpContextIssueAckSchema,
  mediaBootstrapResponseSchema,
} from '../../apps/server/test/main-auth-media-harness.js';
import { SessionProjectionRuntime } from '../../apps/web/src/features/live/runtime/sessionProjectionRuntime.js';
import { bindSessionProjectionSocket } from '../../apps/web/src/features/live/runtime/sessionProjectionSocket.js';
beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);
type ClientSocket = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['connect']>>;

describe('SCRUM-88 MAIN with real M1 authentication/ACL and native M3 media', () => {
  it('joins two authenticated users, replays once and reads peers through the shared Workspace gate', async () => {
    const f = await setup();
    const socket = await f.connect(f.host);
    const first = await f.join(f.host, socket);
    const peer = await f.signUp();
    await f.member(peer);
    await f.join(peer, await f.connect(peer));
    const replay = sessionJoinAckSchema.parse(
      await socket.timeout(5000).emitWithAck('session.join', first.command),
    );
    expect(replay).toMatchObject({
      data: {
        result: {
          participantId: first.result.participantId,
          callGeneration: first.result.callGeneration,
        },
      },
    });
    expect(
      await SessionParticipant.countDocuments({ sessionId: first.ticket.sessionId, leftAt: null }),
    ).toBe(2);
    expect(f.registry.stats().ownerships).toBe(2);
    expect(f.errors).toEqual([]);
  });

  it('denies outsiders, TEXT and PRIVATE content without granting OWNER content access', async () => {
    const f = await setup();
    const other = await f.signUp();
    await expect(
      f.registry.issue(other.auth, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const input of [
      { type: 'TEXT', accessMode: 'WORKSPACE' },
      { type: 'LIVE', accessMode: 'PRIVATE' },
    ] as const) {
      const channel = await Channel.create({
        workspaceId: f.target.workspaceId,
        name: 'Denied target',
        ...input,
      });
      await expect(
        f.registry.issue(
          f.host.auth,
          { ...f.target, channelId: channel.id },
          { requestId: randomUUID() },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(f.registry.stats().rooms).toBe(0);
  });

  it('bootstraps real Router capabilities only with the current socket proof and authenticated cookie', async () => {
    const f = await setup();
    const socket = await f.connect(f.host);
    const joined = await f.join(f.host, socket);
    const context = {
      sessionId: joined.ticket.sessionId,
      epoch: joined.ticket.epoch,
      callGeneration: joined.result.callGeneration,
    };
    const proof = mediaHttpContextIssueAckSchema.parse(
      await socket.timeout(5000).emitWithAck('media.httpContext.issue', {
        ...context,
        requestId: randomUUID(),
        expectedPolicyRevision: 1,
        payload: {},
      }),
    );
    if ('error' in proof) throw new Error(proof.error.code);
    const url = `/api/v1/live-sessions/${context.sessionId}/media/bootstrap`;
    const query = { epoch: context.epoch, callGeneration: String(context.callGeneration) };
    await f.http.get(url).query(query).set('Cookie', f.host.cookie).expect(403);
    const response = await f.http
      .get(url)
      .query(query)
      .set('Cookie', f.host.cookie)
      .set('X-Media-Context', proof.data.result.token)
      .expect(200);
    const capabilities = mediaBootstrapResponseSchema.parse(response.body).data
      .routerRtpCapabilities;
    expect(capabilities.codecs.map((codec) => codec.mimeType)).toContain('audio/opus');
    const other = await f.signUp();
    await f.http
      .get(url)
      .query(query)
      .set('Cookie', other.cookie)
      .set('X-Media-Context', proof.data.result.token)
      .expect(403);
    await f.disconnect(socket);
    await f.http
      .get(url)
      .query(query)
      .set('Cookie', f.host.cookie)
      .set('X-Media-Context', proof.data.result.token)
      .expect(403);
  });

  it('resumes into a new generation and feeds real server snapshots into the FE projection runtime', async () => {
    const f = await setup();
    const socket = await f.connect(f.host);
    const oldSnapshots: unknown[] = [];
    socket.on('session.snapshot', (packet: unknown) => oldSnapshots.push(structuredClone(packet)));
    const joined = await f.join(f.host, socket);
    const makeProjection = (client: ClientSocket, result: typeof joined.result) => {
      const abort = new AbortController();
      const media = { updateContext: vi.fn() };
      const identity = {
        sessionId: joined.ticket.sessionId,
        epoch: joined.ticket.epoch,
        participantId: result.participantId,
        callGeneration: result.callGeneration,
      };
      const runtime = new SessionProjectionRuntime(identity, abort.signal, media, vi.fn());
      const unbind = bindSessionProjectionSocket(runtime, client, abort.signal);
      registerDisposer(async () => {
        abort.abort();
        unbind();
      });
      return { runtime, media };
    };
    const old = makeProjection(socket, joined.result);
    await vi.waitFor(() => expect(old.runtime.getSnapshot().status).toBe('ready'));
    expect(old.runtime.getSnapshot().projection?.participants).toHaveLength(1);
    const oldCursor = old.runtime.getSnapshot().cursor;
    const createTransport = async (client: ClientSocket, generation: number, revision: number) => {
      const packet = mediaTransportCreateAckSchema.parse(
        await client.timeout(5000).emitWithAck('media.transport.create', {
          requestId: randomUUID(),
          sessionId: joined.ticket.sessionId,
          epoch: joined.ticket.epoch,
          callGeneration: generation,
          expectedPolicyRevision: revision,
          payload: { direction: 'SEND' },
        }),
      );
      if ('error' in packet) throw new Error(packet.error.code);
      return packet.data.result.transportId;
    };
    await createTransport(socket, joined.result.callGeneration, oldCursor!.policyRevision);
    expect(f.native[0]!.closed).toBe(false);
    await f.disconnect(socket);
    expect(old.runtime.getSnapshot().status).toBe('closed');
    expect(old.runtime.getSnapshot().projection).toBeNull();
    const replacement = await f.connect(f.host);
    const resumed = sessionJoinAckSchema.parse(
      await replacement.timeout(5000).emitWithAck('session.resume', {
        requestId: randomUUID(),
        sessionId: joined.ticket.sessionId,
        epoch: joined.ticket.epoch,
        callGeneration: joined.result.callGeneration,
        resumeTicket: joined.result.resumeTicket,
      }),
    );
    if ('error' in resumed) throw new Error(resumed.error.code);
    expect(resumed.data.result.callGeneration).toBeGreaterThan(joined.result.callGeneration);
    const current = makeProjection(replacement, resumed.data.result);
    await vi.waitFor(() => expect(current.runtime.getSnapshot().status).toBe('ready'));
    expect(current.runtime.getSnapshot().cursor?.callGeneration).toBe(
      resumed.data.result.callGeneration,
    );
    expect(current.runtime.getSnapshot().cursor).not.toEqual(oldCursor);
    expect(oldSnapshots.length).toBeGreaterThan(0);
    const beforeLateSnapshot = structuredClone(current.runtime.getSnapshot());
    await f.replaySnapshots(replacement, oldSnapshots);
    expect(current.runtime.getSnapshot()).toEqual(beforeLateSnapshot);
    expect(old.media.updateContext).toHaveBeenLastCalledWith(null);
    expect(f.native[0]!.closed).toBe(true);
    await createTransport(
      replacement,
      resumed.data.result.callGeneration,
      current.runtime.getSnapshot().cursor!.policyRevision,
    );
    expect(f.native[1]!.closed).toBe(false);
    expect(f.cleanupRequests[0]).toMatchObject({
      reason: 'DISCONNECTED',
      callGeneration: joined.result.callGeneration,
    });
    expect(f.retryOldCleanup(f.cleanupRequests[0]!).outcome.cleanupPending).toBe(false);
    expect(f.native[1]!.closed).toBe(false);
    expect(
      await SessionParticipant.countDocuments({ sessionId: joined.ticket.sessionId, leftAt: null }),
    ).toBe(1);
    expect(f.errors).toEqual([]);
  });

  it('rejects a previously valid session after its persisted auth session is revoked', async () => {
    const f = await setup();
    await AuthSession.updateOne(
      { _id: f.host.auth.authSessionId },
      { $set: { revokedAt: new Date() } },
    );
    await expect(
      f.registry.issue(f.host.auth, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(f.connect(f.host)).rejects.toMatchObject({ data: { code: 'AUTH_REQUIRED' } });
    expect(f.registry.stats().rooms).toBe(0);
  });

  it('denies resume after removal even when the old resume ticket is still valid', async () => {
    const f = await setup();
    const socket = await f.connect(f.host);
    const joined = await f.join(f.host, socket);
    await f.disconnect(socket);
    await Membership.updateOne(
      { workspaceId: f.target.workspaceId, userId: f.host.auth.userId },
      { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
    );
    const replacement = await f.connect(f.host);
    const resumed = sessionJoinAckSchema.parse(
      await replacement.timeout(5000).emitWithAck('session.resume', {
        requestId: randomUUID(),
        sessionId: joined.ticket.sessionId,
        epoch: joined.ticket.epoch,
        callGeneration: joined.result.callGeneration,
        resumeTicket: joined.result.resumeTicket,
      }),
    );
    expect(resumed).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const packet = mediaTransportCreateAckSchema.parse(
      await replacement.timeout(5000).emitWithAck('media.transport.create', {
        requestId: randomUUID(),
        sessionId: joined.ticket.sessionId,
        epoch: joined.ticket.epoch,
        callGeneration: joined.result.callGeneration,
        expectedPolicyRevision: 2,
        payload: { direction: 'SEND' },
      }),
    );
    expect(packet).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(f.native).toHaveLength(0);
  });

  it('installs shared deny during pending native transport creation, closes the late transport and retries logout safely', async () => {
    const f = await setup();
    const unaffected = await f.signUp();
    const socket = await f.connect(f.host);
    const joined = await f.join(f.host, socket);
    const context = {
      sessionId: joined.ticket.sessionId,
      epoch: joined.ticket.epoch,
      callGeneration: joined.result.callGeneration,
    };
    const entered = f.delayNext();
    const response = socket
      .timeout(5000)
      .emitWithAck('media.transport.create', {
        ...context,
        requestId: randomUUID(),
        expectedPolicyRevision: 1,
        payload: { direction: 'SEND' },
      })
      .catch(() => undefined); // Logout closes the authenticated socket before its ACK.
    await entered;
    const logOut = () =>
      f.http
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('Cookie', f.host.cookie)
        .set('X-CSRF-Token', f.host.data.csrfToken)
        .send({});
    await logOut().expect(503);
    expect(f.revocations.isSessionDenied(f.host.auth)).toBe(true);
    expect((await AuthSession.findById(f.host.auth.authSessionId).lean())?.revokedAt).toBeNull();
    await expect(
      f.registry.issue(f.host.auth, f.target, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await f.http.get('/api/v1/auth/me').set('Cookie', f.host.cookie).expect(401);
    expect(f.native).toHaveLength(1);
    f.release();
    await vi.waitFor(() => expect(f.native[0]!.closed).toBe(true));
    await logOut().expect(200);
    expect(
      (await AuthSession.findById(f.host.auth.authSessionId).lean())?.revokedAt,
    ).toBeInstanceOf(Date);
    await expect(f.connect(f.host)).rejects.toMatchObject({ data: { code: 'AUTH_REQUIRED' } });
    expect(f.registry.stats().ownerships).toBe(0);
    const acknowledgement = await response;
    if (acknowledgement !== undefined)
      expect(mediaTransportCreateAckSchema.parse(acknowledgement)).toHaveProperty('error');
    await f.http.get('/api/v1/auth/me').set('Cookie', unaffected.cookie).expect(200);
  });
});
