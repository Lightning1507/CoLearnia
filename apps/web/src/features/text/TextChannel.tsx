import { useEffect, useRef, useState } from 'react';
import type { AuthenticatedData } from '@colearnia/contracts';
import { io } from 'socket.io-client';
import { TextTimeline } from './TextTimeline';
import { createTextApi } from './text-api';
import { createTextSynchronizer, type TextSyncState } from './text-sync';
import { createTextConnection } from './text-connection';

// Bounded in-memory projection. These budgets do not establish server capacity.
const limits = {
  events: 128,
  messages: 500,
  bytes: 2_000_000,
  pages: 64,
  pageSize: 30,
  reconcileMs: 5000,
  roundMs: 12_000,
};

export function TextChannel({
  channelId,
  session,
  onAccessLost,
}: {
  channelId: string;
  session: AuthenticatedData;
  onAccessLost: () => void;
}) {
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
  const [error, setError] = useState('');
  const connectionRef = useRef<ReturnType<typeof createTextConnection> | null>(null);
  useEffect(() => {
    let active = true;
    const origin = new URL(import.meta.env.VITE_API_BASE_URL ?? '/api/v1', window.location.href)
      .origin;
    const socket = io(origin, {
      autoConnect: false,
      transports: ['websocket'],
      withCredentials: true,
      auth: { csrfToken: session.csrfToken, textSenderNames: true },
    });
    const api = createTextApi(
      socket,
      channelId,
      session.csrfToken,
      import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
    );
    const controller = createTextSynchronizer(api.sync, channelId, limits, (value) => {
      if (active) {
        setState(value);
        if (value.phase === 'live') setOpened(true);
        if (value.phase === 'revoked' || value.phase === 'blocked')
          connectionRef.current?.disconnect();
        if (value.phase === 'revoked') onAccessLost();
      }
    });
    const connection = createTextConnection(socket, controller, {
      connected() {
        if (!active) return;
        setRuntime({ api, controller, disconnect: connection.disconnect });
        setError('');
      },
      unavailable() {
        if (active) setError('Chưa kết nối được dịch vụ chat. Hãy kiểm tra phiên và thử lại.');
      },
      accessLost() {
        if (!active) return;
        setState({ phase: 'revoked', messages: [], checkpoint: undefined, olderCursor: null });
        onAccessLost();
      },
    });
    connectionRef.current = connection;
    socket.connect();
    return () => {
      active = false;
      if (connectionRef.current === connection) connectionRef.current = null;
      connection.dispose();
    };
  }, [channelId, session.csrfToken, onAccessLost]);

  if (state.phase === 'revoked') return <p role="alert">Bạn không còn quyền đọc kênh này.</p>;
  if (state.phase === 'blocked')
    return (
      <div role="alert">
        <p>Bộ nhớ chat đã đạt giới hạn.</p>
        <button onClick={() => window.location.reload()}>Tải lại trang để mở cửa sổ tin mới</button>
      </div>
    );
  return (
    <div className="text-fixture-panel">
      {error && <p role="alert">{error}</p>}
      {state.olderCursor && state.phase === 'live' && (
        <button onClick={() => void runtime?.controller.loadOlder()}>Xem tin nhắn cũ</button>
      )}
      {state.phase !== 'live' && (
        <div role="status">
          <p>
            {state.phase === 'resync'
              ? 'Chưa đồng bộ được chat. Dịch vụ có thể chưa sẵn sàng, hãy thử lại.'
              : 'Đang kết nối và đồng bộ tin nhắn…'}
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
                  onAccessLost();
                  setState({
                    phase: 'revoked',
                    messages: [],
                    checkpoint: undefined,
                    olderCursor: null,
                  });
                } else if (!signal.aborted) {
                  setError(
                    'Chưa gửi được tin nhắn. Dịch vụ có thể chưa sẵn sàng, hãy thử gửi lại cùng tin.',
                  );
                }
                throw failure;
              }
            },
          }}
          senderId={session.user.id}
          displayName={session.user.displayName}
          projection={state.messages}
          connected={state.phase === 'live'}
        />
      )}
    </div>
  );
}
