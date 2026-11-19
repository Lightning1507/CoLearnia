import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { TextHistoryMessage, TextMessageHistoryQuery } from '@colearnia/contracts';
import { createTextSynchronizer, type TextSyncPort, type TextSyncState } from './text-sync';

const channelId = '100000000000000000000001';
const scope = { channelId, conversationId: '100000000000000000000002', rootMessageId: null };
const limits = {
  events: 20,
  messages: 200,
  bytes: 100_000,
  pages: 20,
  reconcileMs: 100,
  roundMs: 1000,
};
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  vi.useRealTimers();
});
function message(seq: number): TextHistoryMessage {
  return {
    ...scope,
    id: seq.toString(16).padStart(24, '0'),
    senderId: '100000000000000000000003',
    clientMessageId: randomUUID(),
    text: 'Message ' + seq,
    createdAt: '2026-11-18T00:00:00Z',
    replyCount: 0,
    commitSeq: seq,
  };
}
function fixture() {
  let onMessage = (_value: unknown) => {};
  let onInvalidation = (_value: unknown) => {};
  let onDisconnect = () => {};
  let id = randomUUID();
  let high = 1;
  const rows = [message(1)];
  const historyQueries: TextMessageHistoryQuery[] = [];
  const unsubscribe = vi.fn();
  const hooks: {
    subscribed?: () => void;
    page?: (query: TextMessageHistoryQuery) => Promise<void> | void;
    error?: { code: string; message: string };
  } = {};
  const port: TextSyncPort = {
    listen: (received, invalidated, disconnect) => {
      onMessage = received;
      onInvalidation = invalidated;
      onDisconnect = disconnect;
      return () => {
        onMessage = () => {};
        onInvalidation = () => {};
        onDisconnect = () => {};
      };
    },
    async subscribe() {
      id = randomUUID();
      high = Math.max(...rows.map((row) => row.commitSeq!));
      hooks.subscribed?.();
      return {
        requestId: randomUUID(),
        data: {
          scope,
          subscriptionId: id,
          syncToken: 'sync.token',
          throughCheckpoint: 'cp.' + high,
        },
      };
    },
    async history(_channel, query) {
      historyQueries.push(query);
      await hooks.page?.(query);
      if (hooks.error) return { requestId: randomUUID(), error: hooks.error };
      const lower = query.mode === 'catch-up' ? Number(query.afterCheckpoint.split('.')[1]) : 0;
      const offset = 'cursor' in query && query.cursor ? Number(query.cursor.split('.')[1]) : 0;
      const eligible = rows.filter((row) => row.commitSeq! > lower && row.commitSeq! <= high);
      if (query.mode === 'snapshot') eligible.reverse();
      const items = eligible.slice(offset, offset + query.limit);
      return {
        requestId: randomUUID(),
        data: {
          mode: query.mode,
          scope,
          throughCheckpoint: 'cp.' + high,
          items,
          nextCursor:
            offset + query.limit < eligible.length ? 'cursor.' + (offset + query.limit) : null,
        },
      };
    },
    unsubscribe,
  };
  const push = (row: TextHistoryMessage) => onMessage({ subscriptionId: id, message: row });
  const sync = createTextSynchronizer(port, channelId, limits, () => {});
  disposers.push(sync.stop);
  return {
    rows,
    sync,
    push,
    port,
    hooks,
    historyQueries,
    unsubscribe,
    invalidate: (reason: string) => onInvalidation({ subscriptionId: id, reason }),
    disconnect: () => onDisconnect(),
  };
}

it('buffers events before ACK, drains all catch-up pages, deduplicates and keeps the fixed H checkpoint', async () => {
  const f = fixture();
  await f.sync.reconcile();
  expect(f.sync.snapshot().checkpoint).toBe('cp.1');
  for (let seq = 2; seq <= 152; seq++) f.rows.push(message(seq));
  f.hooks.subscribed = () => {
    f.push(f.rows[3]!);
    f.push(message(153));
  };
  await f.sync.reconcile();
  const state = f.sync.snapshot();
  expect(state.phase).toBe('live');
  expect(state.messages.map((row) => row.commitSeq).sort((a, b) => a! - b!)).toEqual(
    Array.from({ length: 153 }, (_, i) => i + 1),
  );
  expect(state.checkpoint).toBe('cp.152');
  const pages = f.historyQueries.filter((q) => q.mode === 'catch-up');
  expect(pages).toHaveLength(4);
  expect(
    pages.every(
      (q) =>
        q.mode === 'catch-up' && q.afterCheckpoint === 'cp.1' && q.throughCheckpoint === 'cp.152',
    ),
  ).toBe(true);
});

it('periodically repairs a dropped event while the connection remains open', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.sync.reconcile();
  const dropped = message(2);
  const delivered = message(3);
  f.rows.push(dropped, delivered);
  f.push(delivered);
  expect(f.sync.snapshot().checkpoint).toBe('cp.1');
  await vi.advanceTimersByTimeAsync(100);
  expect(f.sync.snapshot().messages.map((row) => row.id)).toEqual([
    f.rows[0]!.id,
    dropped.id,
    delivered.id,
  ]);
  expect(f.sync.snapshot().checkpoint).toBe('cp.3');
});

