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
  Conversation,
  textConversationSubscribeAckSchema,
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

it('updates the existing MAIN client before its next media command', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const changes: { policyRevision: number; projectionSequence: number; projection: unknown }[] = [];
  host.socket.on('session.changed', (event) => changes.push(event));
  const account = await f.signUp();
  await f.member(account);
  const member = await enter(f, account);
  await vi.waitFor(() => expect(changes).toHaveLength(1));
  expect(changes[0]).toMatchObject({ policyRevision: 2, projectionSequence: 1 });
  expect(JSON.stringify(changes[0]!.projection)).toContain(member.result.participantId);
  const ack = await host.socket.timeout(5000).emitWithAck('media.transport.create', {
    ...host.context,
    requestId: randomUUID(),
    expectedPolicyRevision: changes[0]!.policyRevision,
    payload: { direction: 'SEND' },
  });
  expect(ack.data?.status).toBe('completed');
  const leave = await member.socket.timeout(5000).emitWithAck('session.leave', {
    ...member.context,
    requestId: randomUUID(),
    expectedPolicyRevision: 2,
  });
  expect(leave.data?.status).toBe('completed');
  await vi.waitFor(() => expect(changes).toHaveLength(2));
  expect(changes[1]).toMatchObject({ policyRevision: 3, projectionSequence: 2 });
  expect(JSON.stringify(changes[1]!.projection)).not.toContain(member.result.participantId);
});

it('hands the host call to another authenticated socket, closes old native media and supports switching back', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const status = await f.http
    .get(`/api/v1/channels/${f.channel.id}/live-session/ownership`)
    .set('Cookie', f.host.cookie)
    .expect(200);
  expect(status.body.data.activeCallGeneration).toBe(host.context.callGeneration);
  const created = await host.socket.timeout(5000).emitWithAck('media.transport.create', {
    ...host.context,
    requestId: randomUUID(),
    expectedPolicyRevision: 1,
    payload: { direction: 'SEND' },
  });
  expect(created.data?.status).toBe('completed');
  const oldTransport = f.native[0]!;
  const next = await f.connect(f.host);
  const notices: unknown[] = [];
  host.socket.on('session.transferred', (notice: unknown) => notices.push(notice));
  const response = await ticket(f);
  const join = await next.timeout(5000).emitWithAck('session.join', {
    requestId: randomUUID(),
    ticket: response.body.data.ticket,
    takeover: { confirmed: true, expectedCallGeneration: host.context.callGeneration },
  });
  expect(join.data?.status).toBe('completed');
  expect(join.data.result.participantId).toBe(host.result.participantId);
  await vi.waitFor(() => expect(host.socket.connected).toBe(false));
  expect(notices).toEqual([host.context]);
  expect(oldTransport.closed).toBe(true);
  expect(f.registry.stats().ownerships).toBe(1);
  expect(
    await SessionParticipant.countDocuments({ sessionId: host.context.sessionId, leftAt: null }),
  ).toBe(1);
  const backSocket = await f.connect(f.host);
  const backTicket = await ticket(f);
  const back = await backSocket.timeout(5000).emitWithAck('session.join', {
    requestId: randomUUID(),
    ticket: backTicket.body.data.ticket,
    takeover: { confirmed: true, expectedCallGeneration: join.data.result.callGeneration },
  });
  expect(back.data?.status).toBe('completed');
  await vi.waitFor(() => expect(next.connected).toBe(false));
  expect(f.registry.stats().ownerships).toBe(1);
});

