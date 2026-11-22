// @vitest-environment jsdom
import { act, createElement } from 'react';
import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { AuthenticatedData } from '@colearnia/contracts';
import { AuthBoundary } from './AuthBoundary';
import { authApi, sessionKey } from './session';
import { AuthApiError } from './auth-api';
import { MainCall } from '../live/runtime/mainCall';
import { CallControllerOwner } from '../live/runtime/callController';
import { requestMainTicket } from '../live/runtime/mainConnection';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('../live/runtime/mainConnection', async (original) => ({
  ...(await original<typeof import('../live/runtime/mainConnection')>()),
  requestMainTicket: vi.fn(),
}));

const context = vi.hoisted(() => ({ call: undefined as MainCall | undefined }));
vi.mock('../live/runtime/mainCallContext', () => ({ useMainCall: () => context.call }));
vi.mock('../workspaces/WorkspacePages', () => ({
  WorkspaceOpen: () => null,
  WorkspacePicker: () => null,
}));
vi.mock('./AuthScreen', () => ({ AuthScreen: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  new AuthApiError('DEPENDENCY_UNAVAILABLE', 'Unavailable'),
  new TypeError('Network unavailable'),
])(
  'keeps call recovery on an uncertain session refetch and clears confirmed loss (%s)',
  async (error) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const auth = {
      user: { id: '3'.repeat(24), displayName: 'Test', email: 'test@example.test' },
      expiresAt: '2099-01-01T00:00:00.000Z',
      csrfToken: 'csrf',
    } as AuthenticatedData;
    const identity = {
      sessionId: '1'.repeat(24),
      epoch: '10000000-0000-4000-8000-000000000001',
      participantId: '2'.repeat(24),
      callGeneration: 1,
    };
    const owner = new CallControllerOwner();
    // Native media is outside this effect regression; retain the real MainCall binding.
    vi.spyOn(owner, 'acquire').mockResolvedValue({ identity });
    class AuthTestSocket extends EventEmitter {
      connected = false;
      connect() {
        this.connected = true;
        this.emit('connect');
      }
      disconnect() {
        this.connected = false;
        this.emit('disconnect');
      }
      timeout() {
        return this;
      }
      async emitWithAck(_event: string, input: { requestId: string }) {
        return {
          requestId: input.requestId,
          data: {
            status: 'completed',
            result: {
              participantId: identity.participantId,
              callGeneration: 1,
              resumeTicket: 'A'.repeat(43),
              snapshot: { snapshotId: crypto.randomUUID(), partCount: 1 },
            },
          },
        };
      }
    }
    const socket = new AuthTestSocket();
    vi.mocked(io).mockReturnValue(socket as unknown as Socket);
    vi.spyOn(authApi, 'csrf').mockResolvedValue('csrf');
    vi.mocked(requestMainTicket).mockResolvedValue({
      ...identity,
      ticket: 'ticket',
      expiresAt: auth.expiresAt,
    });
    const call = new MainCall(owner);
    context.call = call;
    const setAuth = vi.spyOn(call, 'setAuth');
    const clear = vi.spyOn(call, 'clear');
    client.setQueryData(sessionKey, auth);
    const me = vi.spyOn(authApi, 'me').mockResolvedValue(auth);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(
              MemoryRouter,
              { initialEntries: ['/workspaces'] },
              createElement(AuthBoundary),
            ),
          ),
        );
      });
      call.open({ workspaceId: '4'.repeat(24), channelId: '5'.repeat(24), channelName: 'Test' });
      await act(async () => {
        await call.join({
          microphone: { enabled: false, deviceId: '' },
          camera: { enabled: false, deviceId: '' },
        });
      });
      expect(call.getSnapshot().phase).toBe('active');
      expect(call.canResume()).toBe(true);
      clear.mockClear();
      setAuth.mockClear();
      me.mockRejectedValue(error);
      await act(async () => {
        await client.refetchQueries({ queryKey: sessionKey });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(client.getQueryState(sessionKey)?.status).toBe('error');
      expect(clear).not.toHaveBeenCalled();
      expect(setAuth).not.toHaveBeenCalledWith(null);
      expect(call.getSnapshot().phase).toBe('active');
      expect(call.canResume()).toBe(true);
      expect(socket.connected).toBe(true);
      me.mockResolvedValue(auth);
      await act(async () => {
        await client.refetchQueries({ queryKey: sessionKey });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(call.getSnapshot().phase).toBe('active');
      expect(clear).not.toHaveBeenCalled();
      me.mockResolvedValue(null);
      await act(async () => {
        await client.refetchQueries({ queryKey: sessionKey });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(clear).toHaveBeenCalled();
      expect(call.getSnapshot().phase).toBe('idle');
      expect(call.canResume()).toBe(false);
      expect(socket.connected).toBe(false);
    } finally {
      await act(async () => root.unmount());
      client.clear();
      call.clear();
      me.mockRestore();
    }
  },
);
