import { useLayoutEffect, useRef, useState } from 'react';
import type { CameraSnapshot, CameraView } from '../runtime/cameraProjection';
import { cameraStatus } from '../runtime/cameraProjection';

function CameraVideo({
  track,
  onPlaying,
  visible,
}: {
  track: MediaStreamTrack;
  onPlaying: (value: boolean) => void;
  visible: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const element = video.current;
    if (!element) return;
    let current = true;
    const waiting = () => onPlaying(false);
    const playing = () =>
      onPlaying(
        current &&
          track.readyState === 'live' &&
          !track.muted &&
          !element.paused &&
          element.videoWidth > 0,
      );
    const stream = new MediaStream([track]);
    element.srcObject = stream;
    element.addEventListener('playing', playing);
    for (const name of ['waiting', 'stalled', 'pause', 'emptied', 'error'])
      element.addEventListener(name, waiting);
    track.addEventListener('ended', waiting);
    track.addEventListener('mute', waiting);
    track.addEventListener('unmute', playing);
    void element.play().catch(() => {
      if (current) waiting();
    });
    return () => {
      current = false;
      element.removeEventListener('playing', playing);
      for (const name of ['waiting', 'stalled', 'pause', 'emptied', 'error'])
        element.removeEventListener(name, waiting);
      track.removeEventListener('ended', waiting);
      track.removeEventListener('mute', waiting);
      track.removeEventListener('unmute', playing);
      element.srcObject = null;
      // Unmount only releases the DOM binding. The call still owns the track.
    };
  }, [track, onPlaying]);
  return (
    <video
      ref={video}
      muted
      autoPlay
      playsInline
      aria-label="Hình ảnh camera"
      className={`aspect-video w-full rounded-lg object-cover ${visible ? '' : 'invisible'}`}
    />
  );
}

function CameraTile({ camera, synchronized }: { camera: CameraView; synchronized: boolean }) {
  const [playing, setPlaying] = useState(false);
  return (
    <article
      className="grid min-w-0 content-start gap-2 rounded-xl border border-[color:var(--workspace-border)] bg-[var(--workspace-content-bg)] p-3"
      aria-label={camera.local ? 'Camera của bạn' : 'Camera người tham gia'}
    >
      {camera.track && synchronized && camera.source.publicationState === 'PUBLISHING' ? (
        <div className="relative rounded-lg bg-stone-100">
          <CameraVideo track={camera.track} onPlaying={setPlaying} visible={playing} />
          {!playing && (
            <span
              className="absolute inset-0 grid place-items-center text-stone-500"
              aria-hidden="true"
            >
              Camera
            </span>
          )}
        </div>
      ) : (
        <div
          className="grid aspect-video place-items-center rounded-lg bg-stone-100 text-stone-500"
          aria-hidden="true"
        >
          Camera
        </div>
      )}
      <p className="text-sm text-[color:var(--workspace-muted)]" role="status">
        {cameraStatus(camera, synchronized, playing)}
      </p>
    </article>
  );
}

export function CameraTiles({ snapshot }: { snapshot: CameraSnapshot }) {
  return (
    <section
      aria-label="Camera cuộc gọi"
      className="grid w-full grid-cols-1 gap-3 p-3 @min-[560px]/room-layout:grid-cols-2"
    >
      {snapshot.cameras.length === 0 ? (
        <p>Chưa có camera khả dụng.</p>
      ) : (
        snapshot.cameras.map((camera) => (
          <CameraTile
            key={`${camera.source.sourceId}:${camera.source.sourceGeneration}:${camera.source.sourceRevision}:${camera.track?.id ?? 'waiting'}`}
            camera={camera}
            synchronized={snapshot.synchronized}
          />
        ))
      )}
    </section>
  );
}
