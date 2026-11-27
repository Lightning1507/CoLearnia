import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DeviceKind, PreviewStatus } from './lobbyPreview';
import { useLobbyPreview } from './useLobbyPreview';
import { LobbyMicMeter } from './LobbyMicMeter';
import { useTransientNotice } from '../../../app/useTransientNotice';

const buttonClass = 'lobby-button';

const deviceControls = [
  { kind: 'microphone', name: 'Microphone' },
  { kind: 'camera', name: 'Camera' },
] as const;

const deviceStatusLabel: Record<PreviewStatus, string> = {
  off: 'Đang tắt',
  requesting: 'Đang mở',
  ready: 'Đang bật',
  denied: 'Chưa có quyền',
  unavailable: 'Không khả dụng',
  busy: 'Không mở được',
  error: 'Có lỗi',
};

function DeviceIcon({ kind, off = false }: { kind: DeviceKind; off?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'camera' ? (
        <>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3" />
        </>
      ) : (
        <>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-3 0h6" />
        </>
      )}
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export type LobbyDevicePreferences = {
  camera: { enabled: boolean; deviceId: string };
  microphone: { enabled: boolean; deviceId: string };
};

export type LobbyDeviceCheckProps = {
  channelName: string;
  notice?: string;
  /** Close the lobby or navigate away after its preview has been released. */
  onBack: () => void;
  /** Supply only from the authorized join flow. This callback does not imply join success. */
  onContinue?: (preferences: LobbyDevicePreferences) => void;
  continuePending?: boolean;
  transfer?: boolean;
};

function CameraPreview({
  stream,
  videoRef,
}: {
  stream: MediaStream;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [playbackError, setPlaybackError] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    video.srcObject = stream;
    void video.play().catch(() => {
      if (active && video.srcObject === stream) setPlaybackError(true);
    });
    return () => {
      active = false;
      video.srcObject = null;
    };
  }, [stream, videoRef]);
  return (
    <>
      <video
        className="absolute inset-0 h-full w-full object-cover"
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Camera xem trước của bạn"
      />
      {playbackError && (
        <button
          className={`${buttonClass} absolute bottom-20 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2`}
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (video?.srcObject !== stream) return;
            void video.play().then(
              () => {
                if (video.srcObject === stream) setPlaybackError(false);
              },
              () => {
                if (video.srcObject === stream) setPlaybackError(true);
              },
            );
          }}
        >
          Phát hình xem trước
        </button>
      )}
    </>
  );
}

