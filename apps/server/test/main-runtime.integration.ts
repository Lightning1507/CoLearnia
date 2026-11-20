import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  isSessionEndedNoticeCurrent,
  mediaTransportCreateAckSchema,
  sessionEndedEventSchema,
  sessionLeaveAckSchema,
  sessionSnapshotPartSchema,
} from '@colearnia/contracts';
import {
  setup,
  initializeDatabase,
  disposeFixtures,
  closeDatabase,
  origin,
  database,
  Channel,
  AuthSession,
  SessionParticipant,
} from './main-auth-media-harness.js';

beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);

it('replaces the login session and allows its new socket to create native media', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const peer = await f.signUp();
  await f.member(peer);
  const member = await enter(f, peer);
  const createTransport = (
    binding: Awaited<ReturnType<typeof enter>>,
    expectedPolicyRevision: number,
  ) =>
    binding.socket.timeout(5000).emitWithAck('media.transport.create', {
      ...binding.context,
      requestId: randomUUID(),
      expectedPolicyRevision,
      payload: { direction: 'SEND' },
    });
  expect((await createTransport(member, 2)).data?.status).toBe('completed');
  const oldTransport = f.native[0]!;
  const replacement = await f.loginAgain(peer);
  await vi.waitFor(() => expect(member.socket.connected).toBe(false));
  expect(oldTransport.closed).toBe(true);
  expect((await ticket(f, peer)).status).toBe(401);
  const next = await enter(f, replacement);
  expect((await createTransport(next, next.snapshot.policyRevision)).data?.status).toBe(
    'completed',
  );
  expect(f.native[1]!.closed).toBe(false);
  expect(host.socket.connected).toBe(true);
});

it('closes native media when the authenticated socket session expires', async () => {
  const f = await setup({ productionRuntime: true });
  await AuthSession.updateOne(
    { _id: f.host.auth.authSessionId },
    { expiresAt: new Date(Date.now() + 3000) },
  );
  const host = await enter(f);
  const transport = await host.socket.timeout(5000).emitWithAck('media.transport.create', {
    ...host.context,
    requestId: randomUUID(),
    expectedPolicyRevision: 1,
    payload: { direction: 'SEND' },
  });
  expect(transport.data?.status).toBe('completed');
  await vi.waitFor(
    () => {
      expect(host.socket.connected).toBe(false);
      expect(f.native[0]!.closed).toBe(true);
    },
    { timeout: 6000 },
  );
  expect((await ticket(f)).status).toBe(401);
});

type Fixture = Awaited<ReturnType<typeof setup>>;
async function ticket(f: Fixture, account = f.host, channelId = f.channel.id) {
  return f.http
    .post(`/api/v1/channels/${channelId}/live-session/join`)
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .set('X-CSRF-Token', account.data.csrfToken)
    .send({ requestId: randomUUID() });
}
async function enter(f: Fixture, account = f.host) {
  const response = await ticket(f, account);
  expect(response.status).toBe(200);
  const socket = await f.connect(account);
  const requestId = randomUUID();
  const snapshots: unknown[] = [];
  socket.once('session.snapshot', (value: unknown) => snapshots.push(value));
  const ack = await socket
    .timeout(5000)
    .emitWithAck('session.join', { requestId, ticket: response.body.data.ticket });
  expect(ack.data?.status).toBe('completed');
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  const snapshot = sessionSnapshotPartSchema.parse(snapshots[0]);
  expect(snapshot).toMatchObject({ requestId, snapshotId: ack.data.result.snapshot.snapshotId });
  const context = {
    sessionId: response.body.data.sessionId,
    epoch: response.body.data.epoch,
    callGeneration: ack.data.result.callGeneration,
  };
  return { socket, context, snapshot, result: ack.data.result };
}

it('enters MAIN through the mounted HTTP ticket and authenticated socket using the application composition', async () => {
  const f = await setup({ productionRuntime: true });
  const ticket = await f.http
    .post(`/api/v1/channels/${f.channel.id}/live-session/join`)
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({ requestId: randomUUID() })
    .expect(200);
  expect(ticket.headers['cache-control']).toContain('no-store');
  const socket = await f.connect(f.host);
  const joined = await socket.timeout(5000).emitWithAck('session.join', {
    requestId: randomUUID(),
    ticket: ticket.body.data.ticket,
  });
  expect(joined).toMatchObject({ data: { status: 'completed' } });
  const transport = await socket.timeout(5000).emitWithAck('media.transport.create', {
    requestId: randomUUID(),
    sessionId: ticket.body.data.sessionId,
    epoch: ticket.body.data.epoch,
    callGeneration: joined.data.result.callGeneration,
    expectedPolicyRevision: 1,
    payload: { direction: 'SEND' },
  });
  expect(transport).toMatchObject({ data: { status: 'completed' } });
});

