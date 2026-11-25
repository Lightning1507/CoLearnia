import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CallControllerOwner } from './runtime/callController';
import { MainCall } from './runtime/mainCall';
import { LobbyDeviceCheck } from './lobby/LobbyDeviceCheck';
import { RoomShell } from './room/RoomShell';
import { ScreenShareControls } from './share/ScreenShareControls';

import { MainCallContext } from './runtime/mainCallContext';

export function MainCallProvider({
  owner,
  children,
}: {
  owner: CallControllerOwner;
  children: ReactNode;
}) {
  const [call] = useState(() => new MainCall(owner));
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const lastRoute = useRef<{ channel: string; live: string } | undefined>(undefined);
  useEffect(() => {
    if (state.phase === 'idle') {
      const previous = lastRoute.current;
      lastRoute.current = undefined;
      if (previous && location.pathname === previous.live)
        navigate(previous.channel, { replace: true });
      return;
    }
    if (!state.target) return;
    const channel = `/workspaces/${state.target.workspaceId}/channels/${state.target.channelId}`;
    const live = channel + '/live';
    lastRoute.current = { channel, live };
    if (state.cleanupPending) {
      if (location.pathname === live) navigate(channel, { replace: true });
      return;
    }
    // URL controls the visible panel, never native ownership or automatic capture.
    if (location.pathname === live && !state.expanded) call.expand(true);
    else if (location.pathname !== live && state.expanded) call.expand(false);
  }, [
    call,
    state.phase,
    state.target,
    state.expanded,
    state.cleanupPending,
    location.pathname,
    navigate,
  ]);
  useEffect(() => () => call.clear(), [call]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const localWindow = window as Window & { liveAudioDiagnostics?: typeof call.inspectAudio };
    localWindow.liveAudioDiagnostics = call.inspectAudio;
    return () => {
      if (localWindow.liveAudioDiagnostics === call.inspectAudio)
        delete localWindow.liveAudioDiagnostics;
    };
  }, [call]);
  return (
    <MainCallContext.Provider value={call}>
      <div className="main-call-background" inert={state.expanded}>
        {children}
      </div>
      <MainCallHost call={call} />
    </MainCallContext.Provider>
  );
}

