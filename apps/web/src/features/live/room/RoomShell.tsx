import { useId, useLayoutEffect, useRef } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import type { CallHandle, CallIdentity, CallSnapshot } from '../runtime/callController';
import { useCallAudio, useCallSnapshot } from '../runtime/callControllerContext';

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
  sidePanel?: { label: string; content: ReactNode; onBackToStage: () => void } | undefined;
  controls?: ReactNode;
  error?: string | undefined;
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
      className="block max-h-[55dvh] w-full object-contain"
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
  error,
}: RoomShellProps) {
  const call = useCallSnapshot();
  const audio = useCallAudio();
  const titleId = useId();
  const panelId = useId();
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const roomElement = useRef<HTMLElement>(null);
  const stageElement = useRef<HTMLElement>(null);
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

  return (
    <article
      className={useWorkspaceWidth ? 'w-full min-w-0' : '@container/room-layout w-full min-w-0'}
      aria-labelledby={titleId}
      ref={roomElement}
    >
      <div
        className={`grid min-w-0 gap-4 bg-[var(--workspace-content-bg)] [overflow-wrap:anywhere] ${useWorkspaceWidth ? 'p-5' : 'rounded-2xl border border-[color:var(--workspace-border)] p-5'}`}
      >
        <header>
          <h2 className={useWorkspaceWidth ? 'sr-only' : undefined} id={titleId}>
            {channelName}
          </h2>
          <p className="mt-2 text-stone-600" role="status">
            {statusLabels[roomCall?.status ?? 'idle']}
          </p>
        </header>
        <div
          className={
            sidePanel
              ? 'grid grid-cols-1 gap-4 @min-[1280px]/room-layout:grid-cols-[minmax(0,1fr)_320px]'
              : 'grid grid-cols-1'
          }
        >
          <section
            className={`min-h-48 min-w-0 place-items-center rounded-xl bg-stone-50 text-center ${sidePanel ? 'hidden @min-[1280px]/room-layout:grid' : 'grid'}`}
            aria-label="Sân khấu cuộc gọi"
            ref={stageElement}
            onBlur={restorePanelFocus}
          >
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              (stage ??
              (stream ? <StageVideo stream={stream} /> : <p>Chưa có hình ảnh sân khấu.</p>))
            )}
          </section>
          {sidePanel && (
            <section className="grid min-w-0 content-start gap-2" aria-labelledby={panelId}>
              <h3 className="text-base font-semibold" id={panelId} ref={panelHeading} tabIndex={-1}>
                {sidePanel.label}
              </h3>
              <button
                type="button"
                className="justify-self-start rounded-lg border border-stone-200 px-3 py-2 @min-[1280px]/room-layout:hidden"
                onClick={sidePanel.onBackToStage}
                ref={backButton}
                onBlur={restorePanelFocus}
              >
                Về sân khấu
              </button>
              {sidePanel.content}
            </section>
          )}
        </div>
        <footer
          className="flex flex-wrap gap-3 border-t border-stone-200 pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cl-color-focus-ring)]"
          aria-label="Điều khiển cuộc gọi"
          ref={toolbar}
          tabIndex={-1}
        >
          {controls ?? <p>Chưa có điều khiển cuộc gọi khả dụng.</p>}
          {showAudioRecovery && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-[color:var(--workspace-muted)]" role="status">
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
    </article>
  );
}
