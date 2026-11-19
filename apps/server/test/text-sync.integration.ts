import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import request, { type Response } from 'supertest';
import { Types } from 'mongoose';
import { createWorkspaceCreator } from '../src/workspaces/create-workspace.js';
import { createChannelCreator } from '../src/workspaces/create-channel.js';
import { createChannelConversationFactory } from '../src/messaging/conversation.js';
import {
  textMessageHistoryResponseSchema,
  type TextHistoryMessage,
  type TextMessageHistoryPage,
} from '@colearnia/contracts';
import { hashAuthToken, authCookie } from '../src/auth/session-credentials.js';
import { createTextService } from '../src/messaging/text-service.js';
import {
  fixture,
  service,
  revoke,
  AuthSession,
  ChannelAccessGrant,
  Message,
  Conversation,
  database,
  coordinator,
  access,
  secret,
  budget,
  syncLimits,
  server,
  config,
  control,
  readSession,
} from './text-sync.fixture.js';

it('subscribes before ACK, fixes H, reads majority snapshot and deduplicates the boundary event', async () => {
  const f = await fixture();
  await f.commit('before registration');
  const events: TextHistoryMessage[] = [];
  const order: string[] = [];
  f.socket.on('message.created', (event) => {
    events.push(event.message);
    order.push('event');
  });
  const original = service.subscribe;
  vi.spyOn(service, 'subscribe').mockImplementationOnce(async (...args) => {
    const ack = await original(...args);
    await f.commit('between H and ACK');
    return ack;
  });
  const subscription = await f.subscribe();
  order.push('ack');
  const response: Response = await f
    .read({
      mode: 'snapshot',
      syncToken: subscription.syncToken,
      throughCheckpoint: subscription.throughCheckpoint,
    })
    .expect(200)
    .expect('Cache-Control', 'no-store');
  const page: TextMessageHistoryPage = textMessageHistoryResponseSchema.parse(response.body).data;
  expect(page.items.map((row) => row.text)).toEqual(['before registration']);
  expect(events.map((row) => row.text)).toEqual(['between H and ACK']);
  expect(order).toEqual(['event', 'ack']);
  expect(new Set([...events, ...page.items].map((row) => row.id)).size).toBe(2);
  f.socket.disconnect();
});