it('reports closed native transport to its owner and preserves the replacement', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const create = () =>
    host.socket.timeout(5000).emitWithAck('media.transport.create', {
      ...host.context,
      requestId: randomUUID(),
      expectedPolicyRevision: 1,
      payload: { direction: 'RECV' },
    });
  const first = await create();
  expect(first.data?.status).toBe('completed');
  const snapshots: unknown[] = [];
  const closed: unknown[] = [];
  host.socket.on('media.sources.snapshot', (event) => snapshots.push(event));
  host.socket.on('media.transport.closed', (event) => closed.push(event));
  const sync = () =>
    host.socket.timeout(5000).emitWithAck('media.sources.resync', {
      ...host.context,
      requestId: randomUUID(),
      payload: {},
    });
  expect((await sync()).data?.status).toBe('completed');
  await vi.waitFor(() =>
    expect(snapshots[0]).toMatchObject({
      payload: { ownTransports: [{ transportId: first.data.result.transportId }] },
    }),
  );
  const old = f.native[0]!;
  old.close();
  const second = await create();
  expect(second.data?.status).toBe('completed');
  await vi.waitFor(() =>
    expect(closed).toEqual([
      expect.objectContaining({
        ...host.context,
        payload: { transportId: first.data.result.transportId, reason: 'TRANSPORT_FAILED' },
      }),
    ]),
  );
  // The fixture exposes a narrowed port, but this object is a native WebRtcTransport.
  (old as typeof old & { emit(event: 'dtlsstatechange', state: 'closed'): boolean }).emit(
    'dtlsstatechange',
    'closed',
  );
  expect((await sync()).data?.status).toBe('completed');
  await vi.waitFor(() =>
    expect(snapshots[1]).toMatchObject({
      payload: { ownTransports: [{ transportId: second.data.result.transportId }] },
    }),
  );
  expect(closed).toHaveLength(1);
  expect(f.native[1]!.closed).toBe(false);
});

it.each(['disconnect', 'revoke'] as const)('updates MAIN for peers after %s', async (action) => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const account = await f.signUp();
  await f.member(account);
  const revisions: {
    policyRevision: number;
    projectionSequence: number;
    projection: { participants: { participantId: string }[] };
  }[] = [];
  host.socket.on('session.changed', (event) => revisions.push(event));
  const member = await enter(f, account);
  await vi.waitFor(() => expect(revisions).toHaveLength(1));
  if (action === 'disconnect') member.socket.disconnect();
  else
    await f.http
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', account.cookie)
      .set('X-CSRF-Token', account.data.csrfToken)
      .send({})
      .expect(200);
  await vi.waitFor(() => expect(revisions).toHaveLength(2));
  expect(revisions[1]).toMatchObject({ policyRevision: 3, projectionSequence: 2 });
  expect(revisions[1]!.projection.participants.map((entry) => entry.participantId)).not.toContain(
    member.result.participantId,
  );
  expect(host.socket.connected).toBe(true);
});

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

