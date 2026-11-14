import {
  apiErrorSchema,
  workspaceListResponseSchema,
  workspaceResponseSchema,
  workspaceSelectionResponseSchema,
} from '@colearnia/contracts';

export class WorkspaceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

async function request(path: string, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(`${base}/workspaces${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new WorkspaceApiError(response.status, parsed.success ? parsed.data.error.code : '');
  }
  return payload;
}

export const workspaceApi = {
  async list(after: string | null, signal: AbortSignal) {
    const query = after ? `?after=${encodeURIComponent(after)}` : '';
    return workspaceListResponseSchema.parse(await request(query, { signal })).data;
  },
  async open(id: string, signal: AbortSignal) {
    return workspaceSelectionResponseSchema.parse(
      await request(`/${encodeURIComponent(id)}`, { signal }),
    ).data;
  },
  async create(input: { name: string; requestId: string; replayOnly?: true }, csrfToken: string) {
    return workspaceResponseSchema.parse(
      await request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          name: input.name,
          requestId: input.requestId,
          replayOnly: input.replayOnly,
        }),
      }),
    ).data;
  },
};
