import { useEffect, useId, useRef, useState } from 'react';
import type { DeviceKind } from './lobby-preview';
import { useLobbyPreview } from './useLobbyPreview';
import './lobby.css';

const controlClass =
  'min-h-11 max-w-full rounded-lg border border-[#d5dfc7] px-3 py-2 font-[inherit] disabled:cursor-not-allowed!';
const buttonClass = `${controlClass} bg-[#edf2dd] text-[#193e35]`;

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
      <video
        className="h-full w-full object-cover"
        ref={ref}
        autoPlay
        playsInline
        muted
        aria-label="Camera xem trước của bạn"
      />
      {playbackError && (
        <button
          className={`${buttonClass} absolute bottom-5`}
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
    <section
      className="lobby-device-check min-h-dvh bg-[#f7f8f2] leading-[1.6] text-[#193e35]"
      aria-labelledby={`${id}-title`}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce3d6] bg-white px-6 py-4">
        <button className={buttonClass} type="button" onClick={back} disabled={continuePending}>
          ← Quay lại Phòng học
        </button>
        <strong>CoLearnia</strong>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-6 px-4 py-6 min-[801px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[801px]:gap-12 min-[801px]:px-6 min-[801px]:py-12">
        <div
          className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-2xl bg-[#222927] text-[#eff4df]"
          aria-label="Khu vực xem trước camera"
        >
          {state.videoStream ? (
            <CameraPreview key={state.videoStream.id} stream={state.videoStream} />
          ) : (
            <div className="p-6 text-center">
              <span className="block text-[40px]" aria-hidden="true">
                ◉
              </span>
              <strong>
                {state.camera.status === 'requesting' ? 'Đang mở camera…' : 'Camera chưa bật'}
              </strong>
              <p className="text-sm">Hình ảnh chỉ xuất hiện sau khi camera mở thành công.</p>
            </div>
          )}
        </div>
        <div className="min-w-0 wrap-anywhere">
          <p className="text-xs font-bold text-[#63756b]">{channelName}</p>
          <h1 className="mt-2! mb-4! text-[30px]! tracking-[-0.8px]!" id={`${id}-title`}>
            Sẵn sàng tham gia?
          </h1>
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
              <fieldset
                className="my-5 rounded-xl border border-[#dce3d6] p-4 text-sm"
                key={kind}
                disabled={!!state.environmentError || continuePending}
              >
                <legend className="px-1.5 font-bold text-base">{name}</legend>
                <label className="mb-1.5 block text-base" htmlFor={`${id}-${kind}`}>
                  Chọn {name.toLowerCase()}
                </label>
                <select
                  className={`${controlClass} w-full bg-white text-base`}
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
                  className={`${buttonClass} text-base`}
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
            className={buttonClass}
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
                className={`${controlClass} w-full bg-[#173f35] text-[#eff4df]`}
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