it('allows a member to leave without disconnecting its auth socket or waiting reconnect grace', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await f.connect(f.host);
  await f.join(f.host, host);
  const peer = await f.signUp();
  await f.member(peer);
  const socket = await f.connect(peer);
  const joined = await f.join(peer, socket);
  const result = await socket.timeout(5000).emitWithAck('session.leave', {
    requestId: randomUUID(),
    sessionId: joined.ticket.sessionId,
    epoch: joined.ticket.epoch,
    callGeneration: joined.result.callGeneration,
    expectedPolicyRevision: 2,
  });
  expect(result).toMatchObject({ data: { status: 'completed', result: { left: true } } });
  expect(socket.connected).toBe(true);
  expect(f.registry.stats().ownerships).toBe(1);
});

it('returns correlated schema-valid errors for malformed leave commands and explicit host leave', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const requestId = randomUUID();
  const leave = async (payload: unknown) =>
    sessionLeaveAckSchema.parse(
      await host.socket.timeout(5000).emitWithAck('session.leave', payload),
    );
  expect(await leave({ requestId })).toMatchObject({
    requestId,
    error: { code: 'VALIDATION_ERROR' },
  });
  expect(await leave({})).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  expect(
    await leave({
      requestId,
      ...host.context,
      expectedPolicyRevision: host.snapshot.policyRevision,
    }),
  ).toMatchObject({ requestId, error: { code: 'FORBIDDEN' } });
  expect(f.registry.stats().ownerships).toBe(1);
});

it('completes a pending member leave on retry after its late native transport is closed', async () => {
  const f = await setup({ productionRuntime: true });
  await enter(f);
  const peer = await f.signUp();
  await f.member(peer);
  const member = await enter(f, peer);
  const command = {
    requestId: randomUUID(),
    ...member.context,
    expectedPolicyRevision: member.snapshot.policyRevision,
  };
  const leave = async () =>
    sessionLeaveAckSchema.parse(
      await member.socket.timeout(5000).emitWithAck('session.leave', command),
    );
  const entered = f.delayNext();
  const pendingTransport = member.socket.timeout(10_000).emitWithAck('media.transport.create', {
    ...command,
    requestId: randomUUID(),
    payload: { direction: 'SEND' },
  });
  try {
    await entered;
    expect(f.native).toHaveLength(1);
    expect(f.native[0]!.closed).toBe(false);
    expect(await leave()).toMatchObject({
      requestId: command.requestId,
      data: { status: 'pending', result: { left: false, cleanupPending: true } },
    });
  } finally {
    f.release();
  }
  expect(mediaTransportCreateAckSchema.parse(await pendingTransport)).toHaveProperty('error');
  await vi.waitFor(() => expect(f.native[0]!.closed).toBe(true));
  const completed = await leave();
  expect(completed).toMatchObject({
    requestId: command.requestId,
    data: { status: 'completed', result: { left: true, cleanupPending: false } },
  });
  expect(await leave()).toEqual(completed);
  expect(f.registry.stats().ownerships).toBe(1);
  expect(member.socket.connected).toBe(true);
  expect(
    (
      await SessionParticipant.findOne({
        sessionId: member.context.sessionId,
        userId: peer.auth.userId,
      }).lean()
    )?.leftAt,
  ).toBeInstanceOf(Date);
});

it('rejects invalid auth, CSRF, outsiders, TEXT and PRIVATE through the real ticket route', async () => {
  const f = await setup({ productionRuntime: true });
  const url = `/api/v1/channels/${f.channel.id}/live-session/join`;
  await f.http.post(url).send({ requestId: randomUUID() }).expect(401);
  await f.http
    .post(url)
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .send({ requestId: randomUUID() })
    .expect(403);
  const outsider = await f.signUp();
  expect((await ticket(f, outsider)).status).toBe(404);
  for (const input of [
    { type: 'TEXT', accessMode: 'WORKSPACE' },
    { type: 'LIVE', accessMode: 'PRIVATE' },
  ] as const) {
    const channel = await Channel.create({
      ...input,
      workspaceId: f.target.workspaceId,
      name: 'deny',
    });
    expect((await ticket(f, f.host, channel.id)).status).toBe(403);
  }
  await f.http
    .post(url)
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({ requestId: randomUUID(), workspaceId: f.target.workspaceId })
    .expect(400);
  expect(f.registry.stats().rooms).toBe(0);
  f.setRuntimeReady(false);
  expect((await ticket(f)).status).toBe(503);
  expect(f.registry.stats().rooms).toBe(0);
});

