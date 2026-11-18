import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { fixture, revoke, service } from '../apps/server/test/text-sync.fixture.ts';
import { createTextSynchronizer } from '../apps/web/src/features/text/text-sync.ts';

it('runs the web controller over authenticated HTTP/Socket.IO and repairs missed events before revocation', async () => {
  const f = await fixture();
  await f.commit('baseline');
  const observed = [];
  const port = {
    listen(message, invalidated, disconnected) {
      const receive = (event) => {
        if (event.message.text !== 'missed while still connected') message(event);
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