it.each(['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'])(
  'clears private cache and refuses completion on %s between catch-up pages',
  async (code) => {
    const f = fixture();
    await f.sync.reconcile();
    for (let seq = 2; seq <= 60; seq++) f.rows.push(message(seq));
    f.hooks.page = (query) => {
      if ('cursor' in query && query.cursor) f.hooks.error = { code, message: 'Denied' };
    };
    await f.sync.reconcile();
    expect(f.sync.snapshot()).toMatchObject({
      phase: 'revoked',
      checkpoint: undefined,
      messages: [],
    });
  },
);

it('never promotes a checkpoint on expiry/conflict or a pre-ACK invalidation', async () => {
  const f = fixture();
  await f.sync.reconcile();
  f.hooks.error = { code: 'CONFLICT', message: 'Expired sync token' };
  await f.sync.reconcile();
  expect(f.sync.snapshot()).toMatchObject({ phase: 'resync', checkpoint: undefined });
  delete f.hooks.error;
  f.hooks.subscribed = () => f.invalidate('ACCESS_REVOKED');
  const requests = f.historyQueries.length;
  await f.sync.reconcile();
  expect(f.historyQueries).toHaveLength(requests);
  expect(f.sync.snapshot()).toMatchObject({ phase: 'revoked', messages: [] });
});

it('fails closed on event/byte overflow, timeout, disconnect and stale responses', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const bounded = createTextSynchronizer(f.port, channelId, { ...limits, events: 1 }, () => {});
  disposers.push(bounded.stop);
  f.hooks.subscribed = () => {
    f.push(message(2));
    f.push(message(3));
  };
  await bounded.reconcile();
  expect(bounded.snapshot()).toMatchObject({ phase: 'resync', checkpoint: undefined });
  expect(f.unsubscribe).toHaveBeenCalled(); // Late ACK resource is closed too.
  bounded.stop();
  delete f.hooks.subscribed;
  await f.sync.reconcile();
  f.disconnect();
  expect(f.sync.snapshot().phase).toBe('resync');
  const tiny = createTextSynchronizer(f.port, channelId, { ...limits, bytes: 10 }, () => {});
  disposers.push(tiny.stop);
  await tiny.reconcile();
  expect(tiny.snapshot()).toMatchObject({ phase: 'blocked', reason: 'PROJECTION_CAPACITY' });
  tiny.stop();
  let release = () => {};
  f.hooks.page = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const pending = f.sync.reconcile();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(limits.roundMs);
  expect(f.sync.snapshot().phase).toBe('resync');
  f.sync.stop();
  release();
  await pending;
  expect(f.sync.snapshot()).toMatchObject({ phase: 'idle', messages: [], checkpoint: undefined });
});

it('opens a new turn after RESYNC_REQUIRED but never automatically reopens revoked access', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.sync.reconcile();
  f.rows.push(message(2));
  f.invalidate('RESYNC_REQUIRED');
  expect(f.sync.snapshot()).toMatchObject({ phase: 'resync', checkpoint: 'cp.1' });
  await vi.advanceTimersByTimeAsync(100);
  expect(f.sync.snapshot()).toMatchObject({ phase: 'live', checkpoint: 'cp.2' });
  f.invalidate('ACCESS_REVOKED');
  const count = f.historyQueries.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.sync.snapshot()).toMatchObject({
    phase: 'revoked',
    messages: [],
    checkpoint: undefined,
  });
  expect(f.historyQueries).toHaveLength(count);
});

it('falls back to a bounded snapshot after catch-up exceeds the projection capacity', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const bounded = createTextSynchronizer(f.port, channelId, { ...limits, messages: 3 }, () => {});
  disposers.push(bounded.stop);
  await bounded.reconcile();
  for (let seq = 2; seq <= 6; seq++) f.rows.push(message(seq));
  await bounded.reconcile();
  expect(bounded.snapshot()).toMatchObject({ phase: 'resync', checkpoint: undefined });
  await vi.advanceTimersByTimeAsync(100);
  expect(bounded.snapshot()).toMatchObject({ phase: 'live', checkpoint: 'cp.6' });
  expect(bounded.snapshot().messages.map((row) => row.commitSeq)).toEqual([4, 5, 6]);
  expect(bounded.snapshot().olderCursor).not.toBeNull();
});

const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

