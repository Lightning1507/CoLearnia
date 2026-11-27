import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { AuthenticatedData, TextHistoryMessage } from '@colearnia/contracts';
import { io } from 'socket.io-client';
import { TextTimeline } from './TextTimeline';
import { createTextApi } from './text-api';
import { createTextSynchronizer, type TextSyncState } from './text-sync';
import { createTextConnection } from './text-connection';
import { useTextMemory } from './text-memory';
import { useTransientNotice } from '../../app/useTransientNotice';

// Bounded in-memory projection. These budgets do not establish server capacity.
const limits = {
  events: 128,
  messages: 500,
  bytes: 2_000_000,
  pages: 64,
  pageSize: 30,
  roundMs: 12_000,
};

export function TextChannel({
  channelId,
  workspaceId,
  channelName,
  session,
  selected,
  onAccessLost,
  onSubscriptionBusy,
  onSearchProjection,
}: {
  channelId: string;
  workspaceId?: string;
  channelName?: string | undefined;
  session: AuthenticatedData;
  selected: boolean;
  onAccessLost: (channelId: string) => void;
  onSubscriptionBusy: (channelId: string) => boolean;
  onSearchProjection?: (projection: {
    channelId: string;
    messages: readonly TextHistoryMessage[];
  }) => void;
}) {
  const memory = useTextMemory();
  const [state, setState] = useState<TextSyncState>({
    phase: 'idle',
    messages: [],
    checkpoint: undefined,
    olderCursor: null,
  });
  const [runtime, setRuntime] = useState<{
    api: ReturnType<typeof createTextApi>;
    controller: ReturnType<typeof createTextSynchronizer>;
    disconnect: () => void;
  }>();
  const [opened, setOpened] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [socketOnline, setSocketOnline] = useState(false);
  const [error, setError] = useState('');
  const errorNotice = useTransientNotice(error);
  const connectionRef = useRef<ReturnType<typeof createTextConnection> | null>(null);
  useEffect(() => {
    if (selected && onSearchProjection)
      onSearchProjection({ channelId, messages: state.phase === 'live' ? state.messages : [] });
  }, [channelId, onSearchProjection, selected, state.messages, state.phase]);
  const reportAccessLost = useEffectEvent(() => onAccessLost(channelId));
  const isSelected = useEffectEvent(() => selected);
  const releaseHidden = useEffectEvent(() => selected && onSubscriptionBusy(channelId));
  useEffect(() => {
    let active = true;
    const origin = new URL(import.meta.env.VITE_API_BASE_URL ?? '/api/v1', window.location.href)
      .origin;
    const socket = io(origin, {
      autoConnect: false,
      transports: ['websocket'],
      withCredentials: true,
      auth: {
        csrfToken: session.csrfToken,
        textSenderNames: true,
        textPersistentSubscription: true,
      },
    });
    const api = createTextApi(
      socket,
      channelId,
      session.csrfToken,
      import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
    );
    const controller = createTextSynchronizer(
      api.sync,
      channelId,
      limits,
      (value) => {
        if (active) {
          setState(value);
          if (value.phase === 'live') setOpened(true);
          if (value.phase === 'revoked' || value.phase === 'blocked')
            connectionRef.current?.disconnect();
          if (value.phase === 'revoked') reportAccessLost();
        }
      },
      () => (active && releaseHidden() ? () => isSelected() : undefined),
    );
    const connection = createTextConnection(socket, controller, {
      connected() {
        if (!active) return;
        setRuntime({ api, controller, disconnect: connection.disconnect });
        setSocketOnline(true);
        setError('');
      },
      unavailable() {
        if (active) setError('Chưa kết nối được dịch vụ chat. Hãy kiểm tra phiên và thử lại.');
      },
      accessLost() {
        if (!active) return;
        setState({ phase: 'revoked', messages: [], checkpoint: undefined, olderCursor: null });
        reportAccessLost();
      },
    });
    const onDisconnect = () => setSocketOnline(false);
    socket.on('disconnect', onDisconnect);
    connectionRef.current = connection;
    socket.connect();
    return () => {
      active = false;
      socket.off('disconnect', onDisconnect);
      if (connectionRef.current === connection) connectionRef.current = null;
      connection.dispose();
    };
  }, [channelId, session.csrfToken, syncAttempt]);

  if (state.phase === 'revoked') return <p role="alert">Bạn không còn quyền đọc kênh này.</p>;
  if (state.phase === 'blocked')
    return (
      <div role="alert">
        <p>Bộ nhớ chat đã đạt giới hạn.</p>
        <button
          type="button"
          onClick={() => {
            setRuntime(undefined);
            setOpened(false);
            setSocketOnline(false);
            setError('');
            setState({ phase: 'idle', messages: [], checkpoint: undefined, olderCursor: null });
            setSyncAttempt((value) => value + 1);
          }}
        >
          Tải lại tin nhắn của kênh
        </button>
      </div>
    );
  return (
    <div className="text-channel">
      {(error ||
        state.phase === 'resync' ||
        (!opened && state.phase !== 'live') ||
        (opened && !socketOnline)) && (
        <div className="text-channel-status" role={errorNotice ? 'alert' : 'status'}>
          <p>
            {errorNotice ||
              (state.phase === 'resync'
                ? 'Chat đang chờ đồng bộ.'
                : error
                  ? 'Chat đang chờ kết nối.'
                  : 'Đang kết nối và đồng bộ tin nhắn…')}
          </p>
          <button onClick={() => connectionRef.current?.retry()}>Thử kết nối lại</button>
        </div>
      )}
      {runtime && opened && (
        <TextTimeline
          port={{
            history: async () => state.messages,
            send: async (payload, signal) => {
              try {
                const message = await runtime.api.send(payload, signal);
                await runtime.controller.reconcile();
                return message;
              } catch (failure) {
                if (
                  !signal.aborted &&
                  failure &&
                  typeof failure === 'object' &&
                  'code' in failure &&
                  ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'].includes(String(failure.code))
                ) {
                  runtime.controller.stop();
                  runtime.disconnect();
                  onAccessLost(channelId);
                  setState({
                    phase: 'revoked',
                    messages: [],
                    checkpoint: undefined,
                    olderCursor: null,
                  });
                }
                throw failure;
              }
            },
          }}
          senderId={session.user.id}
          displayName={session.user.displayName}
          projection={state.messages}
          visible={selected}
          connected={socketOnline && state.phase === 'live'}
          channelName={channelName}
          {...(memory && workspaceId && { memory, scope: workspaceId + ':' + channelId })}
          {...(state.olderCursor &&
            state.phase === 'live' && { onLoadOlder: () => void runtime.controller.loadOlder() })}
        />
      )}
    </div>
  );
}
