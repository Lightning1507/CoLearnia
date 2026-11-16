import { infiniteQueryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { AuthenticatedData } from '@colearnia/contracts';
import { sessionKey } from '../auth/session';
import { listChannels } from './channel-api';

export function channelListOptions(
  client: QueryClient,
  userId: string,
  workspaceId: string,
  expiresAt: string,
  mode: 'content' | 'manage',
) {
  return infiniteQueryOptions({
    queryKey: ['channels', userId, workspaceId, expiresAt, mode],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const page = await listChannels(workspaceId, mode, pageParam, signal);
      const current = client.getQueryData<AuthenticatedData | null>(sessionKey);
      if (
        signal.aborted ||
        current?.user.id !== userId ||
        current.expiresAt !== expiresAt ||
        Date.parse(expiresAt) <= Date.now()
      )
        throw new DOMException('Session changed', 'AbortError');
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
  });
}
