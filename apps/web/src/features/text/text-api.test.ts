import { expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { createTextApi } from './text-api';

it('releases a subscription whose ACK arrives after its consumer has aborted', async () => {
  let receive: ((error: Error | null, packet: unknown) => void) | undefined;
  const emit = vi.fn(
    (event: string, _input: unknown, ack: (error: Error | null, packet: unknown) => void) => {
      if (event === 'conversation.subscribe') receive = ack;
    },
  );
  const socket = { connected: true, emit, timeout: vi.fn() };
  socket.timeout.mockReturnValue(socket);
  const api = createTextApi(socket as unknown as Socket, '100000000000000000000001', 'test-csrf');
  const abort = new AbortController();
  const pending = api.sync.subscribe(
    { channelId: '100000000000000000000001', rootMessageId: null },
    abort.signal,
  );
  const rejected = expect(pending).rejects.toThrow('Scope changed');
  abort.abort(new Error('Scope changed'));
  await rejected;
  receive?.(null, {
    requestId: '10000000-0000-4000-8000-000000000001',
    data: {
      subscriptionId: '10000000-0000-4000-8000-000000000002',
      scope: {
        channelId: '100000000000000000000001',
        conversationId: '100000000000000000000002',
        rootMessageId: null,
      },
      syncToken: 'sync.token',
      throughCheckpoint: 'checkpoint.1',
    },
  });
  expect(emit).toHaveBeenLastCalledWith(
    'conversation.unsubscribe',
    {
      requestId: expect.any(String),
      payload: { subscriptionId: '10000000-0000-4000-8000-000000000002' },
    },
    expect.any(Function),
  );
});

it('preserves authorization denial when an HTTP proxy returns a non-JSON 401', async () => {
  const api = createTextApi(
    {} as Socket,
    '100000000000000000000001',
    'test-csrf',
    '/api/v1',
    async () => new Response('Unauthorized', { status: 401 }),
  );
  await expect(
    api.send(
      { clientMessageId: '10000000-0000-4000-8000-000000000003', text: 'hello' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
});