export function LobbyDeviceCheck({
  channelName,
  notice,
  onBack,
  onContinue,
  continuePending = false,
  transfer = false,
}: LobbyDeviceCheckProps) {
  const { state, preview } = useLobbyPreview();
  const videoRef = useRef<HTMLVideoElement>(null);
  const id = useId();
  const lobbyNotice = useTransientNotice(notice);
  const enumerationError = useTransientNotice(state.enumerationError);
  const cameraNotice = useTransientNotice(
    ['off', 'ready', 'requesting'].includes(state.camera.status) ? undefined : state.camera.message,
  );
  const micNotice = useTransientNotice(
    ['off', 'ready', 'requesting'].includes(state.microphone.status)
      ? undefined
      : state.microphone.message,
  );
  const deviceControlsDisabled = !!state.environmentError || continuePending;
  const deviceRequestPending =
    state.camera.status === 'requesting' || state.microphone.status === 'requesting';
  const continueToSession = () => {
    // Read the runtime too: a request may start before React renders the disabled button.
    const current = preview.getSnapshot();
    if (
      continuePending ||
      current.camera.status === 'requesting' ||
      current.microphone.status === 'requesting'
    )
      return;
    const preferences: LobbyDevicePreferences = {
      camera: {
        enabled: current.camera.isActive,
        deviceId: current.camera.selectedId,
      },
      microphone: {
        enabled: current.microphone.isActive,
        deviceId: current.microphone.selectedId,
      },
    };
    // No transfer of tracks: the join/controller owner must acquire its own resources.
    preview.stop('camera');
    preview.stop('microphone');
    onContinue?.(preferences);
  };
  const back = () => {
    if (!preview.dispose()) return;
    if (videoRef.current) videoRef.current.srcObject = null;
    onBack();
  };

  return (
    <section className="live-lobby prejoin-v11" aria-labelledby={`${id}-title`}>
      <header className="live-lobby-header">
        <button className="lobby-back" type="button" onClick={back}>
          <span aria-hidden="true">←</span> Quay lại Phòng học
        </button>
        <strong>CoLearnia</strong>
      </header>
      <div className="live-lobby-main">
        <div className="lobby-preview-column">
          <section className="lobby-preview" aria-label="Xem trước camera, chỉ trên máy này">
            {state.videoStream ? (
              <CameraPreview
                key={state.videoStream.id}
                stream={state.videoStream}
                videoRef={videoRef}
              />
            ) : (
              <div className="lobby-placeholder">
                <span className="lobby-placeholder-icon">
                  <DeviceIcon kind="camera" off />
                </span>
                <strong>Sẵn sàng kiểm tra thiết bị?</strong>
                <span>Bật camera để xem hình của bạn.</span>
              </div>
            )}
            <div className="lobby-preview-caption">
              <strong>Hình xem trước của bạn</strong>
              <span>Camera {deviceStatusLabel[state.camera.status].toLowerCase()}</span>
            </div>
          </section>
          <div className="lobby-preview-controls" role="group" aria-label="Bật hoặc tắt thiết bị">
            {deviceControls.map(({ kind, name }) => {
              const { status, isActive: enabled } = state[kind];
              const requesting = status === 'requesting';
              const action = enabled ? 'Tắt' : requesting ? 'Hủy mở' : 'Bật';
              return (
                <button
                  key={kind}
                  className="lobby-device-toggle"
                  type="button"
                  aria-label={`${action} ${name.toLowerCase()}`}
                  aria-pressed={enabled}
                  aria-describedby={`${id}-${kind}-status`}
                  disabled={deviceControlsDisabled}
                  title={`${action} ${name.toLowerCase()}`}
                  onClick={() =>
                    enabled || requesting ? preview.stop(kind) : void preview.open(kind)
                  }
                >
                  <DeviceIcon kind={kind} off={!enabled} />
                  <span>{kind === 'microphone' ? 'Micro' : name}</span>
                </button>
              );
            })}
          </div>
          <LobbyMicMeter stream={state.audioStream} />
        </div>
        <section className="lobby-settings" aria-labelledby={`${id}-title`}>
          <p className="lobby-channel">Phòng trực tiếp</p>
          <h1 id={`${id}-title`}>
            {transfer ? 'Chuyển cuộc gọi sang thiết bị này?' : 'Sẵn sàng tham gia?'}
          </h1>
          <p className="lobby-description">
            {transfer
              ? 'Cuộc gọi đang mở trên tab hoặc thiết bị khác. Khi chuyển, kết nối cũ sẽ ngắt và bạn tiếp tục cuộc gọi tại đây. Mic và camera bật theo lựa chọn của bạn.'
              : 'Kiểm tra thiết bị trước khi vào phòng. Chỉ bật camera hoặc micro khi bạn muốn.'}
          </p>
          {lobbyNotice && (
            <p className="lobby-device-message" role="status">
              {lobbyNotice}
            </p>
          )}
          {state.environmentError && (
            <p className="lobby-error" role="alert">
              {state.environmentError}
            </p>
          )}
          {deviceControls.map(({ kind, name }) => {
            const device = state[kind];
            const feedback = kind === 'camera' ? cameraNotice : micNotice;
            const showMessage = device.status === 'requesting' || Boolean(feedback);
            return (
              <div className="lobby-device-field" key={kind}>
                <label htmlFor={`${id}-${kind}`}>{kind === 'microphone' ? 'Micro' : name}</label>
                <select
                  id={`${id}-${kind}`}
                  value={device.selectedId}
                  disabled={deviceControlsDisabled}
                  aria-describedby={`${id}-${kind}-status`}
                  onChange={(event) => preview.select(kind, event.target.value)}
                >
                  <option value="">Mặc định của trình duyệt</option>
                  {device.devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p
                  className={showMessage ? 'lobby-device-message' : 'sr-only'}
                  id={`${id}-${kind}-status`}
                  role="status"
                >
                  {device.status === 'requesting' && device.isActive
                    ? 'Đang đổi thiết bị…'
                    : showMessage
                      ? (feedback ?? device.message)
                      : ''}
                </p>
              </div>
            );
          })}
          <div className="lobby-device-state">
            {deviceControls.map(({ kind }) => (
              <span key={kind} data-state={state[kind].status}>
                <DeviceIcon kind={kind} off={!state[kind].isActive} />
                {kind === 'camera' ? 'Camera' : 'Mic'}{' '}
                {deviceStatusLabel[state[kind].status].toLowerCase()}
              </span>
            ))}
          </div>
          <button
            className="lobby-refresh"
            type="button"
            aria-busy={state.enumerating}
            disabled={!!state.environmentError || state.enumerating || continuePending}
            onClick={() => void preview.refreshDevices()}
          >
            {state.enumerating ? 'Đang làm mới…' : 'Làm mới thiết bị'}
          </button>
          {enumerationError && (
            <p className="lobby-device-message" role="status">
              {enumerationError}
            </p>
          )}
          {onContinue && (
            <>
              <p id={`${id}-continue-status`} className="lobby-entry-hint" role="status">
                {deviceRequestPending
                  ? 'Đang mở hoặc đổi thiết bị. Hãy chờ hoàn tất hoặc tắt thiết bị để tiếp tục.'
                  : 'Bạn có thể tham gia khi mic và camera đang tắt.'}
              </p>
              <button
                className="lobby-join"
                type="button"
                onClick={continueToSession}
                disabled={continuePending || deviceRequestPending}
                aria-describedby={`${id}-continue-status`}
              >
                {continuePending
                  ? 'Đang vào phòng…'
                  : transfer
                    ? 'Chuyển qua thiết bị này'
                    : 'Tham gia cuộc họp'}
              </button>
            </>
          )}
          <dl className="lobby-entry-details">
            <dt>Phòng</dt>
            <dd>{channelName}</dd>
          </dl>
        </section>
      </div>
    </section>
  );
}
