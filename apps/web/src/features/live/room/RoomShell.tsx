import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CallHandle, CallSnapshot } from '../runtime/callController';
import { useCallSnapshot } from '../runtime/callControllerContext';
import './room-shell.css';

const statusLabels: Record<CallSnapshot['status'], string> = {
  idle: 'Chưa tham gia cuộc gọi',
  starting: 'Đang chuẩn bị cuộc gọi…',
  active: 'Phiên gọi đang hoạt động',
};

type RoomShellProps = {
  channelName: string;
  stage?: ReactNode;
  stageMedia?: { call: CallHandle; stream: MediaStream } | undefined;
  participants?: ReactNode;
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
  return <video ref={video} aria-label="Hình ảnh sân khấu" autoPlay muted playsInline />;
}

export function RoomShell({
  channelName,
  stage,
  stageMedia,
  participants,
  controls,
  error,
}: RoomShellProps) {
  const call = useCallSnapshot();
  const titleId = useId();
  // The owner shares this identity object between the active snapshot and its handle.
  const stream =
    call.status === 'active' && stageMedia?.call.identity === call.identity
      ? stageMedia.stream
      : undefined;

  return (
    <article className="room-shell" aria-labelledby={titleId}>
      <header className="room-shell-header">
        <h2 id={titleId}>{channelName}</h2>
        <p role="status">{statusLabels[call.status]}</p>
      </header>
      <div className="room-shell-body">
        <section className="room-shell-stage" aria-label="Sân khấu cuộc gọi">
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            (stage ?? (stream ? <StageVideo stream={stream} /> : <p>Chưa có hình ảnh sân khấu.</p>))
          )}
        </section>
        <section className="room-shell-participants" aria-label="Người tham gia">
          <h3>Người tham gia</h3>
          {participants ?? <p>Chưa có danh sách người tham gia.</p>}
        </section>
      </div>
      <footer className="room-shell-controls" aria-label="Điều khiển cuộc gọi">
        {controls ?? <p>Chưa có điều khiển cuộc gọi khả dụng.</p>}
      </footer>
    </article>
  );
}