function MainCallHost({ call }: { call: MainCall }) {
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const [panel, setPanel] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const showCall = (expanded: boolean) => {
    const target = call.getSnapshot().target;
    if (!target) return;
    call.expand(expanded);
    navigate(
      `/workspaces/${target.workspaceId}/channels/${target.channelId}${expanded ? '/live' : ''}`,
    );
  };
  useLayoutEffect(() => {
    if (!state.expanded) return;
    const previous = document.activeElement;
    screen.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [state.expanded]);
  if (state.phase === 'idle')
    return state.message ? (
      <p role="status" className="main-call-notice">
        {state.message}
      </p>
    ) : null;
  const target = state.target;
  if (!target) return null;
  if (!state.expanded && state.cleanupPending)
    return (
      <aside className="main-call-strip" aria-label="Trạng thái rời cuộc gọi">
        <span role="status">{state.message}</span>
        {state.phase === 'error' && (
          <button
            type="button"
            className="auth-secondary"
            onClick={() => void call.retryDeparture()}
          >
            Thử xác nhận rời lại
          </button>
        )}
      </aside>
    );
  if (!state.expanded)
    return (
      <aside className="main-call-strip" aria-label="Cuộc gọi đang mở">
        <span>
          {target.channelName} ·{' '}
          {state.phase === 'active' ? 'Đang trong cuộc gọi' : 'Cuộc gọi cần xử lý'}
        </span>
        <button type="button" className="auth-secondary" onClick={() => showCall(true)}>
          Về cuộc gọi
        </button>
        <button type="button" className="auth-secondary" onClick={() => call.cancel()}>
          {state.phase === 'joining' || state.phase === 'lobby' ? 'Hủy tham gia' : 'Rời'}
        </button>
      </aside>
    );
  const closePanel = () => {
    setPanel(false);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('[data-main-participants]')?.focus(),
    );
  };
  return (
    <div
      className="main-call-screen"
      aria-label={`Cuộc gọi ${target.channelName}`}
      tabIndex={-1}
      ref={screen}
    >
      {state.phase === 'lobby' || state.phase === 'joining' ? (
        <LobbyDeviceCheck
          key={target.channelId}
          channelName={target.channelName}
          notice="Nếu vừa tải lại trang, bạn cần tham gia lại; mic và camera không tự bật. Nếu báo đang có cuộc gọi khác, hãy đợi kết nối cũ được dọn rồi thử lại."
          onBack={() => {
            call.cancel();
            showCall(false);
          }}
          onContinue={(preferences) => void call.join(preferences)}
          continuePending={state.phase === 'joining'}
        />
      ) : state.handle && state.resources ? (
        <RoomShell
          channelName={target.channelName}
          sessionId={state.handle.identity.sessionId}
          devices={state.resources.devices}
          header={{
            navigation: (
              <button
                type="button"
                className="live-room-workspace-button"
                onClick={() => showCall(false)}
              >
                ← Workspace
              </button>
            ),
            description: `Phòng chung · ${state.projection?.viewer.role === 'HOST' ? 'Bạn là host' : 'Bạn là thành viên'}`,
            position: 'Mic của bạn phát trong Phòng chung',
          }}
          participantNames={Object.fromEntries(
            state.projection?.participants.map((person) => [
              person.participantId,
              person.displayName,
            ]) ?? [],
          )}
          stageMedia={state.stream ? { call: state.handle, stream: state.stream } : undefined}
          {...(state.shareLabel ? { shareLabel: state.shareLabel } : {})}
          controls={<ScreenShareControls picker={state.resources.picker} />}
          secondaryControls={
            <>
              <button
                type="button"
                className="live-toolbar-control"
                data-main-participants
                aria-expanded={panel}
                onClick={() => setPanel(!panel)}
              >
                Người tham gia ({state.projection?.participants.length ?? 0})
              </button>
              <button
                type="button"
                className="live-toolbar-control"
                data-state="danger"
                onClick={() => void call.leave()}
              >
                {state.projection?.viewer.role === 'HOST' ? 'Kết thúc phiên' : 'Rời'}
              </button>
            </>
          }
          sidePanel={
            panel
              ? {
                  label: 'Người tham gia',
                  content: (
                    <ul className="main-call-roster">
                      {state.projection?.participants.map((person) => (
                        <li key={person.participantId}>
                          {person.displayName}
                          {person.role === 'HOST' ? ' · Host' : ''}
                        </li>
                      ))}
                    </ul>
                  ),
                  onBackToStage: closePanel,
                }
              : undefined
          }
        />
      ) : (
        <section className="main-call-progress" aria-labelledby="main-call-heading">
          <h1
            id="main-call-heading"
            className="m-0 text-2xl leading-tight font-semibold wrap-anywhere"
          >
            {target.channelName}
          </h1>
          <p role="status">
            {state.phase === 'reconnecting' ? 'Đang kết nối lại…' : 'Chưa hoàn tất cuộc gọi'}
          </p>
          {state.message && <p role="alert">{state.message}</p>}
          {state.phase === 'error' &&
            (state.cleanupPending ? (
              <button
                type="button"
                className="auth-primary"
                onClick={() => void call.retryDeparture()}
              >
                Thử xác nhận rời lại
              </button>
            ) : (
              <button type="button" className="auth-primary" onClick={() => call.retryJoin()}>
                Thử vào lại cùng yêu cầu
              </button>
            ))}
          {state.phase === 'error' && !state.cleanupPending && call.canResume() && (
            <button type="button" className="auth-secondary" onClick={() => void call.resume()}>
              Thử kết nối lại
            </button>
          )}
          {!state.cleanupPending && (
            <button type="button" className="auth-secondary" onClick={() => call.cancel()}>
              Hủy và về Workspace
            </button>
          )}
          <button type="button" className="auth-secondary" onClick={() => showCall(false)}>
            Xem Workspace
          </button>
        </section>
      )}
      {state.handle && state.message && (
        <p role="alert" className="main-call-notice">
          {state.message}
        </p>
      )}
    </div>
  );
}