it('invalidates pending native create on logout, closes its late resource and never resurrects its generation', async () => {
  const f = await setup({ productionRuntime: true });
  const peer = await f.signUp();
  await f.member(peer);
  const host = await enter(f);
  const other = await enter(f, peer);
  const created = f.delayNext();
  const pending = host.socket
    .timeout(5000)
    .emitWithAck('media.transport.create', {
      requestId: randomUUID(),
      ...host.context,
      expectedPolicyRevision: 2,
      payload: { direction: 'SEND' },
    })
    .catch(() => undefined);
  await created;
  const logout = () =>
    f.http
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', f.host.cookie)
      .set('X-CSRF-Token', f.host.data.csrfToken)
      .send({});
  try {
    await logout().expect(503);
    expect(f.revocations.isSessionDenied(f.host.auth)).toBe(true);
    expect((await ticket(f)).status).toBe(401);
  } finally {
    f.release();
  }
  await vi.waitFor(() => expect(f.native[0]!.closed).toBe(true));
  await logout().expect(200);
  expect(f.registry.stats().ownerships).toBe(1);
  expect(other.socket.connected).toBe(true);
  const reply = await pending;
  if (reply !== undefined) expect(reply).toHaveProperty('error');
});

it('closes resources on actual disconnect and resumes only the new socket generation', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const transport = await host.socket.timeout(5000).emitWithAck('media.transport.create', {
    requestId: randomUUID(),
    ...host.context,
    expectedPolicyRevision: 1,
    payload: { direction: 'SEND' },
  });
  expect(transport.data?.status).toBe('completed');
  host.socket.disconnect();
  await vi.waitFor(() => expect(f.native[0]!.closed).toBe(true));
  const socket = await f.connect(f.host);
  const resumed = await socket.timeout(5000).emitWithAck('session.resume', {
    requestId: randomUUID(),
    ...host.context,
    resumeTicket: host.result.resumeTicket,
  });
  expect(resumed.data?.status).toBe('completed');
  expect(resumed.data.result.callGeneration).toBeGreaterThan(host.context.callGeneration);
  const resync = await socket.timeout(5000).emitWithAck('session.resync', {
    requestId: randomUUID(),
    ...host.context,
    callGeneration: resumed.data.result.callGeneration,
    payload: {},
  });
  expect(resync.data?.status).toBe('completed');
  const stale = await socket.timeout(5000).emitWithAck('media.transport.create', {
    requestId: randomUUID(),
    ...host.context,
    expectedPolicyRevision: 3,
    payload: { direction: 'SEND' },
  });
  expect(stale).toHaveProperty('error');
});

it('ends the host session, closes native resources and notifies every current ownership', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const peer = await f.signUp();
  await f.member(peer);
  const member = await enter(f, peer);
  const transport = mediaTransportCreateAckSchema.parse(
    await member.socket.timeout(5000).emitWithAck('media.transport.create', {
      ...member.context,
      requestId: randomUUID(),
      expectedPolicyRevision: member.snapshot.policyRevision,
      payload: { direction: 'SEND' },
    }),
  );
  if ('error' in transport) throw new Error(transport.error.code);
  expect(f.native).toHaveLength(1);
  expect(f.native[0]).toMatchObject({ id: transport.data.result.transportId, closed: false });
  const recipients = [host, member].map((joined) => {
    const notices: unknown[] = [];
    joined.socket.on('session.ended', (value: unknown) => notices.push(value));
    return { joined, notices };
  });
  const command = {
    requestId: randomUUID(),
    ...host.context,
    expectedPolicyRevision: 2,
    action: 'END',
  };
  const denied = await member.socket
    .timeout(5000)
    .emitWithAck('session.end', { ...command, ...member.context });
  expect(denied.error?.code).toBe('FORBIDDEN');
  const result = await host.socket.timeout(5000).emitWithAck('session.end', command);
  expect(result).toMatchObject({ data: { status: 'completed', result: { state: 'ENDED' } } });
  for (const { joined, notices } of recipients) {
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(
      isSessionEndedNoticeCurrent(sessionEndedEventSchema.parse(notices[0]), joined.snapshot),
    ).toBe(true);
  }
  expect(f.native[0]!.closed).toBe(true);
  expect(f.registry.stats()).toMatchObject({ rooms: 0, ownerships: 0 });
  expect(
    await SessionParticipant.countDocuments({ sessionId: host.context.sessionId, leftAt: null }),
  ).toBe(0);
  expect(host.socket.connected).toBe(true);
});