it('lets a member leave and rejoin MAIN three times without waiting for reconnect grace', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const peer = await f.signUp();
  await f.member(peer);
  let joined = await enter(f, peer);
  for (let i = 0; i < 3; i++) {
    const previous = joined;
    const command = {
      ...previous.context,
      requestId: randomUUID(),
      expectedPolicyRevision: previous.snapshot.policyRevision,
    };
    const leave = () => previous.socket.timeout(5000).emitWithAck('session.leave', command);
    expect(await leave()).toMatchObject({ data: { status: 'completed', result: { left: true } } });
    expect(previous.socket.connected).toBe(true);
    expect(f.registry.stats().ownerships).toBe(1);
    joined = await enter(f, peer);
    expect(joined.context.epoch).toBe(host.context.epoch);
    expect(joined.context.callGeneration).toBeGreaterThan(previous.context.callGeneration);
    expect(await leave()).toMatchObject({ data: { status: 'completed', result: { left: true } } });
    const media = await joined.socket.timeout(5000).emitWithAck('media.transport.create', {
      ...joined.context,
      requestId: randomUUID(),
      expectedPolicyRevision: joined.snapshot.policyRevision,
      payload: { direction: 'SEND' },
    });
    expect(media.data?.status).toBe('completed');
  }
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

it('retries logout-all on the captured cohort without revoking a later MAIN login', async () => {
  const f = await setup({ productionRuntime: true, text: true });
  const host = await enter(f);
  const member = await f.signUp();
  await f.member(member);
  const otherOldSession = await f.loginStandalone(member);
  const old = await enter(f, member);
  const secondSocket = await f.connect(otherOldSession);
  const channel = await Channel.create({
    workspaceId: f.target.workspaceId,
    name: 'Cohort TEXT',
    type: 'TEXT',
    accessMode: 'WORKSPACE',
  });
  await Conversation.create({
    workspaceId: f.target.workspaceId,
    kind: 'CHANNEL',
    scope: { channelId: channel.id },
  });
  async function subscribe(socket: typeof old.socket) {
    const ack = textConversationSubscribeAckSchema.parse(
      await socket.timeout(5000).emitWithAck('conversation.subscribe', {
        requestId: randomUUID(),
        payload: { channelId: channel.id, rootMessageId: null },
      }),
    );
    if ('error' in ack) throw new Error('TEXT subscribe failed: ' + ack.error.code);
    return ack.data.subscriptionId;
  }
  const invalidated: unknown[] = [];
  old.socket.on('conversation.invalidated', (packet) => invalidated.push(packet));
  secondSocket.on('conversation.invalidated', (packet) => invalidated.push(packet));
  const subscriptions = [await subscribe(old.socket), await subscribe(secondSocket)];
  const userId = member.auth.userId;
  const event = {
    kind: 'USER_AUTH_SESSIONS' as const,
    userId,
    operationId: randomUUID(),
    revision: 0,
  };
  // The trusted coordinator port accepts persistence from its caller. There is no
  // public logout-all route. Use MongoDB here, and leave both cleanup ports real.
  const activeSessions = () =>
    AuthSession.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('_id')
      .lean();
  const prepareHeld = vi.fn(async () => ({
    authSessionIds: (await activeSessions()).map(({ _id }) => _id.toHexString()),
  }));
  const commitHeld = vi.fn(async (_held: unknown, ids: readonly string[]) => {
    await AuthSession.updateMany(
      { userId, _id: { $in: ids }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { writeConcern: { w: 'majority' } },
    );
    return 'committed' as const;
  });
  const revoke = () =>
    f.revocations.revoke({
      userId,
      event,
      persistence: {
        prepareHeld,
        commitHeld,
        reconcileHeld: async () => 'unknown' as const,
      },
    });
  const transport = (binding: typeof old, direction: 'SEND' | 'RECV') =>
    binding.socket.timeout(5000).emitWithAck('media.transport.create', {
      ...binding.context,
      requestId: randomUUID(),
      expectedPolicyRevision: binding.snapshot.policyRevision,
      payload: { direction },
    });
  const existing = await transport(old, 'RECV');
  expect(existing.data?.status).toBe('completed');
  const created = f.delayNext();
  const pending = transport(old, 'SEND').catch(() => undefined);
  await created;
  const originalIds = [member.auth.authSessionId, otherOldSession.auth.authSessionId];
  let nextLogin: typeof member;
  try {
    expect(await revoke()).toMatchObject({ operationId: event.operationId, cleanupPending: true });
    expect(commitHeld).not.toHaveBeenCalled();
    expect(f.native[0]!.closed).toBe(true);
    await vi.waitFor(() => expect(invalidated).toHaveLength(2));
    for (const subscriptionId of subscriptions)
      expect(invalidated).toContainEqual(
        expect.objectContaining({ subscriptionId, reason: 'ACCESS_REVOKED' }),
      );
    expect(f.revocations.revokedAuthSessions(event)).toEqual(expect.arrayContaining(originalIds));
    expect(f.revocations.revokedAuthSessions(event)).toHaveLength(2);
    expect((await ticket(f, member)).status).toBe(401);
    expect((await ticket(f, otherOldSession)).status).toBe(401);
    nextLogin = await f.loginStandalone(member);
    expect(f.revocations.isSessionDenied(nextLogin.auth)).toBe(false);
    expect((await ticket(f, nextLogin)).status).toBe(200);
  } finally {
    f.release();
  }
  await vi.waitFor(() => expect(f.native[1]!.closed).toBe(true));
  const pendingReply = await pending;
  if (pendingReply !== undefined) expect(pendingReply).toHaveProperty('error');
  const [first, concurrent] = await Promise.all([revoke(), revoke()]);
  expect(first).toMatchObject({
    operationId: event.operationId,
    permissionRevoked: true,
    pendingInvalidated: true,
    cleanupPending: false,
  });
  expect(concurrent).toEqual(first);
  expect(prepareHeld).toHaveBeenCalledOnce();
  expect(commitHeld).toHaveBeenCalledOnce();
  expect(commitHeld.mock.calls[0]![1]).toHaveLength(2);
  expect(commitHeld.mock.calls[0]![1]).toEqual(expect.arrayContaining(originalIds));
  expect(
    await AuthSession.countDocuments({ _id: { $in: originalIds }, revokedAt: { $ne: null } }),
  ).toBe(2);
  expect((await activeSessions()).map(({ _id }) => _id.toHexString())).toEqual([
    nextLogin.auth.authSessionId,
  ]);

  const next = await enter(f, nextLogin);
  expect(next.context.callGeneration).toBeGreaterThan(old.context.callGeneration);
  const nextTransport = await transport(next, 'SEND');
  expect(nextTransport.data?.status).toBe('completed');
  expect(await revoke()).toEqual(first);
  expect(commitHeld).toHaveBeenCalledOnce();
  expect(f.native[2]!.closed).toBe(false);
  expect(next.socket.connected).toBe(true);
  expect(host.socket.connected).toBe(true);
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

it('replays a lost resume intent after an actual socket disconnect with current authority', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  host.socket.disconnect();
  const socket = await f.connect(f.host);
  const replies = f.loseResumeAcks(socket);
  const command = {
    requestId: randomUUID(),
    ...host.context,
    resumeTicket: host.result.resumeTicket,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(socket.timeout(500).emitWithAck('session.resume', command)).rejects.toThrow();
  }
  expect(replies).toHaveLength(2);
  const accepted = replies[0] as {
    data: { result: { callGeneration: number; resumeTicket: string } };
  };
  expect(accepted.data.result.callGeneration).toBeGreaterThan(host.context.callGeneration);
  expect(replies[1]).toMatchObject({
    data: {
      result: {
        callGeneration: accepted.data.result.callGeneration,
        resumeTicket: accepted.data.result.resumeTicket,
      },
    },
  });
  socket.disconnect();
  const next = await f.connect(f.host);
  const replay = await next.timeout(5000).emitWithAck('session.resume', command);
  expect(replay.data?.status).toBe('completed');
  // Each actual reconnect has a new generation; replay never revives the old socket.
  expect(replay.data.result.callGeneration).toBeGreaterThan(accepted.data.result.callGeneration);
  const duplicate = await next.timeout(5000).emitWithAck('session.resume', command);
  expect(duplicate).toMatchObject({
    data: {
      result: {
        callGeneration: replay.data.result.callGeneration,
        resumeTicket: replay.data.result.resumeTicket,
      },
    },
  });
  const resync = await next.timeout(5000).emitWithAck('session.resync', {
    requestId: randomUUID(),
    ...host.context,
    callGeneration: replay.data.result.callGeneration,
    payload: {},
  });
  expect(resync.data?.status).toBe('completed');
});

it.each(['host', 'member'] as const)(
  'discards queued old media grants while confirming %s departure',
  async (role) => {
    const f = await setup({ productionRuntime: true });
    let account = f.host;
    let host = await enter(f);
    if (role === 'member') {
      account = await f.signUp();
      await f.member(account);
      host = await enter(f, account);
    }
    const release = f.holdMainDelivery(host.socket);
    const reads = vi.spyOn(f.registry, 'withContext');
    const snapshot = vi.fn();
    const resyncAck = vi.fn();
    host.socket.on('media.sources.snapshot', snapshot);
    host.socket.emit(
      'media.sources.resync',
      {
        ...host.context,
        requestId: randomUUID(),
        payload: {},
      },
      resyncAck,
    );
    try {
      await vi.waitFor(() =>
        expect(reads.mock.results.filter((result) => result.type === 'return')).toHaveLength(2),
      );
      await Promise.all(reads.mock.results.map((result) => result.value));
      const ended = host.socket
        .timeout(5000)
        .emitWithAck(role === 'host' ? 'session.end' : 'session.leave', {
          ...host.context,
          requestId: randomUUID(),
          expectedPolicyRevision: host.snapshot.policyRevision,
          ...(role === 'host' && { action: 'HOST_LEAVE' }),
        });
      await vi.waitFor(() =>
        expect(f.registry.isContextRetired(host.socket.id!, host.context)).toBe(true),
      );
      release();
      expect(await ended).toMatchObject({
        data: {
          status: 'completed',
          result: role === 'host' ? { state: 'ENDED' } : { left: true },
        },
      });
      expect(snapshot).not.toHaveBeenCalled();
      expect(resyncAck).not.toHaveBeenCalled();
      expect(host.socket.connected).toBe(true);
      const next = await enter(f, account);
      if (role === 'host') expect(next.context.sessionId).not.toBe(host.context.sessionId);
      else expect(next.context.sessionId).toBe(host.context.sessionId);
    } finally {
      release();
      reads.mockRestore();
    }
  },
);

it('ends and immediately rejoins after host leave with an owned native SEND transport', async () => {
  const f = await setup({ productionRuntime: true });
  const host = await enter(f);
  const transport = await host.socket.timeout(5000).emitWithAck('media.transport.create', {
    ...host.context,
    requestId: randomUUID(),
    expectedPolicyRevision: host.snapshot.policyRevision,
    payload: { direction: 'SEND' },
  });
  expect(transport.data?.status).toBe('completed');
  const command = {
    ...host.context,
    expectedPolicyRevision: host.snapshot.policyRevision,
  };
  const lease = await host.socket.timeout(5000).emitWithAck('screen.acquire', {
    ...command,
    requestId: randomUUID(),
    payload: { scope: { type: 'MAIN' } },
  });
  expect(lease.data?.status).toBe('completed');
  const publication = await host.socket.timeout(5000).emitWithAck('media.producer.create', {
    ...command,
    requestId: randomUUID(),
    payload: {
      transportId: transport.data.result.transportId,
      sourceKind: 'SCREEN',
      lease: {
        leaseId: lease.data.result.leaseId,
        leaseGeneration: lease.data.result.leaseGeneration,
      },
      rtpParameters: {
        codecs: [{ mimeType: 'video/VP8', payloadType: 96, clockRate: 90000 }],
        encodings: [{ ssrc: 12345678 }],
      },
    },
  });
  expect(publication.data?.status).toBe('completed');
  expect(
    (
      await host.socket.timeout(5000).emitWithAck('media.sources.resync', {
        ...host.context,
        requestId: randomUUID(),
        payload: {},
      })
    ).data?.status,
  ).toBe('completed');
  const release = host.socket.timeout(5000).emitWithAck('screen.release', {
    ...command,
    requestId: randomUUID(),
    payload: {
      leaseId: lease.data.result.leaseId,
      leaseGeneration: lease.data.result.leaseGeneration,
    },
  });
  const result = await host.socket.timeout(5000).emitWithAck('session.end', {
    ...host.context,
    requestId: randomUUID(),
    expectedPolicyRevision: host.snapshot.policyRevision,
    action: 'HOST_LEAVE',
  });
  expect(result).toMatchObject({ data: { status: 'completed', result: { state: 'ENDED' } } });
  expect((await release).data?.status).toBe('completed');
  expect(f.native[0]!.closed).toBe(true);
  const next = await enter(f);
  expect(next.context.sessionId).not.toBe(host.context.sessionId);
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
      const blocked = await ticket(f, f.host);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('SESSION_END_PENDING');
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
    // A fresh join can progress the previous end even if its ACK was never observed.
    const next = await enter(f);
    expect(next.context.epoch).not.toBe(host.context.epoch);
    const complete = await host.socket.timeout(5000).emitWithAck('session.end', command);
    expect(complete).toMatchObject({ data: { status: 'completed' } });
    expect(f.registry.stats().ownerships).toBe(1);
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
