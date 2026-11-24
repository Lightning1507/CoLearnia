import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { AccessRevocation } from '@colearnia/contracts';
import {
  Channel,
  ChannelAccessGrant,
  Conversation,
  Membership,
  Message,
  Workspace,
  closeDatabase,
  database,
  disposeFixtures,
  initializeDatabase,
  origin,
  setup,
  textConversationSubscribeAckSchema,
} from './main-auth-media-harness.js';
import { createTextMessageRepository } from '../src/messaging/text-message.js';
import { createTextSendLedger, textSendLedgerIndex } from '../src/messaging/text-send-ledger.js';
import { createTextSyncRegistry } from '../src/messaging/text-sync.js';
import { testReplicaUri } from './replica-uri.js';

const remaining = () => 1500;
const fixture = () => database.connection.db!.collection(textSendLedgerIndex.collection);

beforeAll(async () => {
  await initializeDatabase();
  const { name, key, unique } = textSendLedgerIndex;
  await database.connection.db!.createCollection(textSendLedgerIndex.collection);
  await fixture().createIndex(key, { name, unique });
});
afterEach(disposeFixtures);
afterAll(closeDatabase);

async function channelFixture(accessMode: 'WORKSPACE' | 'PRIVATE' = 'WORKSPACE') {
  const ledger = createTextSendLedger(database, 2);
  await ledger.start(remaining);
  const f = await setup({ text: true, textSendLedger: ledger, productionRuntime: true });
  const account = await f.signUp();
  const membership = await f.member(account);
  const workspaceId = f.target.workspaceId;
  const channel = await Channel.create({ workspaceId, name: 'TEXT', type: 'TEXT', accessMode });
  const conversation = await Conversation.create({
    workspaceId,
    kind: 'CHANNEL',
    scope: { channelId: channel.id },
  });
  if (accessMode === 'PRIVATE') {
    await ChannelAccessGrant.create({
      workspaceId,
      channelId: channel.id,
      membershipId: membership.id,
      membershipIncarnation: membership.incarnation,
      grantedByUserId: f.host.auth.userId,
      grantedAt: new Date(),
    });
  }
  return {
    f,
    ledger,
    account,
    membership,
    channel,
    conversation,
    scope: {
      workspaceId,
      channelId: channel.id,
      authSessionId: account.auth.authSessionId,
      userId: account.auth.userId,
      conversationId: conversation._id,
      clientMessageId: randomUUID(),
    },
  };
}

it.each(['reserved', 'committed'] as const)(
  'recovers an unacknowledged intent after killing the old process (%s)',
  async (mode) => {
    const { scope, conversation } = await channelFixture();
    const script = `
    import { Types } from 'mongoose';
    import { createDatabase } from './src/lib/database.ts';
    import { createTextSendLedger } from './src/messaging/text-send-ledger.ts';
    import { createTextMessageRepository } from './src/messaging/text-message.ts';
    const db = createDatabase(process.env.TEST_TEXT_MONGO_URI);
    await db.connect();
    const ledger = createTextSendLedger(db, 2);
    await ledger.start(() => 3000);
    const scope = JSON.parse(process.env.TEST_TEXT_SCOPE);
    scope.conversationId = new Types.ObjectId(scope.conversationId);
    if (process.env.TEST_TEXT_EXIT_MODE === 'reserved') {
      await ledger.claim(scope, 'same intent', () => 2500);
    } else {
      const repo = createTextMessageRepository(db, undefined, ledger);
      const result = await repo.append({
        conversationId: scope.conversationId, senderId: new Types.ObjectId(scope.userId),
        clientMessageId: scope.clientMessageId, sendScope: scope,
        text: 'same intent', createdAt: new Date(),
      }, () => 2500);
      if (result.outcome !== 'created') process.exit(1);
    }
    process.send('ready');
    setInterval(() => {}, 1000);
  `;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: resolve(import.meta.dirname, '..'),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        env: {
          ...process.env,
          TEST_TEXT_MONGO_URI: testReplicaUri(database.connection.name),
          TEST_TEXT_SCOPE: JSON.stringify(scope),
          TEST_TEXT_EXIT_MODE: mode,
        },
      },
    );
    const exited = once(child, 'exit');
    child.stderr?.resume();
    try {
      const [event] = await Promise.race([once(child, 'message'), exited]);
      expect(event).toBe('ready');
      expect(await fixture().countDocuments({ conversationId: conversation._id })).toBe(
        mode === 'reserved' ? 1 : 0,
      );
    } finally {
      child.kill('SIGKILL');
      await exited;
    }
    const replacement = createTextSendLedger(database, 2);
    await replacement.start(remaining);
    expect(await fixture().countDocuments({ conversationId: conversation._id })).toBe(0);

    const repo = createTextMessageRepository(database, undefined, replacement);
    const input = {
      conversationId: conversation._id,
      clientMessageId: scope.clientMessageId,
      senderId: new Types.ObjectId(scope.userId),
      sendScope: scope,
      createdAt: new Date(),
      text: 'same intent',
    };
    const result = await repo.append(input, remaining);
    expect(result).toMatchObject({
      outcome: mode === 'reserved' ? 'created' : 'existing',
      message: { commitSeq: 1 },
    });
    expect(await repo.append(input, remaining)).toMatchObject({
      outcome: 'existing',
      message: 'message' in result ? result.message : {},
    });
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(1);
  },
);

