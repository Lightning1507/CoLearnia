import { useLayoutEffect, useRef, useState } from 'react';
import type { CameraSnapshot, CameraView } from '../runtime/cameraProjection';
import { cameraStatus } from '../runtime/cameraProjection';
import { WorkspaceIcon } from '../../workspaces/WorkspaceIcon';

function CameraVideo({
  track,
  onPlaying,
  visible,
  local,
}: {
  track: MediaStreamTrack;
  onPlaying: (value: boolean) => void;
  visible: boolean;
  local: boolean;
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
          (!local || track.enabled) &&
          !track.muted &&
          !element.paused &&
          element.videoWidth > 0,
      );
    const stream = new MediaStream([track]);
    element.srcObject = stream;
    // Track.enabled has no change event. Observe delivered frames so local
    // disabling/enabling updates both the image and label without a server delta.
    let frame: number;
    const observeFrame = () => {
      if (!current) return;
      playing();
      frame = element.requestVideoFrameCallback(observeFrame);
    };
    frame = element.requestVideoFrameCallback(observeFrame);
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
      element.cancelVideoFrameCallback(frame);
      element.removeEventListener('playing', playing);
      for (const name of ['waiting', 'stalled', 'pause', 'emptied', 'error'])
        element.removeEventListener(name, waiting);
      track.removeEventListener('ended', waiting);
      track.removeEventListener('mute', waiting);
      track.removeEventListener('unmute', playing);
      element.srcObject = null;
      // Unmount only releases the DOM binding. The call still owns the track.
    };
  }, [track, onPlaying, local]);
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

function CameraPlaceholder({ name }: { name?: string | undefined }) {
  if (name)
    return (
      <span className="live-camera-initials">
        {name
          .trim()
          .split(/\s+/)
          .slice(-2)
          .map((word) => word[0])
          .join('')
          .toLocaleUpperCase('vi')}
      </span>
    );
  return (
    <svg className="live-camera-avatar" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="17" r="8" fill="currentColor" />
      <path d="M8 44a16 16 0 0 1 32 0" fill="currentColor" />
    </svg>
  );
}

function CameraTile({
  camera,
  synchronized,
  name,
}: {
  camera: CameraView;
  synchronized: boolean;
  name?: string | undefined;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <article
      className="live-camera-tile min-w-0"
      aria-label={camera.local ? 'Camera của bạn' : 'Camera người tham gia'}
    >
      {camera.track && synchronized && camera.source.publicationState === 'PUBLISHING' ? (
        <div className="live-camera-surface relative">
          <CameraVideo
            track={camera.track}
            onPlaying={setPlaying}
            visible={playing && (!camera.local || camera.track.enabled)}
            local={camera.local}
          />
          {!playing && (
            <span
              className="live-camera-placeholder absolute inset-0 grid place-items-center"
              aria-hidden="true"
            >
              <CameraPlaceholder name={name} />
            </span>
          )}
        </div>
      ) : (
        <div
          className="live-camera-surface live-camera-placeholder grid aspect-video place-items-center"
          aria-hidden="true"
        >
          <CameraPlaceholder name={name} />
        </div>
      )}
      <p className="live-camera-status" role="status">
        {cameraStatus(camera, synchronized, playing)}
      </p>
      <p className="live-camera-name">{camera.local ? 'Bạn' : (name ?? 'Người tham gia')}</p>
    </article>
  );
}

export function CameraTiles({
  snapshot,
  layout = 'grid',
  participantNames,
}: {
  snapshot: CameraSnapshot;
  layout?: 'grid' | 'rail';
  participantNames?: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <section
      aria-label="Camera cuộc gọi"
      className={layout === 'rail' ? 'live-camera-rail' : 'live-camera-grid'}
      data-columns={snapshot.cameras.length <= 1 ? 1 : snapshot.cameras.length <= 4 ? 2 : 3}
      data-camera-count={snapshot.cameras.length}
    >
      {snapshot.cameras.length === 0 ? (
        <p>Chưa có camera khả dụng.</p>
      ) : (
        snapshot.cameras.map((camera) => (
          <CameraTile
            key={`${camera.source.sourceId}:${camera.source.sourceGeneration}:${camera.source.sourceRevision}:${camera.track?.id ?? 'waiting'}`}
            camera={camera}
            synchronized={snapshot.synchronized}
            name={participantNames?.[camera.source.ownerParticipantId]}
          />
        ))
      )}
    </section>
  );
}

function MeetingTile({
  name,
  local,
  track,
  pinned,
  onPin,
}: {
  name: string;
  local: boolean;
  track: MediaStreamTrack | undefined;
  pinned: boolean;
  onPin: (() => void) | undefined;
}) {
  const [playing, setPlaying] = useState(false);
  const videoVisible = Boolean(track && playing && (!local || track.enabled));
  return (
    <article
      className="meeting-tile"
      data-local={local}
      data-pinned={pinned}
      data-video={videoVisible}
    >
      {track && (
        <CameraVideo track={track} onPlaying={setPlaying} visible={videoVisible} local={local} />
      )}
      {!videoVisible && (
        <div className="meeting-avatar" aria-hidden="true">
          <CameraPlaceholder name={name} />
        </div>
      )}
      <div className="meeting-tile-label">
        <strong>{name}</strong>
        {local && <span>Bạn</span>}
        {!videoVisible && <small>{track ? 'Đang chờ hình ảnh' : 'Camera tắt'}</small>}
      </div>
      {onPin && (
        <button
          className="meeting-icon meeting-pin"
          type="button"
          aria-pressed={pinned}
          title={pinned ? 'Bỏ ghim' : 'Ghim ô'}
          aria-label={(pinned ? 'Bỏ ghim ' : 'Ghim ') + name}
          onClick={onPin}
        >
          <WorkspaceIcon name="pin" />
        </button>
      )}
    </article>
  );
}

export function MeetingTiles({
  snapshot,
  participantNames,
  localParticipantId,
  shared,
}: {
  snapshot: CameraSnapshot;
  participantNames: Readonly<Record<string, string>> | undefined;
  localParticipantId: string | undefined;
  shared: boolean;
}) {
  const [pinned, setPinned] = useState<string>();
  const roster = Object.entries(participantNames ?? {});
  const hasPin = !shared && roster.some(([id]) => id === pinned);
  return (
    <section
      aria-label="Hình ảnh người tham gia"
      className="meeting-tiles"
      data-count={roster.length}
      data-share={shared}
      data-has-pin={hasPin}
    >
      {roster.length === 0 && <p role="status">Đang đồng bộ người tham gia…</p>}
      {roster.map(([id, name]) => {
        const camera =
          snapshot.synchronized &&
          snapshot.cameras.find(
            ({ source }) =>
              source.ownerParticipantId === id && source.publicationState === 'PUBLISHING',
          );
        const track = camera ? camera.track : undefined;
        return (
          <MeetingTile
            key={id + ':' + (track?.id ?? 'off')}
            name={name}
            local={id === localParticipantId}
            track={track}
            pinned={hasPin && id === pinned}
            onPin={
              !shared && roster.length > 1
                ? () => setPinned(id === pinned ? undefined : id)
                : undefined
            }
          />
        );
      })}
    </section>
  );
}
