import { expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { CreateChannelForm } from './CreateChannelForm';
import { sessionKey } from '../auth/session';

const controls = vi.hoisted(() => ({ stateIndex: 0, pending: vi.fn() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useRef: <T>(value: T) => ({ current: value }),
    useState: <T>(initial: T) => {
      const index = controls.stateIndex++;
      return [index === 0 ? 'Review race' : initial, index === 3 ? controls.pending : vi.fn()];
    },
    useEffect: (effect: () => unknown) => {
      effect();
    },
    useId: () => 'review',
  };
});
const clients = vi.hoisted(() => ({
  get: (): QueryClient => {
    throw new Error('not configured');
  },
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => clients.get(),
}));

it.each([
  [401, 'AUTH_REQUIRED'],
  [403, 'CSRF_INVALID'],
] as const)(
  'ignores an earlier login’s late %s response after the same user logs in again',
  async (status, code) => {
    controls.stateIndex = 0;
    controls.pending.mockClear();
    const client = new QueryClient();
    clients.get = () => client;
    const user = {
      id: '507f1f77bcf86cd799439011',
      displayName: 'Review',
      email: 'review@example.test',
      avatarUrl: null,
    };
    const first = {
      user,
      csrfToken: 'old',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    const second = {
      ...first,
      csrfToken: 'new',
      expiresAt: new Date(Date.now() + 1_200_000).toISOString(),
    };
    client.setQueryData(sessionKey, first);
    let deliver!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          deliver = done;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      const element = CreateChannelForm({
        workspaceId: '507f1f77bcf86cd799439012',
        userId: user.id,
        onAccessLost: vi.fn(),
      });
      type SubmitForm = ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
      const dialog = (element.props.children as unknown[]).find(
        (node): node is ReactElement<{ children: SubmitForm }> =>
          isValidElement<{ children: SubmitForm }>(node) && node.type === 'dialog',
      );
      expect(dialog).toBeDefined();
      dialog!.props.children.props.onSubmit({ preventDefault: vi.fn() });
      // Another login of the same account has already been observed by sessionOptions.
      client.setQueryData(sessionKey, second);
      deliver(
        new Response(
          JSON.stringify({
            error: { code, message: 'Rejected' },
            requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
          }),
          { status },
        ),
      );
      await vi.waitFor(() => expect(controls.pending).toHaveBeenLastCalledWith(false));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(sessionKey)).toEqual(second);
    } finally {
      vi.unstubAllGlobals();
      client.clear();
    }
  },
);
