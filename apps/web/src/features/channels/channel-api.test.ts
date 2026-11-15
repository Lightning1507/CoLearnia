import { afterEach, expect, it, vi } from 'vitest';
import { ChannelApiError, createChannel } from './channel-api';
const workspaceId = '507f1f77bcf86cd799439011';
const requestId = '1c3b90f0-0c26-4e98-9a60-000000000001';
const input = {
  name: '  Thảo luận  ',
  type: 'TEXT' as const,
  accessMode: 'PRIVATE' as const,
  requestId,
};
afterEach(() => vi.unstubAllGlobals());
it('sends cookie credentials and CSRF, trims the name and preserves the retry key', async () => {
  const dto = {
    id: '507f1f77bcf86cd799439012',
    workspaceId,
    name: 'Thảo luận',
    type: 'TEXT',
    accessMode: 'PRIVATE',
    revision: 0,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: dto, requestId }), { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  expect(await createChannel(workspaceId, { ...input, replayOnly: true }, 'csrf')).toEqual(dto);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe(`/api/v1/workspaces/${workspaceId}/channels`);
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'X-CSRF-Token': 'csrf' },
  });
  expect(JSON.parse(init.body)).toEqual({ ...input, name: 'Thảo luận', replayOnly: true });
});
it('does not automatically replay mutations after an ambiguous network failure', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('network failed'));
  vi.stubGlobal('fetch', fetcher);
  await expect(createChannel(workspaceId, input, 'csrf')).rejects.toThrow('network failed');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps the server status/code for denied access and unavailable replay', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const [status, code] of [
    [403, 'FORBIDDEN'],
    [410, 'CHANNEL_REPLAY_UNAVAILABLE'],
  ] as const) {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code, message: 'test' }, requestId }), { status }),
    );
    await expect(createChannel(workspaceId, input, 'csrf')).rejects.toEqual(
      new ChannelApiError(status, code),
    );
  }
});
it('rejects malformed success instead of reporting a channel that was not confirmed', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'bad' }, requestId }), { status: 201 }),
      ),
  );
  await expect(createChannel(workspaceId, input, 'csrf')).rejects.toMatchObject({
    name: 'ZodError',
  });
});

it('loads each paginated channel list with cookie, no-store and cancellation', async () => {
  const { listChannels } = await import('./channel-api');
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ data: { items: [], nextCursor: 'next.position' }, requestId }),
        { status: 200 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await listChannels(workspaceId, 'content', null, signal)).toEqual({
    items: [],
    nextCursor: 'next.position',
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/' + workspaceId + '/channels');
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: { items: [], nextCursor: null },
        requestId,
      }),
      { status: 200 },
    ),
  );
  await listChannels(workspaceId, 'manage', 'next.position', signal);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    '/api/v1/workspaces/' + workspaceId + '/channels/manage?after=next.position',
  );
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
  expect(fetcher.mock.calls[1]?.[1].signal).toBeInstanceOf(AbortSignal);
});
