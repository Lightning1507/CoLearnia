import { apiErrorSchema } from '@colearnia/contracts';

export class MediaBootstrapApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function createMediaBootstrapApi(
  request = fetch,
  base = import.meta.env?.VITE_API_BASE_URL ?? '/api/v1',
) {
  return async (
    sessionId: string,
    path: string,
    proof: string,
    signal: AbortSignal,
    init?: RequestInit,
  ): Promise<unknown> => {
    const headers = new Headers(init?.headers);
    headers.set('X-Media-Context', proof);
    const response = await request(
      `${base}/live-sessions/${encodeURIComponent(sessionId)}/media/${path}`,
      {
        ...init,
        headers,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new MediaBootstrapApiError(
        error.success ? error.data.error.code : 'DEPENDENCY_UNAVAILABLE',
      );
    }
    return body;
  };
}
