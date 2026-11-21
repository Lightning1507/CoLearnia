import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  setup,
  initializeDatabase,
  disposeFixtures,
  closeDatabase,
  origin,
  Channel,
  Conversation,
  Message,
  Membership,
  ChannelAccessGrant,
  textConversationSubscribeAckSchema,
} from '../../apps/server/test/main-auth-media-harness.js';
import { createTextApi } from '../../apps/web/src/features/text/text-api.js';
import { createTextSynchronizer } from '../../apps/web/src/features/text/text-sync.js';

beforeAll(initializeDatabase);
afterEach(disposeFixtures);
afterAll(closeDatabase);

it('sends, retries and catches up with two registered accounts, then clears only revoked PRIVATE scope', async () => {
  const f = await setup({ text: true });
  const bob = await f.signUp();
  const membership = await f.member(bob);
  const channel = await Channel.create({
    workspaceId: f.target.workspaceId,
    name: 'TEXT integration',
    type: 'TEXT',
    accessMode: 'PRIVATE',
  });
  const conversation = await Conversation.create({
    workspaceId: f.target.workspaceId,
    kind: 'CHANNEL',
    scope: { channelId: channel.id },
  });
  const hostMembership = await Membership.findOne({
    workspaceId: f.target.workspaceId,
    userId: f.host.auth.userId,
  }).orFail();
  for (const member of [membership, hostMembership])
    await ChannelAccessGrant.create({
      workspaceId: f.target.workspaceId,
      channelId: channel.id,
      membershipId: member.id,
      membershipIncarnation: member.incarnation,
      grantedByUserId: f.host.auth.userId,
      grantedAt: new Date(),
    });
  const a = await f.connect(f.host);
  const b = await f.connect(bob);
  const api = (socket: typeof a, account: typeof bob, loseAck = false) => {
    let dropNextAck = loseAck;
    return createTextApi(
      socket,
      channel.id,
      account.data.csrfToken,
      f.baseUrl + '/api/v1',
      async (input, init) => {
        const response = await fetch(input, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            Cookie: account.cookie,
            Origin: origin,
          },
        });
        if (dropNextAck && init?.method === 'POST' && response.ok) {
          dropNextAck = false;
          await response.arrayBuffer();
          throw new TypeError('Simulated lost HTTP acknowledgement after commit');
        }
        return response;
      },
    );
  };
  const aliceApi = api(a, f.host);
  const bobApi = api(b, bob);
  const limits = {
    pageSize: 30,
    events: 32,
    messages: 100,
    bytes: 1_000_000,
    pages: 20,
    reconcileMs: 1000,
    roundMs: 5000,
  };
  const alice = createTextSynchronizer(aliceApi.sync, channel.id, limits, () => {});
  const reader = createTextSynchronizer(bobApi.sync, channel.id, limits, () => {});
  const signal = new AbortController().signal;
  try {
    const probe = textConversationSubscribeAckSchema.parse(
      await bobApi.sync.subscribe({ channelId: channel.id, rootMessageId: null }, signal),
    );
    if ('error' in probe) throw new Error('Subscribe preflight: ' + probe.error.code);
    await bobApi.sync.history(
      channel.id,
      {
        mode: 'snapshot',
        syncToken: probe.data.syncToken,
        throughCheckpoint: probe.data.throughCheckpoint,
        limit: 30,
      },
      signal,
    );
    bobApi.sync.unsubscribe(probe.data.subscriptionId);
    await Promise.all([alice.reconcile(), reader.reconcile()]);
    expect(reader.snapshot().phase).toBe('live');
    const intent = { clientMessageId: randomUUID(), text: 'Hai tài khoản thật' };
    await expect(api(a, f.host, true).send(intent, signal)).rejects.toThrow(
      'lost HTTP acknowledgement',
    );
    const first = await aliceApi.send(intent, signal);
    const retry = await aliceApi.send(intent, signal);
    expect(retry.id).toBe(first.id);
    await expect.poll(() => reader.snapshot().messages.map((row) => row.id)).toEqual([first.id]);
    b.disconnect();
    const offline = await aliceApi.send(
      { clientMessageId: randomUUID(), text: 'Khi bạn mất kết nối' },
      signal,
    );
    await new Promise<void>((resolve, reject) => {
      b.once('connect', resolve);
      b.once('connect_error', reject);
      b.connect();
    });
    await reader.reconcile();
    await expect
      .poll(() => reader.snapshot().messages.map((row) => row.id))
      .toEqual([first.id, offline.id]);
    const reply = await bobApi.send({ clientMessageId: randomUUID(), text: 'Đã nối lại' }, signal);
    await expect
      .poll(() => alice.snapshot().messages.map((row) => row.id))
      .toEqual([first.id, offline.id, reply.id]);
    const archive = createTextSynchronizer(
      aliceApi.sync,
      channel.id,
      { ...limits, pageSize: 1 },
      () => {},
    );
    try {
      await archive.reconcile();
      expect(archive.snapshot().messages.map((row) => row.id)).toEqual([reply.id]);
      const checkpoint = archive.snapshot().checkpoint;
      await archive.loadOlder();
      await archive.loadOlder();
      expect(archive.snapshot().messages.map((row) => row.id)).toEqual([
        first.id,
        offline.id,
        reply.id,
      ]);
      expect(archive.snapshot().checkpoint).toBe(checkpoint);
      expect(archive.snapshot().olderCursor).toBeNull();
    } finally {
      archive.stop();
    }
    // The isolated DB fixture withdraws the grant under the shared Workspace/User gate.
    // The normal history/subscription ACL then denies this scope at reconciliation.
    await f.coordinator.run(
      { userId: bob.auth.userId, workspaceId: f.target.workspaceId },
      async () => {
        await ChannelAccessGrant.updateOne(
          { channelId: channel.id, membershipId: membership.id },
          { $set: { revokedAt: new Date() } },
        );
      },
    );
    await reader.reconcile();
    expect(reader.snapshot()).toMatchObject({
      phase: 'revoked',
      messages: [],
      checkpoint: undefined,
      olderCursor: null,
    });
    await expect(
      bobApi.send({ clientMessageId: randomUUID(), text: 'Bị chặn' }, signal),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await alice.reconcile();
    expect(alice.snapshot().messages).toHaveLength(3);
    expect(await Message.countDocuments({ conversationId: conversation.id })).toBe(3);
    console.info(
      'PASS SCRUM-47: real registration/session, signed REST send/retry, Socket.IO delivery, offline catch-up, PRIVATE cache withdrawal; 3 persisted messages.',
    );
  } finally {
    alice.stop();
    reader.stop();
    a.disconnect();
    b.disconnect();
  }
});

// Optional local browser walkthrough. Owns only the randomized test database above.
// Start Vite with PORT set to the printed server port and use its normal auth/workspace routes.
it.runIf(process.env.COLEARNIA_TEXT_UI_DEMO === '1')(
  'keeps the real integration server available for browser verification',
  async () => {
    const f = await setup({ text: true, origin: 'http://127.0.0.1:5173', port: 30047 });
    console.info('SCRUM-47 browser server: ' + f.baseUrl);
    const deadline = Date.now() + 300_000;
    const stopFile = process.env.COLEARNIA_TEXT_UI_STOP_FILE;
    while (Date.now() < deadline && (!stopFile || !existsSync(stopFile)))
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
  },
  310_000,
);
