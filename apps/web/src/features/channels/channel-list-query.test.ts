import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { channelListOptions } from './channel-list-query';
import { sessionKey } from '../auth/session';

afterEach(() => vi.unstubAllGlobals());
const userId = '507f1f77bcf86cd799439011';
const workspaceId = '507f1f77bcf86cd799439012';
const first = {
  user: { id: userId, displayName: 'Fixture', email: 'fixture@example.test', avatarUrl: null },
  expiresAt: '2099-01-01T00:00:00.000Z',
  csrfToken: 'first',
};
function fixture() {
  const client = new QueryClient();
  client.setQueryData(sessionKey, first);
  let deliver!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
    ),
  );
  const options = channelListOptions(client, userId, workspaceId, first.expiresAt, 'content');
  const finish = () =>
    deliver(
      new Response(
        JSON.stringify({
          requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
          data: { items: [], nextCursor: null },
        }),
        { status: 200 },
      ),
    );
  return { client, options, finish };
}
it('accepts a CSRF refresh within the same login while a list request is pending', async () => {
  const { client, options, finish } = fixture();
  try {
    const pending = client.fetchInfiniteQuery(options);
    client.setQueryData(sessionKey, { ...first, csrfToken: 'refreshed' });
    finish();
    expect((await pending).pages).toEqual([{ items: [], nextCursor: null }]);
  } finally {
    client.clear();
  }
});
it.each([
  null,
  { ...first, expiresAt: '2099-02-01T00:00:00.000Z' },
  {
    ...first,
    user: { ...first.user, id: '507f1f77bcf86cd799439015' },
  },
])('discards a late page after the active login changes', async (current) => {
  const { client, options, finish } = fixture();
  try {
    const pending = client.fetchInfiniteQuery(options);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    client.setQueryData(sessionKey, current);
    finish();
    await rejected;
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
  } finally {
    client.clear();
  }
});
it('does not resurrect a removed Workspace cache after an ignored transport abort', async () => {
  const { client, options, finish } = fixture();
  try {
    const pending = client.fetchInfiniteQuery(options);
    const rejected = expect(pending).rejects.toBeDefined();
    await client.cancelQueries({ queryKey: options.queryKey });
    client.removeQueries({ queryKey: options.queryKey });
    finish();
    await rejected;
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
  } finally {
    client.clear();
  }
});