it('blocks startup behind the old write lock and fences the old reservation before reuse', async () => {
  const { ledger, scope } = await channelFixture();
  const pending = await ledger.claim(scope, 'pending', remaining);
  const old = await database.connection.startSession();
  const replacement = createTextSendLedger(database, 2);
  try {
    old.startTransaction();
    expect(await ledger.consume(pending, old, remaining)).toBe(true);
    await expect(replacement.start(() => 100)).rejects.toThrow();
    await expect(replacement.claim(scope, 'pending', remaining)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    await old.abortTransaction();
    await replacement.start(remaining);
    const next = await replacement.claim(scope, 'pending', remaining);
    expect(next._id).toBe(pending._id);
    expect(next.reservationId.equals(pending.reservationId)).toBe(false);
    await database.transaction(async (session) => {
      expect(await ledger.consume(pending, session, remaining)).toBe(false);
      expect(await replacement.consume(next, session, remaining)).toBe(true);
    });
  } finally {
    await old.endSession();
  }
});

it('limits durable reservations and keeps a late cleanup away from a newer reservation', async () => {
  const { ledger, scope } = await channelFixture();
  const old = await ledger.claim(scope, 'original', remaining);
  await expect(ledger.claim(scope, 'changed', remaining)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(ledger.claim(scope, 'original', remaining)).rejects.toMatchObject({
    code: 'DEPENDENCY_UNAVAILABLE',
  });
  const other = await ledger.claim(
    { ...scope, conversationId: new Types.ObjectId() },
    'other',
    remaining,
  );
  await expect(
    ledger.claim({ ...scope, conversationId: new Types.ObjectId() }, 'full', remaining),
  ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
  await ledger.fence(other, remaining);

  const sync = createTextSyncRegistry(randomUUID(), {
    subscriptions: 16,
    perUser: 4,
    leaseMs: 60_000,
    revocationRecords: 16,
  });
  const port = ledger.bindRevocation(sync.revocation);
  const input = {
    revocationId: randomUUID(),
    target: {
      kind: 'AUTH_SESSION' as const,
      userId: scope.userId,
      authSessionId: scope.authSessionId,
    },
  };
  const watermark = port.fence(input);
  const revoke = () =>
    port.revoke({
      ...input,
      ...watermark,
      deadlineMs: performance.now() + 1500,
      signal: new AbortController().signal,
    });
  try {
    expect(await revoke()).toMatchObject({ status: 'completed' });
    const newer = await ledger.claim(
      { ...scope, clientMessageId: randomUUID() },
      'newer',
      remaining,
    );
    expect(await revoke()).toMatchObject({ status: 'completed' });
    await database.transaction(async (session) => {
      expect(await ledger.consume(old, session, remaining)).toBe(false);
      expect(await ledger.consume(newer, session, remaining)).toBe(true);
    });
  } finally {
    sync.stop();
  }
});

it.each([
  'WORKSPACE_MEMBERSHIP',
  'PRIVATE_CHANNEL_ACCESS',
  'CHANNEL_DELETED',
  'WORKSPACE_DELETED',
] as const)('fences pending channel TEXT before committing durable revoke for %s', async (kind) => {
  const { f, ledger, account, membership, channel, conversation, scope } = await channelFixture(
    kind === 'PRIVATE_CHANNEL_ACCESS' ? 'PRIVATE' : 'WORKSPACE',
  );
  const socket = await f.connect(account);
  const subscribe = () =>
    socket.timeout(5000).emitWithAck('conversation.subscribe', {
      requestId: randomUUID(),
      payload: { channelId: channel.id, rootMessageId: null },
    });
  const subscribed = textConversationSubscribeAckSchema.parse(await subscribe());
  expect(subscribed).toHaveProperty('data.subscriptionId');
  const invalidated = new Promise<unknown>((done) => socket.once('conversation.invalidated', done));
  const intent = await ledger.claim(scope, 'old operation', remaining);
  const old = await database.connection.startSession();
  const shared = { workspaceId: scope.workspaceId, operationId: randomUUID() };
  const member = {
    userId: account.auth.userId,
    membershipId: membership.id,
    membershipIncarnation: membership.incarnation,
  };
  const workspace = await Workspace.findById(scope.workspaceId).orFail();
  const event: AccessRevocation =
    kind === 'WORKSPACE_MEMBERSHIP'
      ? { ...shared, ...member, kind, revision: membership.revision }
      : kind === 'PRIVATE_CHANNEL_ACCESS'
        ? { ...shared, ...member, kind, revision: channel.revision, channelId: channel.id }
        : kind === 'CHANNEL_DELETED'
          ? { ...shared, kind, revision: channel.revision, channelId: channel.id }
          : { ...shared, kind, revision: workspace.revision };
  const commitHeld = vi.fn(async () => {
    const writeConcern = { w: 'majority' } as const;
    if (kind === 'WORKSPACE_MEMBERSHIP') {
      await Membership.updateOne(
        { _id: membership._id, revision: membership.revision },
        { $set: { status: 'REMOVED', removedAt: new Date() }, $inc: { revision: 1 } },
        { writeConcern },
      );
    } else if (kind === 'PRIVATE_CHANNEL_ACCESS') {
      await database.transaction(async (session) => {
        await ChannelAccessGrant.updateOne(
          { channelId: channel.id, membershipId: membership.id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        );
        await Channel.updateOne({ _id: channel._id }, { $inc: { revision: 1 } }, { session });
      });
    } else if (kind === 'CHANNEL_DELETED') {
      await Channel.updateOne(
        { _id: channel._id, revision: channel.revision },
        { $set: { deletedAt: new Date() }, $inc: { revision: 1 } },
        { writeConcern },
      );
    } else {
      await Workspace.updateOne(
        { _id: workspace._id, revision: workspace.revision },
        { $set: { deletedAt: new Date() }, $inc: { revision: 1 } },
        { writeConcern },
      );
    }
    return 'committed' as const;
  });
  const revoke = () =>
    f.revocations.revoke({
      event,
      userId: account.auth.userId,
      persistence: {
        prepareHeld: async () => ({ authSessionIds: [] }),
        commitHeld,
        reconcileHeld: async () => 'unknown',
      },
    });
  let revoking: ReturnType<typeof revoke> | undefined;
  try {
    old.startTransaction();
    expect(await ledger.consume(intent, old, remaining)).toBe(true);
    revoking = revoke();
    await expect(invalidated).resolves.toMatchObject({ reason: 'ACCESS_REVOKED' });
    expect(commitHeld).not.toHaveBeenCalled();
    await old.abortTransaction();
    expect((await revoking).permissionRevoked).toBe(true);
    expect(commitHeld).toHaveBeenCalledOnce();
    await database.transaction(async (session) => {
      expect(await ledger.consume(intent, session, remaining)).toBe(false);
    });
    const send = await f.http
      .post('/api/v1/channels/' + channel.id + '/messages')
      .set('Cookie', account.cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', account.data.csrfToken)
      .send({ clientMessageId: scope.clientMessageId, text: 'old operation' })
      .expect(404);
    expect(send.body.error.code).toBe('NOT_FOUND');
    expect(await subscribe()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(await Message.countDocuments({ conversationId: conversation._id })).toBe(0);
  } finally {
    await old.endSession();
    await revoking?.catch(() => {});
  }
});
