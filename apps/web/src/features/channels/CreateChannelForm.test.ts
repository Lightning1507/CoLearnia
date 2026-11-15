import { expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { CreateChannelForm } from './CreateChannelForm';
import { sessionKey } from '../auth/session';

const controls = vi.hoisted(() => ({
  stateIndex: 0,
  pending: vi.fn(),
  attempt: vi.fn(),
  created: vi.fn(),
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useRef: <T>(value: T) => ({ current: value }),
    useState: <T>(initial: T) => {
      const index = controls.stateIndex++;
      if (index === 0) return ['Review race', vi.fn()];
      if (index === 3) return [initial, controls.pending];
      if (index === 4) return [controls.attempt.mock.lastCall?.[0] ?? initial, controls.attempt];
      if (index === 8) return [initial, controls.created];
      return [initial, vi.fn()];
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
    const { client, first, render } = setup();
    const second = {
      ...first,
      csrfToken: 'new',
      expiresAt: new Date(Date.now() + 1_200_000).toISOString(),
    };
    let deliver!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          deliver = done;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      render().onSubmit({ preventDefault: vi.fn() });
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

function setup() {
  controls.pending.mockClear();
  controls.attempt.mockClear();
  controls.created.mockClear();
  const client = new QueryClient();
  clients.get = () => client;
  const user = {
    id: '507f1f77bcf86cd799439011',
    displayName: 'Review',
    email: 'review@example.test',
    avatarUrl: null,
  };
  const workspaceId = '507f1f77bcf86cd799439012';
  const first = {
    user,
    csrfToken: 'old',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  client.setQueryData(sessionKey, first);
  function render() {
    controls.stateIndex = 0;
    const element = CreateChannelForm({ workspaceId, userId: user.id, onAccessLost: vi.fn() });
    type SubmitForm = ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
    const dialog = (element.props.children as unknown[]).find(
      (node): node is ReactElement<{ children: SubmitForm }> =>
        isValidElement<{ children: SubmitForm }>(node) && node.type === 'dialog',
    );
    expect(dialog).toBeDefined();
    return dialog!.props.children.props;
  }
  return { client, first, render, workspaceId };
}

it.each(['lost response', 'late success', 'rejected CSRF'] as const)(
  'keeps the operation in the same session after CSRF rotates and the POST has %s',
  async (outcome) => {
    const { client, first, render, workspaceId } = setup();
    let complete!: (response: Response) => void;
    let fail!: (error: Error) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve, reject) => {
          complete = resolve;
          fail = reject;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      render().onSubmit({ preventDefault: vi.fn() });
      const original = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
      const rotated = { ...first, csrfToken: 'rotated' };
      client.setQueryData(sessionKey, rotated);
      const channel = {
        id: '507f1f77bcf86cd799439013',
        workspaceId,
        name: 'Review race',
        type: 'TEXT',
        accessMode: 'WORKSPACE',
        revision: 0,
      };
      const success = () =>
        new Response(JSON.stringify({ data: channel, requestId: original.requestId }), {
          status: 201,
        });
      fetcher.mockImplementation(async () => success());
      if (outcome === 'lost response') {
        fail(new TypeError('network failed'));
        await vi.waitFor(() => expect(controls.pending).toHaveBeenLastCalledWith(false));
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(controls.attempt).toHaveBeenLastCalledWith(
          expect.objectContaining({ input: original }),
        );
        render().onSubmit({ preventDefault: vi.fn() });
      } else if (outcome === 'rejected CSRF') {
        complete(
          new Response(
            JSON.stringify({
              error: { code: 'CSRF_INVALID', message: 'Rejected' },
              requestId: original.requestId,
            }),
            { status: 403 },
          ),
        );
      } else {
        complete(success());
      }
      await vi.waitFor(() => expect(controls.created).toHaveBeenCalledWith(channel));
      expect(controls.attempt).toHaveBeenLastCalledWith(null);
      expect(client.getQueryData(sessionKey)).toEqual(rotated);
      if (outcome === 'late success') {
        expect(fetcher).toHaveBeenCalledTimes(1);
      } else {
        expect(fetcher).toHaveBeenCalledTimes(2);
        const [url, init] = fetcher.mock.calls[1]!;
        expect(url).toBe(fetcher.mock.calls[0]?.[0]);
        expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'rotated' });
        expect(JSON.parse(String(init?.body))).toEqual({
          ...original,
          ...(outcome === 'lost response' && { replayOnly: true }),
        });
      }
    } finally {
      vi.unstubAllGlobals();
      client.clear();
    }
  },
);
