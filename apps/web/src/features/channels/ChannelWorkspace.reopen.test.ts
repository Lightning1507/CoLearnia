// @vitest-environment jsdom
import { EventEmitter } from 'node:events';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { expect, it, vi } from 'vitest';
import type { AuthenticatedData } from '@colearnia/contracts';
import { sessionKey } from '../auth/session';
import { MainCallProvider } from '../live/MainCallProvider';
import { CallControllerOwner } from '../live/runtime/callController';
import { createTextApi } from '../text/text-api';
import { createTextMemory, TextMemoryContext } from '../text/text-memory';
import { workspaceFixture } from '../workspaces/workspace-fixture';
import { ChannelWorkspace } from './ChannelWorkspace';
import { listChannels } from './channel-api';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('../text/text-api', () => ({ createTextApi: vi.fn() }));
vi.mock('./channel-api', async (original) => ({
  ...(await original<typeof import('./channel-api')>()),
  listChannels: vi.fn(),
}));

class ChatSocket extends EventEmitter {
  connected = false;
  connect() {
    this.connected = true;
    this.emit('connect');
  }
  disconnect() {
    this.connected = false;
    this.emit('disconnect');
  }
}

it.each([1, 2])('opens channels with subscription quota %i', async (perUser) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const auth: AuthenticatedData = {
    user: {
      id: workspaceFixture.ownerId,
      displayName: 'Demo',
      email: 'demo@example.test',
      avatarUrl: null,
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    csrfToken: 'csrf',
  };
  const channels = ['general', 'chat-demo', 'study'].map((name, index) => ({
    id: String(index + 1).repeat(24),
    name,
    workspaceId: workspaceFixture.id,
    type: 'TEXT' as const,
    accessMode: 'WORKSPACE' as const,
    revision: 1,
    canReadContent: true,
  }));
  const [general, demo, study] = channels;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const memory = createTextMemory();
  const channelKey = ['channels', auth.user.id, workspaceFixture.id, auth.expiresAt, 'content'];
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const listeners = new Map<
    string,
    { invalidate(): void; unsubscribe: ReturnType<typeof vi.fn> }
  >();
  const sockets: ChatSocket[] = [];
  const subscriptions = new Set<string>();
  const denied = vi.fn();
  vi.mocked(io).mockImplementation(() => {
    const socket = new ChatSocket();
    sockets.push(socket);
    return socket as unknown as ReturnType<typeof io>;
  });
  vi.mocked(listChannels).mockResolvedValue({ items: channels, nextCursor: null });
  vi.mocked(createTextApi).mockImplementation((_socket, channelId) => {
    const channel = channels.find(({ id }) => id === channelId)!;
    const scope = { channelId, conversationId: 'f'.repeat(24), rootMessageId: null };
    const subscriptionId = crypto.randomUUID();
    const throughCheckpoint = 'cp.1';
    const unsubscribe = vi.fn(() => {
      subscriptions.delete(channelId);
    });
    return {
      send: vi.fn(),
      sync: {
        listen: (_message, invalidate) => {
          const entry = {
            invalidate: () => invalidate({ subscriptionId, reason: 'ACCESS_REVOKED' }),
            unsubscribe,
          };
          listeners.set(channelId, entry);
          return () => {
            if (listeners.get(channelId) === entry) listeners.delete(channelId);
          };
        },
        subscribe: async () => {
          const requestId = crypto.randomUUID();
          if (subscriptions.size >= perUser) {
            denied(channelId);
            return {
              requestId,
              error: { code: 'SERVER_BUSY', message: 'Subscription quota full' },
            };
          }
          subscriptions.add(channelId);
          return {
            requestId,
            data: { scope, subscriptionId, throughCheckpoint, syncToken: 'test.token' },
          };
        },
        history: async () => ({
          requestId: crypto.randomUUID(),
          data: {
            mode: 'snapshot',
            scope,
            throughCheckpoint,
            items: [
              {
                ...scope,
                id: '8'.repeat(24),
                senderId: auth.user.id,
                clientMessageId: crypto.randomUUID(),
                text: 'Tin ở ' + channel.name,
                createdAt: '2026-11-21T00:00:00.000Z',
                replyCount: 0,
                commitSeq: 1,
              },
            ],
            nextCursor: null,
          },
        }),
        unsubscribe,
      },
    };
  });
  const clickChannel = (name: string) =>
    act(async () => {
      const button = [...rootElement.querySelectorAll('button')].find(
        (row) => row.getAttribute('aria-label') === name + ' · Kênh trò chuyện',
      );
      expect(button).toBeDefined();
      button!.click();
    });
  const shown = () =>
    [...rootElement.querySelectorAll('.text-message-list')].find(
      (list) => !list.closest('[hidden]'),
    )?.textContent;
  try {
    client.setQueryData(sessionKey, auth);
    client.setQueryData(channelKey, {
      pages: [{ items: channels, nextCursor: null }],
      pageParams: [null],
    });
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            MemoryRouter,
            { initialEntries: [`/workspaces/${workspaceFixture.id}/channels/${general!.id}`] },
            createElement(MainCallProvider, {
              owner: new CallControllerOwner(),
              children: createElement(
                TextMemoryContext.Provider,
                { value: memory },
                createElement(
                  Routes,
                  null,
                  createElement(Route, {
                    path: '/workspaces/:workspaceId/channels/:channelId',
                    element: createElement(ChannelWorkspace, {
                      workspace: { ...workspaceFixture, role: 'MEMBER' },
                      userId: auth.user.id,
                      expiresAt: auth.expiresAt,
                      account: null,
                      onAccessLost: () => {},
                    }),
                  }),
                ),
              ),
            }),
          ),
        ),
      );
    });
    expect(shown()).toContain('Tin ở general');
    await clickChannel('chat-demo');
    if (perUser === 1) {
      expect(denied).toHaveBeenCalledExactlyOnceWith(demo!.id);
      expect(subscriptions.has(general!.id)).toBe(false);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      expect(shown()).toContain('Tin ở chat-demo');
      expect([...subscriptions]).toEqual([demo!.id]);
      await clickChannel('study');
      expect(denied).toHaveBeenNthCalledWith(2, study!.id);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      expect(shown()).toContain('Tin ở study');
      expect([...subscriptions]).toEqual([study!.id]);
      expect(sockets.filter(({ connected }) => connected)).toHaveLength(1);
      return;
    }
    expect(shown()).toContain('Tin ở chat-demo');
    await clickChannel('general');
    expect(shown()).toContain('Tin ở general');
    expect(rootElement.textContent).not.toContain('Đang kết nối và đồng bộ tin nhắn');
    expect(sockets).toHaveLength(2);
    expect(denied).not.toHaveBeenCalled();

    await clickChannel('study');
    expect(shown()).toContain('Tin ở study');
    expect([...listeners.keys()]).toEqual([general!.id, study!.id]);
    expect(rootElement.textContent).not.toContain('Tin ở chat-demo');
    expect(sockets.filter(({ connected }) => connected)).toHaveLength(2);

    // This channel is no longer mounted, so it cannot receive a socket invalidation.
    const savedKey = workspaceFixture.id + ':' + demo!.id;
    memory.update(savedKey, (current) => ({ ...current, draft: 'Nháp cũ' }));
    const accessList = [general!, study!];
    vi.mocked(listChannels).mockResolvedValue({ items: accessList, nextCursor: 'more' });
    await act(async () => {
      await client.refetchQueries({ queryKey: channelKey });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(memory.store.getState().get(savedKey)?.draft).toBe('Nháp cũ');

    vi.mocked(listChannels).mockResolvedValue({ items: accessList, nextCursor: null });
    await act(async () => {
      await client.refetchQueries({ queryKey: channelKey });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(memory.store.getState().has(savedKey)).toBe(false);

    const revoked = listeners.get(general!.id)!;
    vi.mocked(listChannels).mockResolvedValue({ items: channels.slice(1), nextCursor: null });
    await act(async () => revoked.invalidate());
    expect(shown()).toContain('Tin ở study');
    expect(rootElement.textContent).not.toContain('Tin ở general');
    expect(revoked.unsubscribe).toHaveBeenCalled();
    expect(listeners.has(demo!.id)).toBe(false);

    await act(async () => {
      client.setQueryData(sessionKey, null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(rootElement.querySelector('.text-message-list')).toBeNull();
    expect(sockets.some(({ connected }) => connected)).toBe(false);
  } finally {
    await act(async () => root.unmount());
    rootElement.remove();
    client.clear();
    vi.unstubAllGlobals();
  }
});
