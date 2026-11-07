import { useEffect, useId, useRef, useState } from 'react';
import type { DeviceKind } from './lobby-preview';
import { useLobbyPreview } from './use-lobby-preview';
import './lobby.css';

export type LobbyDevicePreferences = {
  camera: { enabled: boolean; deviceId: string };
  microphone: { enabled: boolean; deviceId: string };
};

export type LobbyDeviceCheckProps = {
  channelName: string;
  onBack: () => void;
  /** Supply only from the authorized join flow. This callback does not imply join success. */
  onContinue?: (preferences: LobbyDevicePreferences) => void;
  continuePending?: boolean;
};

function CameraPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playbackError, setPlaybackError] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true;
    video.srcObject = stream;
    void video.play().catch(() => {
      if (active) setPlaybackError(true);
    });
    return () => {
      active = false;
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <video ref={ref} autoPlay playsInline muted aria-label="Camera xem trước của bạn" />
      {playbackError && (
        <button
          className="lobby-play"
          type="button"
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setPlaybackError(false))
              .catch(() => setPlaybackError(true));
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
  onBack,
  onContinue,
  continuePending = false,
}: LobbyDeviceCheckProps) {
  const { state, preview } = useLobbyPreview();
  const id = useId();
  const continueToSession = () => {
    const preferences: LobbyDevicePreferences = {
      camera: {
        enabled: state.camera.status === 'ready',
        deviceId: state.camera.openedId ?? state.camera.selectedId,
      },
      microphone: {
        enabled: state.microphone.status === 'ready',
        deviceId: state.microphone.openedId ?? state.microphone.selectedId,
      },
    };
    // No transfer of tracks: the join/controller owner must acquire its own resources.
    preview.stop('camera');
    preview.stop('microphone');
    onContinue?.(preferences);
  };
  const back = () => {
    preview.dispose();
    onBack();
  };

  return (
    <section className="lobby-device-check" aria-labelledby={`${id}-title`}>
      <header className="lobby-header">
        <button type="button" onClick={back} disabled={continuePending}>
          ← Quay lại Phòng học
        </button>
        <strong>CoLearnia</strong>
      </header>
      <div className="lobby-main">
        <div className="lobby-preview" aria-label="Khu vực xem trước camera">
          {state.videoStream ? (
            <CameraPreview key={state.videoStream.id} stream={state.videoStream} />
          ) : (
            <div className="lobby-placeholder">
              <span aria-hidden="true">◉</span>
              <strong>
                {state.camera.status === 'requesting' ? 'Đang mở camera…' : 'Camera chưa bật'}
              </strong>
              <p>Hình ảnh chỉ xuất hiện sau khi camera mở thành công.</p>
            </div>
          )}
        </div>
        <div className="lobby-settings">
          <p className="lobby-eyebrow">{channelName}</p>
          <h1 id={`${id}-title`}>Sẵn sàng tham gia?</h1>
          <p>Kiểm tra camera và microphone trước khi vào phòng. Chỉ bật thiết bị khi bạn muốn.</p>
          {state.environmentError && <p role="alert">{state.environmentError}</p>}
          <p role="status">
            {state.enumerating ? 'Đang đọc danh sách thiết bị…' : state.enumerationError}
          </p>
          {(['microphone', 'camera'] as const).map((kind: DeviceKind) => {
            const device = state[kind];
            const name = kind === 'camera' ? 'Camera' : 'Microphone';
            const running = device.status === 'ready' || device.status === 'requesting';
            return (
              <fieldset key={kind} disabled={!!state.environmentError || continuePending}>
                <legend>{name}</legend>
                <label htmlFor={`${id}-${kind}`}>Chọn {name.toLowerCase()}</label>
                <select
                  id={`${id}-${kind}`}
                  value={device.selectedId}
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
                <p id={`${id}-${kind}-status`} role="status">
                  {device.message}
                </p>
                {!device.devices.length && !state.enumerating && (
                  <p>
                    Chưa có thiết bị được liệt kê. Bấm Bật để kiểm tra thiết bị mặc định và quyền
                    truy cập.
                  </p>
                )}
                <button
                  type="button"
                  aria-pressed={device.status === 'ready'}
                  onClick={() => (running ? preview.stop(kind) : void preview.open(kind))}
                >
                  {running ? (device.status === 'requesting' ? 'Hủy mở' : 'Tắt') : 'Bật / thử lại'}{' '}
                  {name.toLowerCase()}
                </button>
              </fieldset>
            );
          })}
          <button
            type="button"
            disabled={!!state.environmentError || state.enumerating || continuePending}
            onClick={() => void preview.refreshDevices()}
          >
            Làm mới thiết bị
          </button>
          {onContinue && (
            <>
              <p>Bạn vẫn có thể tiếp tục để xem nội dung mà không bật camera hoặc microphone.</p>
              <button
                className="lobby-continue"
                type="button"
                onClick={continueToSession}
                disabled={continuePending}
              >
                {continuePending ? 'Đang tiếp tục…' : 'Tiếp tục vào phiên'}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