it.each(['messaging', 'board'] as const)(
  'keeps end incomplete while an unhandled %s artifact exists, then retries the same operation',
  async (domain) => {
    const f = await setup({ productionRuntime: true });
    const host = await enter(f);
    const collection = database.connection.db!.collection(
      domain === 'messaging' ? 'conversations' : 'files',
    );
    const artifact = await collection.insertOne(
      domain === 'messaging'
        ? {
            kind: 'SESSION',
            scope: { sessionId: new Types.ObjectId(host.context.sessionId) },
            closedAt: null,
          }
        : {
            purpose: 'FRAME',
            scope: { sessionId: new Types.ObjectId(host.context.sessionId) },
            state: 'READY',
          },
    );
    const command = {
      requestId: randomUUID(),
      ...host.context,
      expectedPolicyRevision: 1,
      action: 'END',
    };
    try {
      const pending = await host.socket.timeout(5000).emitWithAck('session.end', command);
      expect(pending).toMatchObject({
        data: { status: 'pending', result: { cleanupPending: true } },
      });
      expect(f.registry.stats().ownerships).toBe(1);
      if (domain === 'board') {
        for (const scheduled of [
          { state: 'READY', cleanupAfter: new Date() },
          { state: 'DELETE_PENDING', cleanupAfter: null },
        ]) {
          expect(
            (await collection.updateOne({ _id: artifact.insertedId }, { $set: scheduled }))
              .matchedCount,
          ).toBe(1);
          const retry = await host.socket.timeout(5000).emitWithAck('session.end', command);
          expect(retry).toMatchObject({
            data: { status: 'pending', result: { cleanupPending: true } },
          });
          expect(f.registry.stats().ownerships).toBe(1);
        }
      }
    } finally {
      await collection.deleteOne({ _id: artifact.insertedId });
    }
    const complete = await host.socket.timeout(5000).emitWithAck('session.end', command);
    expect(complete).toMatchObject({ data: { status: 'completed' } });
    expect(f.registry.stats().ownerships).toBe(0);
  },
);

it('mounts device publication, source resync, bootstrap proof and cleanup through the same real runtime', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const command = { requestId: randomUUID(), ...host.context, expectedPolicyRevision: 1 };
  const transport = await host.socket
    .timeout(5000)
    .emitWithAck('media.transport.create', { ...command, payload: { direction: 'SEND' } });
  expect(transport.data?.status).toBe('completed');
  const producer = await host.socket.timeout(5000).emitWithAck('media.producer.create', {
    ...command,
    requestId: randomUUID(),
    payload: {
      transportId: transport.data.result.transportId,
      sourceKind: 'MIC',
      rtpParameters: {
        codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }],
        encodings: [{ ssrc: 12345678 }],
      },
    },
  });
  expect(producer).toMatchObject({ data: { status: 'completed' } });
  const snapshots: unknown[] = [];
  host.socket.on('media.sources.snapshot', (value: unknown) => snapshots.push(value));
  const resync = await host.socket
    .timeout(5000)
    .emitWithAck('media.sources.resync', { ...host.context, requestId: randomUUID(), payload: {} });
  expect(resync.data?.status).toBe('completed');
  await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
  expect(snapshots[0]).toMatchObject({
    payload: { ownProducers: [{ source: { producerId: producer.data.result.producerId } }] },
  });
  const proof = await host.socket
    .timeout(5000)
    .emitWithAck('media.httpContext.issue', { ...command, requestId: randomUUID(), payload: {} });
  expect(proof.data?.status).toBe('completed');
  const query = { epoch: host.context.epoch, callGeneration: String(host.context.callGeneration) };
  await f.http
    .get(`/api/v1/live-sessions/${host.context.sessionId}/media/bootstrap`)
    .set('Cookie', f.host.cookie)
    .set('X-Media-Context', proof.data.result.token)
    .query(query)
    .expect(200);
  await f.http
    .post('/api/v1/auth/logout')
    .set('Origin', origin)
    .set('Cookie', f.host.cookie)
    .set('X-CSRF-Token', f.host.data.csrfToken)
    .send({})
    .expect(200);
  expect((await AuthSession.findById(f.host.auth.authSessionId).lean())?.revokedAt).toBeInstanceOf(
    Date,
  );
  await vi.waitFor(() => expect(host.socket.connected).toBe(false));
  expect(f.registry.stats().ownerships).toBe(0);
});
