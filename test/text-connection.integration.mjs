import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createTextConnection } from '../apps/web/src/features/text/text-connection.ts';
import { createTextApi } from '../apps/web/src/features/text/text-api.ts';
import { createTextSynchronizer } from '../apps/web/src/features/text/text-sync.ts';

const requireServer = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { Server } = requireServer('socket.io');
const { io } = requireServer('socket.io-client');
const dispose = [];
afterEach(async () => {
  for (const close of dispose.splice(0).reverse()) await close();
});
const scope = {
  channelId: '100000000000000000000001',
  conversationId: '100000000000000000000002',
  rootMessageId: null,
};

async function fixture(initialFailure) {
  const server = createServer();
  const realtime = new Server(server, { transports: ['websocket'] });
  let failure = initialFailure;
  let attempts = 0;
  let peer;
  realtime.use((_socket, next) => {
    attempts++;
    if (failure) next(Object.assign(new Error(failure), { data: { code: failure } }));
    else next();
  });
  realtime.on('connection', (socket) => {
    peer = socket;
    socket.on('conversation.subscribe', (input, ack) =>
      ack({
        requestId: input.requestId,
        data: {
          scope,
          subscriptionId: randomUUID(),
          syncToken: 'test.token',
          throughCheckpoint: 'test.H',
        },
      }),
    );
    socket.on('conversation.unsubscribe', (input, ack) =>
      ack?.({ requestId: input.requestId, data: null }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = io('http://127.0.0.1:' + server.address().port, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: false,
  });
  const unavailable = vi.fn();
  const accessLost = vi.fn();
  const connected = vi.fn();
  let state;
  const fetcher = vi.fn(async (url) => {
    const mode = new URL(url, 'http://fixture.test').searchParams.get('mode');
    return Response.json({
      requestId: randomUUID(),
      data: {
        mode,
        scope,
        throughCheckpoint: 'test.H',
        nextCursor: null,
        items:
          mode === 'snapshot'
            ? [
                {
                  ...scope,
                  id: '100000000000000000000003',
                  senderId: '100000000000000000000004',
                  clientMessageId: randomUUID(),
                  text: 'recovered',
                  createdAt: '2026-11-20T00:00:00Z',
                  replyCount: 0,
                  commitSeq: 1,
                },
              ]
            : [],
      },
    });
  });
  const api = createTextApi(socket, scope.channelId, 'test-csrf', '/api/v1', fetcher);
  const controller = createTextSynchronizer(
    api.sync,
    scope.channelId,
    { events: 10, messages: 30, bytes: 100000, pages: 10, reconcileMs: 60000, roundMs: 2000 },
    (value) => {
      state = value;
    },
  );
  const connection = createTextConnection(socket, controller, {
    connected,
    unavailable,
    accessLost,
  });
  dispose.push(async () => {
    connection.dispose();
    await realtime.close();
  });
  socket.connect();
  return {
    socket,
    controller,
    connection,
    connected,
    unavailable,
    accessLost,
    fetcher,
    recover: () => {
      failure = undefined;
    },
    attempts: () => attempts,
    state: () => state,
    kick: () => peer.disconnect(true),
  };
}

it('recovers a middleware-denied first handshake through the same retry action as TextChannel', async () => {
  const f = await fixture('DEPENDENCY_UNAVAILABLE');
  await expect.poll(() => f.unavailable.mock.calls.length).toBe(1);
  expect(f.socket.connected).toBe(false);
  expect(f.socket.active).toBe(false);
  expect(f.attempts()).toBe(1);
  expect(f.fetcher).not.toHaveBeenCalled();
  f.recover();
  f.connection.retry(); // TextChannel's button calls this handle, not socket.connect itself.
  await expect.poll(() => f.state()?.phase).toBe('live');
  expect(f.state().messages.map((row) => row.text)).toEqual(['recovered']);
  expect(f.attempts()).toBe(2);
  expect(f.connected).toHaveBeenCalledOnce();
  const reconcile = vi.spyOn(f.controller, 'reconcile');
  f.connection.retry();
  expect(reconcile).toHaveBeenCalledOnce();
  expect(f.attempts()).toBe(2);
});

it('recovers a server-initiated disconnect through retry without adding a connection/listener', async () => {
  const f = await fixture();
  await expect.poll(() => f.state()?.phase).toBe('live');
  f.kick();
  await expect.poll(() => f.socket.connected).toBe(false);
  expect(f.socket.active).toBe(false);
  const listeners = f.socket.listeners('connect').length;
  f.connection.retry();
  await expect.poll(() => f.connected.mock.calls.length).toBe(2);
  await expect.poll(() => f.state()?.phase).toBe('live');
  expect(f.attempts()).toBe(2);
  expect(f.socket.listeners('connect')).toHaveLength(listeners);
});

it.each(['AUTH_REQUIRED', 'CSRF_INVALID'])(
  'keeps %s terminal even after the service recovers',
  async (code) => {
    const f = await fixture(code);
    await expect.poll(() => f.accessLost.mock.calls.length).toBe(1);
    f.recover();
    f.connection.retry();
    expect(f.attempts()).toBe(1);
    expect(f.socket.active).toBe(false);
    expect(f.connected).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