it('requests a real 30-row snapshot from 60 messages, retaining the older cursor and deferring H until completion', async () => {
  const f = fixture();
  for (let seq = 2; seq <= 60; seq++) f.rows.push(message(seq));
  const states: TextSyncState[] = [];
  const bounded = createTextSynchronizer(f.port, channelId, { ...limits, messages: 30 }, (state) =>
    states.push(state),
  );
  disposers.push(bounded.stop);
  let release = () => {};
  let reached = () => {};
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.hooks.page = () => {
    reached();
    return gate;
  };
  const pending = bounded.reconcile();
  await ready;
  expect(f.historyQueries.map((query) => query.limit)).toEqual([30]);
  expect(bounded.snapshot()).toMatchObject({ phase: 'syncing', checkpoint: undefined });
  expect(states.some((state) => state.phase === 'live')).toBe(false);
  release();
  await pending;
  expect(bounded.snapshot()).toMatchObject({
    phase: 'live',
    checkpoint: 'cp.60',
    olderCursor: 'cursor.30',
  });
  expect(bounded.snapshot().messages.map((row) => row.commitSeq)).toEqual(
    Array.from({ length: 30 }, (_, i) => i + 31),
  );
  expect(encodedBytes(bounded.snapshot().messages)).toBeLessThanOrEqual(limits.bytes);
  delete f.hooks.page;
  await bounded.reconcile(); // A catch-up query also respects the projection row limit.
  expect(f.historyQueries.map((query) => query.limit)).toEqual([30, 30]);
  expect(bounded.snapshot().messages).toHaveLength(30);
});

it('shrinks a snapshot to fit its byte budget using the same lease/H and preserves unread history', async () => {
  const f = fixture();
  for (let seq = 2; seq <= 60; seq++) f.rows.push({ ...message(seq), text: 'x'.repeat(200) });
  const byteLimit = encodedBytes(f.rows.slice(-2)) + 5;
  const states: TextSyncState[] = [];
  const bounded = createTextSynchronizer(
    f.port,
    channelId,
    { ...limits, bytes: byteLimit },
    (state) => states.push(state),
  );
  disposers.push(bounded.stop);
  f.hooks.page = () => {
    expect(bounded.snapshot().phase).toBe('syncing');
    expect(bounded.snapshot().checkpoint).toBeUndefined();
  };
  await bounded.reconcile();
  expect(f.historyQueries[0]?.limit).toBe(50);
  expect(f.historyQueries.length).toBeGreaterThan(1);
  expect(f.historyQueries.length).toBeLessThanOrEqual(6);
  expect(
    f.historyQueries.every(
      (query) =>
        query.mode === 'snapshot' &&
        query.throughCheckpoint === 'cp.60' &&
        query.syncToken === 'sync.token',
    ),
  ).toBe(true);
  expect(bounded.snapshot()).toMatchObject({ phase: 'live', checkpoint: 'cp.60' });
  expect(bounded.snapshot().olderCursor).not.toBeNull();
  expect(encodedBytes(bounded.snapshot().messages)).toBeLessThanOrEqual(byteLimit);
  expect(bounded.snapshot().messages.length).toBeLessThan(50);
  expect(states.filter((state) => state.phase === 'live')).toHaveLength(1);
});

it('also reserves projection space for an event arriving before ACK with a 30-row window', async () => {
  const f = fixture();
  for (let seq = 2; seq <= 60; seq++) f.rows.push(message(seq));
  f.hooks.subscribed = () => f.push(message(61));
  const bounded = createTextSynchronizer(f.port, channelId, { ...limits, messages: 30 }, () => {});
  disposers.push(bounded.stop);
  await bounded.reconcile();
  expect(bounded.snapshot()).toMatchObject({ phase: 'live', checkpoint: 'cp.60' });
  expect(bounded.snapshot().messages.length).toBeLessThanOrEqual(30);
  expect(bounded.snapshot().messages.some((row) => row.commitSeq === 61)).toBe(true);
  expect(bounded.snapshot().olderCursor).not.toBeNull();
  expect(f.historyQueries.some((query) => query.limit < 30)).toBe(true);
});

it.each([1, 20])(
  'terminates when even one message cannot fit, including a %i-page round budget',
  async (pages) => {
    vi.useFakeTimers();
    const f = fixture();
    for (let seq = 2; seq <= 60; seq++) f.rows.push(message(seq));
    const states: TextSyncState[] = [];
    const bounded = createTextSynchronizer(
      f.port,
      channelId,
      { ...limits, messages: 30, bytes: 10, pages },
      (state) => states.push(state),
    );
    disposers.push(bounded.stop);
    await bounded.reconcile();
    await vi.advanceTimersByTimeAsync(1000);
    expect(bounded.snapshot()).toMatchObject({
      phase: 'blocked',
      reason: 'PROJECTION_CAPACITY',
      checkpoint: undefined,
      messages: [],
    });
    const requests = f.historyQueries.length;
    expect(requests).toBeGreaterThan(0);
    expect(requests).toBeLessThanOrEqual(6);
    expect(f.historyQueries.at(-1)?.limit).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await bounded.reconcile();
    expect(f.historyQueries).toHaveLength(requests);
    expect(states.some((state) => state.phase === 'live')).toBe(false);
    expect(f.unsubscribe).toHaveBeenCalled();
  },
);

it('rejects a configuration that cannot encode an empty projection before any I/O', () => {
  const f = fixture();
  expect(() =>
    createTextSynchronizer(f.port, channelId, { ...limits, bytes: 1 }, () => {}),
  ).toThrow('empty projection');
  expect(f.historyQueries).toEqual([]);
});
