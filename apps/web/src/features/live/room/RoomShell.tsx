import { useId, useLayoutEffect, useRef } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import type { CallHandle, CallIdentity, CallSnapshot } from '../runtime/callController';
import { DeviceMediaControls } from './DeviceMediaControls';
import type { DeviceMedia } from '../runtime/deviceMedia';
import { useCallAudio, useCallCameras, useCallSnapshot } from '../runtime/callControllerContext';
import { CameraTiles, MeetingTiles } from './CameraTiles';

const statusLabels: Record<CallSnapshot['status'], string> = {
  idle: 'Chưa tham gia cuộc gọi',
  starting: 'Đang chuẩn bị cuộc gọi…',
  active: 'Phiên gọi đang hoạt động',
};

type RoomShellProps = {
  channelName: string;
  sessionId: CallIdentity['sessionId'] | undefined;
  useWorkspaceWidth?: boolean;
  stage?: ReactNode;
  stageMedia?: { call: CallHandle; stream: MediaStream } | undefined;
  sidePanel?:
    | {
        label: string;
        content: ReactNode;
        description?: string;
        fillContent?: boolean;
        onBackToStage: () => void;
      }
    | undefined;
  controls?: ReactNode;
  devices?: DeviceMedia;
  error?: string | undefined;
  header?: { navigation?: ReactNode; description?: ReactNode; position?: ReactNode };
  participantNames?: Readonly<Record<string, string>>;
  shareLabel?: string;
  secondaryControls?: ReactNode;
  volumeControls?: ReactNode;
  meetingLayout?: boolean;
  localParticipantId?: string;
};

