import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { testReplicaUri } from './replica-uri.js';

// Q9 spike only. No application collection or schema is changed.
type Message = {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  rootMessageId: Types.ObjectId | null;
  createdAt: Date;
  commitSeq: number;
};

const dbName = `colearnia_test_scrum38_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(testReplicaUri(dbName));
let ownsDatabase = false;
const db = () => database.connection.db!;
const counters = () => db().collection<{ _id: Types.ObjectId; lastMessageSeq: number }>('counters');
const messages = () => db().collection<Message>('messages');
const sameTime = new Date('2026-11-09T00:00:00Z');
const pageSize = 3;
const committedRead = { readConcern: { level: 'majority' }, readPreference: 'primary' } as const;

beforeAll(async () => {
  await database.connect();
  const hello = await db().admin().command({ hello: 1 });
  expect(hello).toMatchObject({ setName: 'rs0', isWritablePrimary: true });
  expect(database.connection.name).toBe(dbName);
  ownsDatabase = true;
  await db().createCollection('counters');
  await db().createCollection('messages');
  await messages().createIndex({ conversationId: 1, rootMessageId: 1, commitSeq: 1 });
});

afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === dbName)
      await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

async function fixture() {
  const conversationId = new Types.ObjectId();
  const listeners = new Set<(message: Message) => void>();
  await counters().insertOne({ _id: conversationId, lastMessageSeq: 0 });

  const highWater = async () =>
    (await counters().findOne({ _id: conversationId }, committedRead))!.lastMessageSeq;

  return {
    conversationId,
    highWater,
    async commit(
      id = new Types.ObjectId(),
      options: { beforeWrite?: Promise<void>; fail?: boolean; rootMessageId?: Types.ObjectId } = {},
    ) {
      const message = await database.transaction(async (session) => {
        await options.beforeWrite;
        const counter = await counters().findOneAndUpdate(
          { _id: conversationId },
          { $inc: { lastMessageSeq: 1 } },
          { session, returnDocument: 'after' },
        );
        if (!counter) throw new Error('Missing fixture counter');
        const message: Message = {
          _id: id,
          conversationId,
          rootMessageId: options.rootMessageId ?? null,
          createdAt: sameTime,
          commitSeq: counter.lastMessageSeq,
        };
        await messages().insertOne(message, { session });
        if (options.fail) throw new Error('injected rollback');
        return message;
      });
      for (const listener of listeners) listener(message);
      return message;
    },
    async subscribe(
      onEvent: (message: Message) => void,
      hooks: {
        beforeSnapshot?: () => Promise<unknown>;
        afterSnapshot?: () => Promise<unknown>;
      } = {},
    ) {
      listeners.add(onEvent);
      try {
        await hooks.beforeSnapshot?.();
        const through = await highWater();
        await hooks.afterSnapshot?.();
        return { through, close: () => listeners.delete(onEvent) };
      } catch (error) {
        listeners.delete(onEvent);
        throw error;
      }
    },
    async page(after: number, through: number, rootMessageId: Types.ObjectId | null = null) {
      const rows = await messages()
        .find(
          { conversationId, rootMessageId, commitSeq: { $gt: after, $lte: through } },
          committedRead,
        )
        .sort({ commitSeq: 1 })
        .limit(pageSize + 1)
        .toArray();
      const items = rows.slice(0, pageSize);
      return { items, next: rows.length > pageSize ? items.at(-1)!.commitSeq : null };
    },
  };
}

function buffer(maxEvents: number, maxBytes = 4096) {
  const pending = new Map<string, Message>();
  let bytes = 0;
  let invalidated = false;
  function invalidate() {
    invalidated = true;
    pending.clear();
    bytes = 0;
  }
  return {
    push(message: Message) {
      const key = message._id.toHexString();
      if (invalidated || pending.has(key)) return;
      const cost = Buffer.byteLength(JSON.stringify(message));
      if (pending.size >= maxEvents || bytes + cost > maxBytes) {
        invalidate();
        return;
      }
      pending.set(key, message);
      bytes += cost;
    },
    invalidate,
    finish(history: Message[], through: number) {
      if (invalidated) return { status: 'resync' as const };
      const byId = new Map(history.map((message) => [message._id.toHexString(), message]));
      for (const [id, message] of pending) byId.set(id, message);
      return {
        status: 'complete' as const,
        checkpoint: through,
        messages: [...byId.values()].sort((left, right) => left.commitSeq - right.commitSeq),
      };
    },
  };
}

describe('SCRUM-38 Q9 spike on MongoDB replica set', () => {
  it('recovers a late commit with a smaller preallocated ID at the same timestamp', async () => {
    const f = await fixture();
    const earlierId = new Types.ObjectId('000000000000000000000001');
    const laterId = new Types.ObjectId('000000000000000000000002');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = f.commit(earlierId, { beforeWrite: held });
    let checkpoint: number;
    try {
      checkpoint = (await f.commit(laterId)).commitSeq;
    } finally {
      release();
      await first;
    }

    const tupleOnly = await messages()
      .find({
        conversationId: f.conversationId,
        createdAt: sameTime,
        _id: { $gt: laterId },
      })
      .toArray();
    expect(tupleOnly).toEqual([]);
    const catchup = await f.page(checkpoint, await f.highWater());
    expect(catchup.items.map((message) => message._id.toHexString())).toEqual([
      earlierId.toHexString(),
    ]);
  });

  it('does not advance the checkpoint on an aborted message transaction', async () => {
    const f = await fixture();
    await f.commit();
    await expect(f.commit(undefined, { fail: true })).rejects.toThrow('injected rollback');
    expect(await f.highWater()).toBe(1);
    expect((await f.commit()).commitSeq).toBe(2);
    expect((await f.page(0, 2)).items.map(({ commitSeq }) => commitSeq)).toEqual([1, 2]);
  });

  it('merges pre-ack and inter-page events while walking three pages with a fixed H', async () => {
    const f = await fixture();
    const previous = await f.commit();
    for (let i = 0; i < 7; i += 1) await f.commit();
    const incoming = buffer(8);
    const { through, close } = await f.subscribe(incoming.push, {
      beforeSnapshot: () => f.commit(),
      afterSnapshot: () => f.commit(),
    });
    try {
      const history: Message[] = [];
      const sizes: number[] = [];
      let cursor: number | null = previous.commitSeq;
      while (cursor !== null) {
        const page = await f.page(cursor, through);
        history.push(...page.items);
        sizes.push(page.items.length);
        cursor = page.next;
        if (sizes.length === 1) await f.commit();
      }
      expect(sizes).toEqual([3, 3, 2]);
      expect(history.at(-1)?.commitSeq).toBe(through);
      const result = incoming.finish(history, through);
      expect(result.status).toBe('complete');
      if (result.status !== 'complete') throw new Error('Expected a complete sync');
      expect(result.checkpoint).toBe(9);
      expect(result.messages.map(({ commitSeq }) => commitSeq)).toEqual([
        2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
      expect(new Set(result.messages.map(({ _id }) => _id.toHexString())).size).toBe(10);
    } finally {
      close();
    }
  });

  it('keeps reply history separate even when sequence values have gaps for a scope', async () => {
    const f = await fixture();
    const root = await f.commit();
    await f.commit(undefined, { rootMessageId: root._id });
    await f.commit();
    const through = await f.highWater();
    expect((await f.page(0, through)).items.map(({ commitSeq }) => commitSeq)).toEqual([1, 3]);
    expect((await f.page(0, through, root._id)).items.map(({ commitSeq }) => commitSeq)).toEqual([
      2,
    ]);
  });

  it.each(['count', 'bytes', 'scope changed'])(
    'requires resync on %s invalidation',
    async (cause) => {
      const f = await fixture();
      const previous = await f.commit();
      const incoming = buffer(1, cause === 'bytes' ? 1 : 4096);
      const { through, close } = await f.subscribe(incoming.push);
      try {
        if (cause === 'scope changed') incoming.invalidate();
        await f.commit();
        await f.commit();
        expect(incoming.finish([], through)).toEqual({ status: 'resync' });
        const retry = await f.page(previous.commitSeq, await f.highWater());
        expect(retry.items.map(({ commitSeq }) => commitSeq)).toEqual([2, 3]);
      } finally {
        close();
      }
    },
  );
});
