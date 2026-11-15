import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { preflightIndexes } from '../src/lib/database-preflight.js';
import { conversationModel } from '../src/messaging/conversation.js';
import {
  createTextMessageRepository,
  textMessageIndexes,
  textMessageModel,
} from '../src/messaging/text-message.js';
import { testReplicaUri } from './replica-uri.js';

const name = `colearnia_test_scrum41_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(name));
const messages = textMessageModel(database.connection);
const conversations = conversationModel(database.connection);
const repository = createTextMessageRepository(database);
const createdAt = new Date('2026-11-14T00:00:00Z');
let ownsDatabase = false;

async function conversation() {
  return conversations.create({
    workspaceId: new Types.ObjectId(),
    kind: 'CHANNEL',
    scope: { channelId: new Types.ObjectId() },
  });
}

beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(name);
  ownsDatabase = true;
  await conversations.createCollection();
  await messages.createCollection();
  await messages.createIndexes();
  expect(await preflightIndexes(database.connection, [...textMessageIndexes])).toEqual({
    ready: true,
    issues: [],
  });
});

afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === name) await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

it('enforces retry uniqueness and allocates commit sequences only for new messages', async () => {
  const { _id: conversationId } = await conversation();
  const input = {
    conversationId,
    senderId: new Types.ObjectId(),
    clientMessageId: randomUUID(),
    text: '  Chào 👋  ',
    createdAt,
  };
  const results = await Promise.all([repository.append(input), repository.append(input)]);
  expect(results.map(({ outcome }) => outcome).sort()).toEqual(['created', 'existing']);
  await expect(repository.append({ ...input, text: 'Khác' })).resolves.toEqual({
    outcome: 'conflict',
  });
  await expect(
    repository.append({ ...input, senderId: new Types.ObjectId() }),
  ).resolves.toMatchObject({
    outcome: 'created',
    message: { commitSeq: 2 },
  });
  await expect(messages.create(input)).rejects.toMatchObject({ code: 11000 });
  await expect(
    repository.append({ ...input, clientMessageId: randomUUID(), createdAt: new Date(NaN) }),
  ).rejects.toThrow();
  expect((await conversations.findById(conversationId).orFail()).lastMessageCommitSeq).toBe(2);
  expect(await messages.countDocuments({ conversationId })).toBe(2);
  expect(await messages.findOne({ conversationId, commitSeq: 1 }).lean()).toMatchObject({
    text: input.text,
    rootMessageId: null,
    replyCount: 0,
    attachmentIds: [],
  });
});

it('retries the same UUID across case variants without allocating another sequence', async () => {
  const { _id: conversationId } = await conversation();
  const clientMessageId = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  const input = {
    conversationId,
    senderId: new Types.ObjectId(),
    clientMessageId: clientMessageId.toUpperCase(),
    text: 'Chào',
    createdAt,
  };
  const first = await repository.append(input);
  expect(first).toMatchObject({ outcome: 'created', message: { clientMessageId, commitSeq: 1 } });
  if (first.outcome !== 'created') throw new Error('Expected a created message');
  await expect(repository.append({ ...input, clientMessageId })).resolves.toMatchObject({
    outcome: 'existing',
    message: { _id: first.message._id, clientMessageId, commitSeq: 1 },
  });
  expect(await messages.countDocuments({ conversationId })).toBe(1);
  expect((await conversations.findById(conversationId).orFail()).lastMessageCommitSeq).toBe(1);
});

it('rejects lone surrogates and preserves valid supplementary characters through retry', async () => {
  const { _id: conversationId } = await conversation();
  const input = {
    conversationId,
    senderId: new Types.ObjectId(),
    clientMessageId: randomUUID(),
    text: '  Chào 👋  ',
    createdAt,
  };
  for (const text of ['Hello \ud800', 'Hello \udc00']) {
    const invalid = { ...input, text };
    await expect(repository.append(invalid)).rejects.toMatchObject({ name: 'ZodError' });
    await expect(repository.append(invalid)).rejects.toMatchObject({ name: 'ZodError' });
  }
  expect(await messages.countDocuments({ conversationId })).toBe(0);
  expect(
    (await conversations.findById(conversationId).orFail()).lastMessageCommitSeq,
  ).toBeUndefined();
  await expect(repository.append(input)).resolves.toMatchObject({
    outcome: 'created',
    message: { text: input.text, commitSeq: 1 },
  });
  expect((await repository.listRoots(conversationId, 1)).items[0]?.text).toBe(input.text);
  await expect(repository.append(input)).resolves.toMatchObject({
    outcome: 'existing',
    message: { text: input.text, commitSeq: 1 },
  });
});

it('pages roots within one conversation by time and ID, including legacy roots', async () => {
  const { _id: conversationId } = await conversation();
  const { _id: otherId } = await conversation();
  const senderId = new Types.ObjectId();
  const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  for (const _id of ids) {
    await messages.create({
      _id,
      conversationId,
      senderId,
      text: 'Cũ',
      clientMessageId: randomUUID(),
      createdAt,
    });
  }
  await messages.collection.insertOne({
    conversationId,
    senderId,
    text: 'Reply',
    clientMessageId: randomUUID(),
    rootMessageId: ids[0],
    createdAt,
    attachmentIds: [],
  });
  await messages.create({
    conversationId: otherId,
    senderId,
    text: 'Kênh khác',
    clientMessageId: randomUUID(),
    createdAt,
  });
  const first = await repository.listRoots(conversationId, 2);
  expect(first.items.map(({ _id }) => _id)).toEqual([ids[2], ids[1]]);
  expect(first.items[0]?.commitSeq).toBeUndefined();
  expect(first.nextCursor).not.toBeNull();
  const second = await repository.listRoots(conversationId, 2, first.nextCursor!);
  expect(second.items.map(({ _id }) => _id)).toEqual([ids[0]]);
  expect(second.nextCursor).toBeNull();
  await expect(repository.listRoots(otherId, 2, first.nextCursor!)).rejects.toThrow(
    'Invalid text history cursor',
  );
});
