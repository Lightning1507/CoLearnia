import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CallHandle, CallIdentity, CallSnapshot } from '../runtime/callController';
import { useCallSnapshot } from '../runtime/callControllerContext';

const statusLabels: Record<CallSnapshot['status'], string> = {
  idle: 'Chưa tham gia cuộc gọi',
  starting: 'Đang chuẩn bị cuộc gọi…',
  active: 'Phiên gọi đang hoạt động',
};

type RoomShellProps = {
  channelName: string;
  sessionId: CallIdentity['sessionId'] | undefined;
  stage?: ReactNode;
  stageMedia?: { call: CallHandle; stream: MediaStream } | undefined;
  sidePanel?: { label: string; content: ReactNode };
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
  stage,
  stageMedia,
  sidePanel,
  controls,
  error,
}: RoomShellProps) {
  const call = useCallSnapshot();
  const titleId = useId();
  const panelId = useId();
  const roomCall = call.status !== 'idle' && call.identity.sessionId === sessionId ? call : null;
  // The handle and snapshot share the identity of the same call generation.
  const stream =
    roomCall?.status === 'active' && stageMedia?.call.identity === roomCall.identity
      ? stageMedia.stream
      : undefined;

  return (
    <article
      className="mx-auto grid min-w-0 max-w-[900px] gap-4 rounded-2xl border border-stone-200 bg-white p-[clamp(1rem,3vw,1.5rem)] [overflow-wrap:anywhere]"
      aria-labelledby={titleId}
    >
      <header>
        <h2 id={titleId}>{channelName}</h2>
        <p className="mt-2 text-stone-600" role="status">
          {statusLabels[roomCall?.status ?? 'idle']}
        </p>
      </header>
      <div
        className={
          sidePanel
            ? 'grid grid-cols-1 gap-4 min-[861px]:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]'
            : 'grid grid-cols-1'
        }
      >
        <section
          className="grid min-h-48 min-w-0 place-items-center rounded-xl bg-stone-50 text-center"
          aria-label="Sân khấu cuộc gọi"
        >
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            (stage ?? (stream ? <StageVideo stream={stream} /> : <p>Chưa có hình ảnh sân khấu.</p>))
          )}
        </section>
        {sidePanel && (
          <section className="grid min-w-0 content-start gap-2" aria-labelledby={panelId}>
            <h3 className="text-base font-semibold" id={panelId}>
              {sidePanel.label}
            </h3>
            {sidePanel.content}
          </section>
        )}
      </div>
      <footer
        className="flex flex-wrap gap-3 border-t border-stone-200 pt-4"
        aria-label="Điều khiển cuộc gọi"
      >
        {controls ?? <p>Chưa có điều khiển cuộc gọi khả dụng.</p>}
      </footer>
    </article>
  );
}
