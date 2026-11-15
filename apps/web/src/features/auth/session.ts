import { queryOptions } from '@tanstack/react-query';
import { createAuthApi } from './auth-api';

export const authApi = createAuthApi(import.meta.env.VITE_API_BASE_URL ?? '/api/v1');
export const sessionKey = ['auth', 'session'] as const;
export const sessionOptions = queryOptions({
  queryKey: sessionKey,
  queryFn: ({ signal }) => authApi.me(signal),
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
});
