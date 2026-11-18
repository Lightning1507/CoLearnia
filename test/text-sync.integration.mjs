import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { fixture, revoke, service } from '../apps/server/test/text-sync.fixture.ts';
import { createTextSynchronizer } from '../apps/web/src/features/text/text-sync.ts';

function nativePort(f, queries = [], shouldDeliver = () => true) {
  return {
    listen(message, invalidated, disconnected) {
      const receive = (event) => {
        if (shouldDeliver(event)) message(event);
      };
      f.socket.on('message.created', receive);
      f.socket.on('conversation.invalidated', invalidated);
      f.socket.on('disconnect', disconnected);
      return () => {
        f.socket.off('message.created', receive);
        f.socket.off('conversation.invalidated', invalidated);
        f.socket.off('disconnect', disconnected);
      };
    },
    async subscribe(payload, signal) {
      signal.throwIfAborted();
      return f.socket
        .timeout(5000)
        .emitWithAck('conversation.subscribe', { requestId: randomUUID(), payload });
    },
    async history(_channel, query, signal) {
      signal.throwIfAborted();
      queries.push(query);
      const response = await f.read(query);
      signal.throwIfAborted();
      return response.body;
    },
    unsubscribe(subscriptionId) {
      f.socket.emit(
        'conversation.unsubscribe',
        { requestId: randomUUID(), payload: { subscriptionId } },
        () => {},
      );
    },
  };
}

it('runs the web controller over authenticated HTTP/Socket.IO and repairs missed events before revocation', async () => {
  const f = await fixture();
  await f.commit('baseline');
  const observed = [];
  const port = nativePort(f, [], (event) => event.message.text !== 'missed while still connected');
  const sync = createTextSynchronizer(
    port,
    f.channel.id,
    {
      events: 100,
      messages: 200,
      bytes: 1_000_000,
      pages: 10,
      reconcileMs: 60_000,
      roundMs: 10_000,
    },
    (state) => observed.push(state),
  );
  try {
    await sync.reconcile();
    expect(sync.snapshot().phase).toBe('live');
    const previous = sync.snapshot().checkpoint;
    const dropped = await f.commit('missed while still connected');
    const delivered = await f.commit('received after missed event');
    await expect
      .poll(() => sync.snapshot().messages.some((row) => row.id === delivered.id))
      .toBe(true);
    expect(sync.snapshot().checkpoint).toBe(previous);
    expect(sync.snapshot().messages.some((row) => row.id === dropped.id)).toBe(false);
    // A reconciliation turn is the same operation invoked by the periodic timer.
    await sync.reconcile();
    expect(sync.snapshot().messages.map((row) => row.id)).toEqual(
      expect.arrayContaining([dropped.id, delivered.id]),
    );
    await service.publishCommitted(delivered);
    expect(sync.snapshot().messages.filter((row) => row.id === delivered.id)).toHaveLength(1);
    for (let i = 0; i < 105; i++) await f.commit('backlog ' + i, false);
    await sync.reconcile();
    expect(sync.snapshot().phase).toBe('live');
    expect(sync.snapshot().messages).toHaveLength(108);
    expect(new Set(sync.snapshot().messages.map((row) => row.id)).size).toBe(108);
    expect(await revoke.revoke(f.identity)).toBe(true);
    await expect.poll(() => sync.snapshot().phase).toBe('revoked');
    expect(sync.snapshot()).toMatchObject({ messages: [], checkpoint: undefined });
    expect(observed.some((state) => state.phase === 'syncing')).toBe(true);
  } finally {
    sync.stop();
    f.socket.disconnect();
  }
});

it('fits 60 native history rows into a 30-message projection and adapts a smaller byte window', async () => {
  const f = await fixture();
  let newest;
  for (let i = 0; i < 60; i++)
    newest = await f.commit('bounded snapshot ' + i + 'x'.repeat(200), false);
  const queries = [];
  const budget = {
    events: 100,
    messages: 30,
    bytes: 1_000_000,
    pages: 10,
    reconcileMs: 60_000,
    roundMs: 10_000,
  };
  const sync = createTextSynchronizer(nativePort(f, queries), f.channel.id, budget, () => {});
  let bytesOnly;
  try {
    await sync.reconcile();
    expect(sync.snapshot().phase).toBe('live');
    expect(sync.snapshot().messages).toHaveLength(30);
    expect(queries[0].limit).toBe(30);
    const older = await f
      .read({ mode: 'history', cursor: sync.snapshot().olderCursor, limit: 50 })
      .expect(200);
    expect(older.body.data.items).toHaveLength(30);
    expect(
      new Set([...older.body.data.items, ...sync.snapshot().messages].map((row) => row.id)).size,
    ).toBe(60);
    sync.stop();
    const byteLimit = new TextEncoder().encode(JSON.stringify([newest])).byteLength + 5;
    const byteQueries = [];
    bytesOnly = createTextSynchronizer(
      nativePort(f, byteQueries),
      f.channel.id,
      { ...budget, bytes: byteLimit },
      () => {},
    );
    await bytesOnly.reconcile();
    expect(bytesOnly.snapshot().phase).toBe('live');
    expect(bytesOnly.snapshot().messages).toHaveLength(1);
    expect(bytesOnly.snapshot().olderCursor).not.toBeNull();
    expect(
      new TextEncoder().encode(JSON.stringify(bytesOnly.snapshot().messages)).byteLength,
    ).toBeLessThanOrEqual(byteLimit);
    expect(byteQueries.length).toBeGreaterThan(1);
    const unread = await f
      .read({ mode: 'history', cursor: bytesOnly.snapshot().olderCursor, limit: 50 })
      .expect(200);
    expect(unread.body.data.items).toHaveLength(50);
  } finally {
    sync.stop();
    bytesOnly?.stop();
    f.socket.disconnect();
  }
});
