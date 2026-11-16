import {
  channelListResponseSchema,
  managedChannelListResponseSchema,
  apiErrorSchema,
  channelResponseSchema,
  createChannelSchema,
} from '@colearnia/contracts';
import type { CreateChannelInput } from '@colearnia/contracts';

export class ChannelApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
export async function createChannel(
  workspaceId: string,
  input: CreateChannelInput,
  csrfToken: string,
) {
  const response = await fetch(`${base}/workspaces/${encodeURIComponent(workspaceId)}/channels`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(createChannelSchema.parse(input)),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ChannelApiError(response.status, parsed.success ? parsed.data.error.code : '');
  }
  return channelResponseSchema.parse(payload).data;
}

// The cache scope is supplied by the authenticated page, never by a request payload.
export async function listChannels(
  workspaceId: string,
  mode: 'content' | 'manage',
  after: string | null,
  signal: AbortSignal,
) {
  const query = after ? '?after=' + encodeURIComponent(after) : '';
  const suffix = mode === 'manage' ? '/manage' : '';
  const response = await fetch(
    `${base}/workspaces/${encodeURIComponent(workspaceId)}/channels${suffix}${query}`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ChannelApiError(response.status, parsed.success ? parsed.data.error.code : '');
  }
  return (mode === 'manage' ? managedChannelListResponseSchema : channelListResponseSchema).parse(
    payload,
  ).data;
}