it('catches up more than two pages with fixed L/H, equal timestamps and a commit during pagination', async () => {
  const f = await fixture();
  const baseline = await f.subscribe();
  await f
    .read({
      mode: 'snapshot',
      syncToken: baseline.syncToken,
      throughCheckpoint: baseline.throughCheckpoint,
    })
    .expect(200);
  const committed: TextHistoryMessage[] = [];
  for (let i = 0; i < 63; i++) committed.push(await f.commit('history ' + i, false));
  const subscription = await f.subscribe(baseline.throughCheckpoint);
  const events: TextHistoryMessage[] = [];
  f.socket.on('message.created', (event) => events.push(event.message));
  const items: TextHistoryMessage[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const response: Response = await f
      .read({
        mode: 'catch-up',
        afterCheckpoint: baseline.throughCheckpoint,
        throughCheckpoint: subscription.throughCheckpoint,
        syncToken: subscription.syncToken,
        limit: 20,
        ...(cursor && { cursor }),
      })
      .expect(200);
    const page: TextMessageHistoryPage = textMessageHistoryResponseSchema.parse(response.body).data;
    expect(page).toMatchObject({
      mode: 'catch-up',
      throughCheckpoint: subscription.throughCheckpoint,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    pages++;
    if (pages === 1) await f.commit('after fixed H during pages');
  } while (cursor);
  expect(pages).toBe(4);
  expect(items.map((row) => row.id)).toEqual(committed.map((row) => row.id));
  expect(events.some((row) => row.text === 'after fixed H during pages')).toBe(true);
  expect(new Set([...items, ...events].map((row) => row.id)).size).toBe(64);
  f.socket.disconnect();
});

it('rejects token/cursor misuse and rechecks PRIVATE grants and durable session revoke', async () => {
  const f = await fixture(true);
  await expect(f.subscribe()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const grant = await ChannelAccessGrant.create({
    workspaceId: f.workspace._id,
    channelId: f.channel._id,
    membershipId: f.member._id,
    membershipIncarnation: 1,
    grantedByUserId: f.user._id,
    grantedAt: new Date(),
    revokedAt: null,
  });
  const base = await f.subscribe();
  await f.commit('one');
  await f.commit('two');
  const sub = await f.subscribe(base.throughCheckpoint);
  const query = {
    mode: 'catch-up',
    syncToken: sub.syncToken,
    afterCheckpoint: base.throughCheckpoint,
    throughCheckpoint: sub.throughCheckpoint,
    limit: 1,
  };
  const first = await f.read(query).expect(200);
  const cursor = first.body.data.nextCursor as string;
  expect(cursor).toBeTypeOf('string');
  await f.read({ ...query, throughCheckpoint: base.throughCheckpoint }).expect(409);
  const another = await f.subscribe(base.throughCheckpoint);
  await f.read({ ...query, syncToken: another.syncToken, cursor }).expect(409);
  await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { revokedAt: new Date() } });
  await f.read({ ...query, cursor }).expect(403);
  await ChannelAccessGrant.updateOne({ _id: grant._id }, { $set: { revokedAt: null } });
  const invalidations: unknown[] = [];
  f.socket.on('conversation.invalidated', (event) => invalidations.push(event));
  expect(await revoke.revoke(f.identity)).toBe(true);
  await f.read({ limit: 1 }).expect(401);
  expect(await AuthSession.findById(f.session._id).lean()).toMatchObject({
    revokedAt: expect.any(Date),
  });
  // Native cleanup removed old registrations before the durable revoke succeeded.
  expect(
    invalidations.some(
      (event) =>
        event &&
        typeof event === 'object' &&
        'reason' in event &&
        event.reason === 'ACCESS_REVOKED',
    ),
  ).toBe(true);
});

it('expires leases, rejects another session and preserves legacy snapshot/older-page rows', async () => {
  const f = await fixture();
  const short = createTextService(
    database,
    coordinator,
    access,
    () => true,
    secret,
    budget,
    undefined,
    false,
    { ...syncLimits, leaseMs: 100 },
    () => true, // Isolated expiry probe, no runtime admission.
  );
  try {
    const lease = await short.subscribe(f.identity, f.channel.id, 'short-test', () => true);
    await delay(130);
    await expect(
      short.history(f.identity, f.channel.id, {
        mode: 'snapshot',
        syncToken: lease.syncToken,
        throughCheckpoint: lease.throughCheckpoint,
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  } finally {
    short.stop();
  }
  await Message.create({
    conversationId: f.conversation._id,
    senderId: f.user._id,
    clientMessageId: randomUUID(),
    text: 'legacy',
    createdAt: new Date('2020-01-01T00:00:00Z'),
  });
  await f.commit('new root');
  const lease = await f.subscribe();
  const snapshot = await f
    .read({
      mode: 'snapshot',
      syncToken: lease.syncToken,
      throughCheckpoint: lease.throughCheckpoint,
      limit: 1,
    })
    .expect(200);
  await f.commit('later root');
  const older = await f.read({ cursor: snapshot.body.data.nextCursor, limit: 1 }).expect(200);
  expect(older.body.data.items).toMatchObject([{ text: 'legacy' }]);
  const otherToken = randomBytes(32).toString('base64url');
  await AuthSession.create({
    userId: f.user._id,
    tokenHash: hashAuthToken(otherToken),
    expiresAt: new Date(Date.now() + 60000),
  });
  await request(server)
    .get('/api/v1/channels/' + f.channel.id + '/messages')
    .set('Cookie', authCookie + '=' + otherToken)
    .query({
      mode: 'snapshot',
      syncToken: lease.syncToken,
      throughCheckpoint: lease.throughCheckpoint,
    })
    .expect(409);
  f.socket.disconnect();
});

it('keeps both send transports disabled with history/subscription budgets only', async () => {
  const f = await fixture();
  await request(server)
    .post('/api/v1/channels/' + f.channel.id + '/messages')
    .set('Cookie', f.cookie)
    .set('Origin', config.APP_ORIGIN)
    .set('X-CSRF-Token', f.csrf.token)
    .send({ clientMessageId: randomUUID(), text: 'still disabled' })
    .expect(503);
  const reply = await f.socket.timeout(3000).emitWithAck('message.send', {
    requestId: randomUUID(),
    payload: { channelId: f.channel.id, clientMessageId: randomUUID(), text: 'still disabled' },
  });
  expect(reply).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
  expect(await Message.countDocuments({ conversationId: f.conversation._id })).toBe(0);
  expect((await Conversation.findById(f.conversation._id).lean())?.lastMessageCommitSeq ?? 0).toBe(
    0,
  );
  f.socket.disconnect();
});

it('does not admit subscriptions before the exact messaging cleanup adapter is bound', async () => {
  const f = await fixture();
  const unbound = createTextService(
    database,
    coordinator,
    access,
    () => true,
    secret,
    budget,
    undefined,
    false,
    syncLimits,
  );
  try {
    await expect(
      unbound.subscribe(f.identity, f.channel.id, 'unbound', () => true),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  } finally {
    unbound.stop();
    f.socket.disconnect();
  }
});

it('invalidates a slow event sink instead of keeping an apparently complete subscription', async () => {
  const f = await fixture();
  const emitted = vi.fn(() => false);
  const lease = await service.subscribe(f.identity, f.channel.id, 'slow-sink', emitted);
  await f.commit('cannot be delivered');
  expect(emitted).toHaveBeenCalledWith(
    'message.created',
    expect.objectContaining({ subscriptionId: lease.subscriptionId }),
  );
  expect(emitted).toHaveBeenCalledWith('conversation.invalidated', {
    subscriptionId: lease.subscriptionId,
    reason: 'RESYNC_REQUIRED',
  });
  await f
    .read({
      mode: 'snapshot',
      syncToken: lease.syncToken,
      throughCheckpoint: lease.throughCheckpoint,
    })
    .expect(409);
  f.socket.disconnect();
});

it('uses commit order rather than preallocated IDs and allows counter gaps from another scope', async () => {
  const f = await fixture();
  const earlyId = new Types.ObjectId();
  const baseline = await f.subscribe();
  const first = await f.commit('later ID commits first', false);
  await coordinator.run({ userId: f.user.id, workspaceId: f.workspace.id }, () =>
    database.transaction(async (session) => {
      const conversation = await Conversation.findOneAndUpdate(
        { _id: f.conversation._id },
        { $inc: { lastMessageCommitSeq: 1 } },
        { session, returnDocument: 'after' },
      ).orFail();
      await new Message({
        _id: earlyId,
        conversationId: f.conversation._id,
        senderId: f.user._id,
        clientMessageId: randomUUID(),
        text: 'early ID commits later',
        createdAt: new Date('2026-11-18T00:00:00Z'),
        commitSeq: conversation.lastMessageCommitSeq,
      }).save({ session });
      // Simulates a committed sequence assigned to a different timeline/thread scope.
      await Conversation.updateOne(
        { _id: f.conversation._id },
        { $inc: { lastMessageCommitSeq: 1 } },
        { session },
      );
    }),
  );
  expect(earlyId.toHexString() < first.id).toBe(true);
  const lease = await f.subscribe(baseline.throughCheckpoint);
  const response = await f
    .read({
      mode: 'catch-up',
      syncToken: lease.syncToken,
      afterCheckpoint: baseline.throughCheckpoint,
      throughCheckpoint: lease.throughCheckpoint,
      limit: 50,
    })
    .expect(200);
  expect(response.body.data.items.map((row: TextHistoryMessage) => row.commitSeq)).toEqual([1, 2]);
  expect(response.body.data.items.map((row: TextHistoryMessage) => row.id)).toEqual([
    first.id,
    earlyId.toHexString(),
  ]);
  expect(response.body.data.nextCursor).toBeNull();
  f.socket.disconnect();
});

it('shares one pool and coordinator with auth, Workspace and channel creation under mixed work', async () => {
  const f = await fixture();
  const factory = createChannelConversationFactory(database.connection);
  const options = {
    database,
    coordinator,
    barrier: control.barrier,
    indexesReady: () => true,
    createConversation: factory.create,
  };
  const createWorkspace = createWorkspaceCreator(options);
  const createChannel = createChannelCreator(options);
  let checkedOut = 0;
  let peak = 0;
  const checkout = () => {
    checkedOut++;
    peak = Math.max(peak, checkedOut);
  };
  const checkin = () => {
    checkedOut--;
  };
  const client = database.connection.getClient();
  client.on('connectionCheckedOut', checkout);
  client.on('connectionCheckedIn', checkin);
  const start = performance.now();
  try {
    const result = await Promise.all([
      f.subscribe(),
      f.read({ limit: 5 }).expect(200),
      readSession(f.authToken),
      createWorkspace({ requestId: randomUUID(), name: 'Mixed Workspace' }, f.identity),
      createChannel(
        { requestId: randomUUID(), name: 'Mixed channel', type: 'TEXT', accessMode: 'WORKSPACE' },
        f.workspace.id,
        f.identity,
      ),
    ]);
    expect(result[2]?.context.authSessionId).toBe(f.session.id);
    expect(result[0].subscriptionId).toBeTypeOf('string');
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(4);
    console.info(
      'SCRUM43_MIXED',
      JSON.stringify({
        elapsedMs: Math.round(performance.now() - start),
        peakCheckedOut: peak,
        maxPoolSize: 4,
        operations: result.length,
      }),
    );
  } finally {
    client.off('connectionCheckedOut', checkout);
    client.off('connectionCheckedIn', checkin);
    f.socket.disconnect();
  }
});

it('preserves request correlation on validation errors and ignores subscribe packets without ACK', async () => {
  const f = await fixture();
  const requestId = randomUUID();
  const invalid = await f.socket.timeout(3000).emitWithAck('conversation.subscribe', {
    requestId,
    payload: { channelId: 'bad-id', rootMessageId: null },
  });
  expect(invalid).toMatchObject({ requestId, error: { code: 'VALIDATION_ERROR' } });
  for (let i = 0; i < 6; i++)
    f.socket.emit('conversation.subscribe', {
      requestId: randomUUID(),
      payload: { channelId: f.channel.id, rootMessageId: null },
    });
  expect(await f.subscribe()).toMatchObject({ scope: { channelId: f.channel.id } });
  f.socket.disconnect();
});