function StageVideo({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);

  useLayoutEffect(() => {
    const element = video.current;
    if (!element) return;

    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  // This is a visual binding to a borrowed stream. Audio output belongs to the call runtime.
  return (
    <video
      ref={video}
      aria-label="Hình ảnh sân khấu"
      className="block h-full min-h-0 w-full object-contain"
      autoPlay
      muted
      playsInline
    />
  );
}

export function RoomShell({
  channelName,
  sessionId,
  useWorkspaceWidth = false,
  stage,
  stageMedia,
  sidePanel,
  controls,
  devices,
  error,
  header,
  participantNames,
  shareLabel,
  secondaryControls,
  volumeControls,
  meetingLayout = false,
  localParticipantId,
}: RoomShellProps) {
  const call = useCallSnapshot();
  const audio = useCallAudio();
  const cameras = useCallCameras();
  const titleId = useId();
  const panelId = useId();
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const roomElement = useRef<HTMLElement>(null);
  const stageElement = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const audioButtonFocused = useRef(false);
  const panelLabel = sidePanel?.label;

  useLayoutEffect(() => {
    if (panelLabel) panelHeading.current?.focus({ preventScroll: true });
  }, [panelLabel]);

  useLayoutEffect(() => {
    const room = roomElement.current;
    if (!room || !panelLabel) return;
    const document = room.ownerDocument;
    let lastFocused = document.activeElement;

    const rememberFocus = () => {
      const active = document.activeElement;
      if (active !== document.body) lastFocused = room.contains(active) ? active : null;
    };
    const restoreHiddenFocus = () => {
      rememberFocus();
      const active = document.activeElement;
      if (
        lastFocused &&
        room.contains(lastFocused) &&
        lastFocused.getClientRects().length === 0 &&
        (active === lastFocused || active === document.body)
      ) {
        panelHeading.current?.focus({ preventScroll: true });
        lastFocused = panelHeading.current;
      }
    };
    const observer = new ResizeObserver(restoreHiddenFocus);
    observer.observe(room);
    if (stageElement.current) observer.observe(stageElement.current);
    if (backButton.current) observer.observe(backButton.current);
    document.addEventListener('focusin', rememberFocus);
    document.defaultView?.addEventListener('blur', rememberFocus);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', rememberFocus);
      document.defaultView?.removeEventListener('blur', rememberFocus);
    };
  }, [panelLabel]);

  function restorePanelFocus({ currentTarget, relatedTarget }: FocusEvent<HTMLElement>) {
    const blurredToDocument = !relatedTarget || relatedTarget === currentTarget.ownerDocument.body;
    if (blurredToDocument && currentTarget.getClientRects().length === 0) {
      panelHeading.current?.focus({ preventScroll: true });
    }
  }

  const roomCall = call.status !== 'idle' && call.identity.sessionId === sessionId ? call : null;
  const showAudioRecovery = roomCall?.status === 'active' && audio.blocked;
  useLayoutEffect(() => {
    if (showAudioRecovery || !audioButtonFocused.current) return;
    audioButtonFocused.current = false;
    const element = toolbar.current;
    if (element && element.ownerDocument.activeElement === element.ownerDocument.body) {
      element.focus({ preventScroll: true });
    }
  }, [showAudioRecovery]);
  // The handle and snapshot share the identity of the same call generation.
  const stream =
    roomCall?.status === 'active' && stageMedia?.call.identity === roomCall.identity
      ? stageMedia.stream
      : undefined;
  const sharedStage = !error && roomCall?.status === 'active' && Boolean(stage || stream);
  const meetingTiles = meetingLayout && roomCall?.status === 'active' && (
    <MeetingTiles
      snapshot={cameras}
      participantNames={participantNames}
      localParticipantId={localParticipantId}
      shared={sharedStage}
    />
  );

  return (
    <article
      className={`live-room-shell ${useWorkspaceWidth ? 'live-room-in-workspace' : '@container/room-layout live-room-standalone'} ${meetingLayout ? 'meeting-v11' : ''}`}
      aria-labelledby={titleId}
      ref={roomElement}
    >
      <div className="live-room-layout">
        <header className="live-room-header">
          <div className="live-room-navigation">{header?.navigation}</div>
          <div className="live-room-heading">
            <h2 className={useWorkspaceWidth ? 'sr-only' : undefined} id={titleId}>
              {channelName}
            </h2>
            <p
              className={header?.description ? 'sr-only' : 'live-room-call-status'}
              role="status"
              data-state={roomCall?.status ?? 'idle'}
            >
              {statusLabels[roomCall?.status ?? 'idle']}
            </p>
            {header?.description && <p className="live-room-description">{header.description}</p>}
          </div>
          <div className="live-room-position">{header?.position}</div>
        </header>
        <div className={sidePanel ? 'live-room-body live-room-has-panel' : 'live-room-body'}>
          <div
            className={`live-call-media min-w-0 ${sidePanel ? 'hidden @min-[1280px]/room-layout:block' : ''}`}
            ref={stageElement}
            onBlur={restorePanelFocus}
          >
            <div className={sharedStage ? 'live-call-share-layout' : 'live-call-grid-layout'}>
              <section className="live-call-stage" aria-label="Sân khấu cuộc gọi">
                {sharedStage && shareLabel && <p className="live-share-status">{shareLabel}</p>}
                {error ? (
                  <p role="alert">{error}</p>
                ) : (
                  (stage ??
                  (stream ? (
                    <StageVideo stream={stream} />
                  ) : roomCall?.status === 'active' ? (
                    meetingTiles || (
                      <CameraTiles snapshot={cameras} participantNames={participantNames} />
                    )
                  ) : (
                    <p>Chưa có hình ảnh sân khấu.</p>
                  )))
                )}
              </section>
              {sharedStage &&
                (meetingTiles || (
                  <CameraTiles
                    snapshot={cameras}
                    layout="rail"
                    participantNames={participantNames}
                  />
                ))}
            </div>
          </div>
          {sidePanel && (
            <section className="live-room-panel" aria-labelledby={panelId}>
              <header className="live-room-panel-header">
                <div>
                  <h3
                    className="live-room-panel-heading"
                    id={panelId}
                    ref={panelHeading}
                    tabIndex={-1}
                  >
                    {sidePanel.label}
                  </h3>
                  {sidePanel.description && <p>{sidePanel.description}</p>}
                </div>
                <button
                  type="button"
                  className="live-room-panel-close"
                  aria-label="Đóng panel"
                  onClick={sidePanel.onBackToStage}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </header>
              <button
                type="button"
                className="live-room-panel-back @min-[1280px]/room-layout:hidden"
                onClick={sidePanel.onBackToStage}
                ref={backButton}
                onBlur={restorePanelFocus}
              >
                Về sân khấu
              </button>
              <div
                className={`live-room-panel-content${sidePanel.fillContent ? ' live-room-panel-content-fill' : ''}`}
              >
                {sidePanel.content}
              </div>
            </section>
          )}
          <footer
            className="live-room-toolbar"
            aria-label="Điều khiển cuộc gọi"
            ref={toolbar}
            tabIndex={-1}
          >
            {volumeControls && <div className="live-room-volume">{volumeControls}</div>}
            <div className="live-room-controls-main">
              {roomCall?.status === 'active' && devices && (
                <DeviceMediaControls devices={devices} compact={meetingLayout} />
              )}
              {controls ?? (!devices && <p>Chưa có điều khiển cuộc gọi khả dụng.</p>)}
            </div>
            {secondaryControls && (
              <div className="live-room-controls-side">{secondaryControls}</div>
            )}
            {showAudioRecovery && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm" role="status">
                  Âm thanh cuộc gọi đang tạm dừng.
                </p>
                <button
                  type="button"
                  className="live-toolbar-control min-h-10 rounded-lg px-3 py-2 text-sm font-medium"
                  onFocus={() => {
                    audioButtonFocused.current = true;
                  }}
                  onBlur={(event) => {
                    if (
                      event.relatedTarget &&
                      event.relatedTarget !== event.currentTarget.ownerDocument.body
                    ) {
                      audioButtonFocused.current = false;
                    }
                  }}
                  onClick={() => audio.enable(roomCall.identity)}
                >
                  Bật âm thanh
                </button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </article>
  );
}
