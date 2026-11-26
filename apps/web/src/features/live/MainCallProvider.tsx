import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTransientNotice } from '../../app/useTransientNotice';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CallControllerOwner } from './runtime/callController';
import { MainCall } from './runtime/mainCall';
import { LobbyDeviceCheck } from './lobby/LobbyDeviceCheck';
import { RoomShell } from './room/RoomShell';
import { ScreenShareControls } from './share/ScreenShareControls';
import { DeviceMediaControls } from './room/DeviceMediaControls';
import { useWorkspaceTheme } from '../workspaces/workspace-appearance';
import { WorkspaceIcon } from '../workspaces/WorkspaceIcon';
import { CallDockRegistration, MeetingNavigation } from '../workspaces/meeting-navigation';
import './live-v11.css';

import { MainCallContext } from './runtime/mainCallContext';

const workspaceBrowseRoute = /^\/workspaces(?:\/[a-f0-9]{24}(?:\/channels\/[a-f0-9]{24})?)?$/i;

export function MainCallProvider({
  owner,
  children,
}: {
  owner: CallControllerOwner;
  children: ReactNode;
}) {
  const [call] = useState(() => new MainCall(owner));
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const { pathname, key: locationKey } = useLocation();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const meetingFocused = state.expanded && state.phase === 'active';
  if (!meetingFocused && navigationOpen) setNavigationOpen(false);
  const browsePath = useRef<string | undefined>(undefined);
  const lastRoute = useRef<{ live: string; returnTo: string; entryKey?: string } | undefined>(
    undefined,
  );
  useEffect(() => {
    // The channel route can open the lobby in its effect before this effect runs.
    const current = call.getSnapshot();
    if (workspaceBrowseRoute.test(pathname)) browsePath.current = pathname;
    if (current.target) {
      const workspace = `/workspaces/${current.target.workspaceId}`;
      const channel = `${workspace}/channels/${current.target.channelId}`;
      const live = channel + '/live';
      const previous = browsePath.current;
      const entryKey =
        pathname === live && !current.cleanupPending
          ? locationKey
          : lastRoute.current?.live === live
            ? lastRoute.current.entryKey
            : undefined;
      lastRoute.current = {
        live,
        returnTo: previous && previous !== channel ? previous : workspace,
        ...(entryKey && { entryKey }),
      };
    }
    const route = lastRoute.current;
    if (!route) return;
    if (current.phase === 'idle' || current.cleanupPending) {
      if (pathname === route.live && (current.cleanupPending || route.entryKey === locationKey))
        navigate(route.returnTo, { replace: true });
      if (current.phase === 'idle') lastRoute.current = undefined;
      return;
    }
    // URL controls the visible panel, never native ownership or automatic capture.
    if (pathname === route.live && !current.expanded) call.expand(true);
    else if (pathname !== route.live && current.expanded) call.expand(false);
  }, [
    call,
    state.phase,
    state.target,
    state.expanded,
    state.cleanupPending,
    pathname,
    locationKey,
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
      <div className="main-call-layout">
        <MeetingNavigation.Provider
          value={{
            focused: meetingFocused,
            open: meetingFocused && navigationOpen,
            close: () => setNavigationOpen(false),
          }}
        >
          <div
            className="main-call-background"
            inert={state.expanded && !(meetingFocused && navigationOpen)}
            data-meeting-focus={meetingFocused}
          >
            <CallDockRegistration.Provider value={setDock}>
              {children}
            </CallDockRegistration.Provider>
          </div>
          <MainCallHost
            call={call}
            navigationOpen={navigationOpen}
            onOpenNavigation={() => setNavigationOpen(true)}
            dock={dock}
            onReturnToWorkspace={() => {
              if (lastRoute.current) navigate(lastRoute.current.returnTo, { replace: true });
            }}
          />
        </MeetingNavigation.Provider>
      </div>
    </MainCallContext.Provider>
  );
}

function MainCallHost({
  call,
  navigationOpen,
  onOpenNavigation,
  dock,
  onReturnToWorkspace,
}: {
  call: MainCall;
  navigationOpen: boolean;
  onOpenNavigation: () => void;
  dock: HTMLDivElement | null;
  onReturnToWorkspace: () => void;
}) {
  const { theme } = useWorkspaceTheme();
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const notice = useTransientNotice(
    state.phase === 'idle' || (state.phase === 'active' && !state.cleanupPending)
      ? state.message
      : undefined,
  );
  const [panel, setPanel] = useState<'participants' | 'chat'>();
  const screen = useRef<HTMLDivElement>(null);
  const departure = useRef<HTMLDialogElement>(null);
  const [departureRole, setDepartureRole] = useState<'HOST' | 'MEMBER'>();
  const navigate = useNavigate();
  const showCall = () => {
    const target = call.getSnapshot().target;
    if (!target) return;
    navigate(`/workspaces/${target.workspaceId}/channels/${target.channelId}/live`);
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
    return notice ? (
      <p role="status" className="main-call-notice">
        {notice}
      </p>
    ) : null;
  const target = state.target;
  if (!target) return null;
  const host = state.projection?.viewer.role === 'HOST';
  const leaveLabel = host ? 'Kết thúc phiên' : 'Rời cuộc họp';
  const renderDock = (content: ReactNode) => (dock ? createPortal(content, dock) : content);
  if (!state.expanded && state.cleanupPending)
    return renderDock(
      <aside
        className="main-call-strip"
        data-workspace-theme={theme}
        aria-label="Trạng thái rời cuộc gọi"
      >
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
      </aside>,
    );
  if (!state.expanded)
    return renderDock(
      <aside className="main-call-strip" data-workspace-theme={theme} aria-label="Cuộc gọi đang mở">
        <button
          type="button"
          className="main-call-return"
          aria-label={'Về cuộc gọi ' + target.channelName}
          onClick={showCall}
        >
          <WorkspaceIcon name="video" />
          <span>
            <strong>{target.channelName}</strong>
            <small>{state.phase === 'active' ? 'Đang trong cuộc gọi' : 'Cuộc gọi cần xử lý'}</small>
          </span>
          <WorkspaceIcon name="chevron" />
        </button>
        {state.phase === 'active' && state.resources && (
          <div className="main-call-devices">
            <DeviceMediaControls devices={state.resources.devices} compact />
          </div>
        )}
        <button
          type="button"
          className="auth-secondary main-call-leave"
          onClick={() => call.cancel()}
        >
          {state.phase === 'joining' || state.phase === 'lobby' ? 'Hủy tham gia' : 'Rời'}
        </button>
      </aside>,
    );
  const closePanel = () => {
    setPanel(undefined);
    requestAnimationFrame(() =>
      screen.current?.querySelector<HTMLButtonElement>(`[data-meeting-panel="${panel}"]`)?.focus(),
    );
  };
  return (
    <div
      className="main-call-screen live-v11"
      data-workspace-theme={theme}
      aria-label={`Cuộc gọi ${target.channelName}`}
      tabIndex={-1}
      ref={screen}
    >
      {state.phase === 'lobby' || state.phase === 'joining' ? (
        state.otherTabActive || state.transferAvailable || state.transferPending ? (
          <LobbyDeviceCheck
            channelName={target.channelName}
            transfer
            {...(state.message ? { notice: state.message } : {})}
            onContinue={(preferences) => void call.join(preferences, true)}
            continuePending={state.phase === 'joining'}
            onBack={() => call.cancel()}
          />
        ) : (
          <LobbyDeviceCheck
            key={target.channelId}
            channelName={target.channelName}
            {...(state.ownershipConflict
              ? {
                  notice:
                    'Tài khoản đang có một kết nối cuộc gọi khác. Hãy kiểm tra cuộc gọi đang mở rồi thử lại.',
                }
              : {})}
            onBack={() => call.cancel()}
            onContinue={(preferences) => void call.join(preferences)}
            continuePending={state.phase === 'joining'}
          />
        )
      ) : state.phase === 'transferred' ? (
        <section className="main-call-progress">
          <h1>Đã chuyển cuộc gọi sang thiết bị khác</h1>
          <button className="auth-primary" type="button" onClick={call.transferHere}>
            Chuyển trở lại
          </button>
          <button className="auth-secondary" type="button" onClick={() => call.cancel()}>
            Về Workspace
          </button>
        </section>
      ) : state.handle && state.resources ? (
        <RoomShell
          meetingLayout
          channelName={target.channelName}
          sessionId={state.handle.identity.sessionId}
          devices={state.resources.devices}
          header={{
            navigation: (
              <button
                type="button"
                className="meeting-icon"
                aria-label="Mở điều hướng Workspace"
                aria-haspopup="dialog"
                aria-expanded={navigationOpen}
                title="Mở điều hướng Workspace"
                onClick={onOpenNavigation}
              >
                <WorkspaceIcon name="menu" />
              </button>
            ),
            description: `Phòng chung · ${state.projection?.viewer.role === 'HOST' ? 'Bạn là host' : 'Bạn là thành viên'}`,
            position: (
              <button
                type="button"
                className="meeting-icon"
                title="Thu gọn về Workspace"
                aria-label="Thu gọn về Workspace"
                onClick={onReturnToWorkspace}
              >
                <WorkspaceIcon name="minimize" />
                <span>Thu gọn</span>
              </button>
            ),
          }}
          participantNames={Object.fromEntries(
            state.projection?.participants.map((person) => [
              person.participantId,
              person.displayName,
            ]) ?? [],
          )}
          localParticipantId={state.handle.identity.participantId}
          stageMedia={state.stream ? { call: state.handle, stream: state.stream } : undefined}
          {...(state.shareLabel ? { shareLabel: state.shareLabel } : {})}
          controls={<ScreenShareControls picker={state.resources.picker} compact />}
          secondaryControls={
            <>
              <button
                type="button"
                className="live-toolbar-control"
                data-meeting-panel="participants"
                aria-label="Người tham gia"
                title="Người tham gia"
                aria-expanded={panel === 'participants'}
                onClick={() => (panel === 'participants' ? closePanel() : setPanel('participants'))}
              >
                <WorkspaceIcon name="people" />
              </button>
              <button
                type="button"
                className="live-toolbar-control"
                data-meeting-panel="chat"
                aria-label="Chat cuộc họp"
                title="Chat cuộc họp"
                aria-expanded={panel === 'chat'}
                onClick={() => (panel === 'chat' ? closePanel() : setPanel('chat'))}
              >
                <WorkspaceIcon name="chat" />
              </button>
              <button
                type="button"
                className="live-toolbar-control"
                data-state="danger"
                aria-label={leaveLabel}
                title={leaveLabel}
                aria-haspopup="dialog"
                disabled={!state.projection}
                onClick={() => {
                  setDepartureRole(host ? 'HOST' : 'MEMBER');
                  departure.current?.showModal();
                }}
              >
                <WorkspaceIcon name="phoneOff" />
              </button>
            </>
          }
          sidePanel={
            panel
              ? {
                  label: panel === 'participants' ? 'Người tham gia' : 'Chat cuộc họp',
                  content:
                    panel === 'chat' ? (
                      <p>Chat cuộc họp chưa khả dụng.</p>
                    ) : (
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
          <button type="button" className="auth-secondary" onClick={onReturnToWorkspace}>
            Xem Workspace
          </button>
        </section>
      )}
      {state.handle && state.resources && (
        <dialog
          ref={departure}
          className="meeting-departure"
          aria-label={departureRole === 'HOST' ? 'Kết thúc phiên' : 'Rời cuộc họp'}
        >
          <h2>{departureRole === 'HOST' ? 'Kết thúc phiên cho mọi người?' : 'Rời cuộc họp?'}</h2>
          <p>
            {departureRole === 'HOST'
              ? 'Mọi người sẽ rời cuộc gọi. Kênh vẫn được giữ.'
              : 'Các thành viên khác vẫn có thể tiếp tục cuộc gọi.'}
          </p>
          {state.projection && departureRole !== (host ? 'HOST' : 'MEMBER') && (
            <p role="status">Vai trò trong phòng vừa thay đổi. Đóng hộp thoại và thử lại.</p>
          )}
          <div>
            <button
              type="button"
              autoFocus
              className="auth-secondary"
              onClick={() => departure.current?.close()}
            >
              Ở lại
            </button>
            <button
              type="button"
              className="auth-secondary meeting-confirm-leave"
              disabled={!state.projection || departureRole !== (host ? 'HOST' : 'MEMBER')}
              onClick={() => {
                const current = call.getSnapshot().projection;
                if (
                  !current ||
                  departureRole !== (current.viewer.role === 'HOST' ? 'HOST' : 'MEMBER')
                )
                  return;
                departure.current?.close();
                void call.leave();
              }}
            >
              {departureRole === 'HOST' ? 'Kết thúc phiên' : 'Rời cuộc họp'}
            </button>
          </div>
        </dialog>
      )}
      {state.handle && notice && (
        <p role="alert" className="main-call-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
