import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DeviceKind, PreviewStatus } from './lobbyPreview';
import { useLobbyPreview } from './useLobbyPreview';

const focusClass =
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus-ring focus-visible:ring-3 focus-visible:ring-surface';
const controlClass = `min-h-11 min-w-0 rounded-lg border px-3 py-2 text-sm leading-[1.4] disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`;
const buttonClass = `${controlClass} border-border-control bg-surface-subtle font-semibold text-text-primary enabled:hover:bg-action-accent`;
const ghostButtonClass = `${controlClass} border-transparent bg-transparent font-semibold text-text-primary enabled:hover:bg-action-accent`;
const primaryButtonClass = `${controlClass} border-action-primary bg-action-primary font-semibold text-surface enabled:hover:bg-action-primary-hover`;

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

const deviceStatusClass: Record<PreviewStatus, string> = {
  off: 'bg-canvas text-text-secondary',
  requesting: 'bg-surface-subtle text-text-primary',
  ready: 'bg-surface-subtle text-text-primary',
  denied: 'bg-feedback-warning-surface text-feedback-warning',
  unavailable: 'bg-feedback-warning-surface text-feedback-warning',
  busy: 'bg-feedback-warning-surface text-feedback-warning',
  error: 'bg-feedback-error-surface text-feedback-error',
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
      {off && (
        <>
          <path d="M3 3l18 18" className="stroke-feedback-error-surface" strokeWidth="4" />
          <path d="M3 3l18 18" />
        </>
      )}
    </svg>
  );
}

export type LobbyDevicePreferences = {
  camera: { enabled: boolean; deviceId: string };
  microphone: { enabled: boolean; deviceId: string };
};

export type LobbyDeviceCheckProps = {
  channelName: string;
  /** Close the lobby or navigate away after its preview has been released. */
  onBack: () => void;
  /** Supply only from the authorized join flow. This callback does not imply join success. */
  onContinue?: (preferences: LobbyDevicePreferences) => void;
  continuePending?: boolean;
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
  onBack,
  onContinue,
  continuePending = false,
}: LobbyDeviceCheckProps) {
  const { state, preview } = useLobbyPreview();
  const videoRef = useRef<HTMLVideoElement>(null);
  const id = useId();
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
    <section
      className="flex min-h-dvh flex-col bg-canvas leading-normal text-text-primary"
      aria-labelledby={`${id}-title`}
    >
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4 sm:px-6 lg:px-8">
          <button
            className={`${ghostButtonClass} justify-self-start sm:col-start-1 sm:row-start-1`}
            type="button"
            onClick={back}
            disabled={continuePending}
          >
            <span aria-hidden="true">←</span> Quay lại Phòng học
          </button>
          <div className="brand row-start-1 justify-self-center sm:col-start-2">
            <span className="brand-mark" aria-hidden="true">
              C
            </span>
            <span>CoLearnia</span>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 content-center px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-center lg:gap-12 xl:gap-16">
          <section
            className="min-w-0 rounded-2xl border border-border-subtle bg-surface"
            aria-labelledby={`${id}-preview-title`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 font-semibold" id={`${id}-preview-title`}>
                <DeviceIcon kind="camera" /> Xem trước camera
              </h2>
              <span className="rounded-full bg-canvas px-2 py-1 text-xs font-semibold text-text-secondary">
                Chỉ trên máy này
              </span>
            </div>
            <div className="relative isolate flex aspect-[16/10] min-h-72 w-full flex-col overflow-hidden rounded-b-[calc(1rem-1px)] bg-preview-surface text-surface">
              <div className="grid flex-1 place-items-center">
                {state.videoStream ? (
                  <CameraPreview
                    key={state.videoStream.id}
                    stream={state.videoStream}
                    videoRef={videoRef}
                  />
                ) : (
                  <div className="grid justify-items-center gap-2 p-4 text-center sm:p-6">
                    <span className="mb-1 grid size-11 place-items-center rounded-xl bg-action-accent text-text-primary">
                      <DeviceIcon kind="camera" />
                    </span>
                    <strong>
                      {state.camera.status === 'requesting' ? 'Đang mở camera…' : 'Camera chưa bật'}
                    </strong>
                    <p className="text-sm">Hình ảnh sẽ xuất hiện khi camera mở thành công.</p>
                  </div>
                )}
              </div>
              <div
                className="relative z-10 flex flex-wrap justify-center gap-2 px-3 pb-4"
                role="group"
                aria-label="Bật hoặc tắt thiết bị"
              >
                {deviceControls.map(({ kind, name }) => {
                  const { status, isActive: enabled } = state[kind];
                  const requesting = status === 'requesting';
                  const action = enabled ? 'Tắt' : requesting ? 'Hủy mở' : 'Bật';
                  return (
                    <button
                      key={kind}
                      className={`grid size-11 place-items-center rounded-full bg-feedback-error-surface text-feedback-error shadow-md enabled:hover:brightness-95 aria-pressed:bg-action-accent aria-pressed:text-text-primary disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`}
                      type="button"
                      aria-label={`${action} ${name.toLowerCase()}`}
                      aria-pressed={enabled}
                      aria-describedby={`${id}-${kind}-status`}
                      disabled={deviceControlsDisabled}
                      onClick={() =>
                        enabled || requesting ? preview.stop(kind) : void preview.open(kind)
                      }
                    >
                      <DeviceIcon kind={kind} off={!enabled} />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
          <div className="grid min-w-0 gap-4">
            <div className="grid gap-2 wrap-anywhere">
              <p className="text-xs font-semibold text-text-secondary">{channelName}</p>
              <h1
                className="m-0 text-2xl leading-[1.3] font-bold tracking-[-0.02em]"
                id={`${id}-title`}
              >
                Sẵn sàng tham gia?
              </h1>
              <p className="text-sm text-text-secondary">
                Kiểm tra camera và microphone trước khi vào phòng. Chỉ bật thiết bị khi bạn muốn.
              </p>
            </div>
            <section
              className="grid min-w-0 gap-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5"
              aria-labelledby={`${id}-devices-title`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold" id={`${id}-devices-title`}>
                  Thiết bị
                </h2>
                <button
                  className={ghostButtonClass}
                  type="button"
                  disabled={!!state.environmentError || state.enumerating || continuePending}
                  onClick={() => void preview.refreshDevices()}
                >
                  Làm mới thiết bị
                </button>
              </div>
              {state.environmentError && (
                <p
                  className="rounded-lg bg-feedback-error-surface p-3 text-sm text-feedback-error"
                  role="alert"
                >
                  {state.environmentError}
                </p>
              )}
              <p
                className={
                  state.enumerating || state.enumerationError
                    ? 'text-sm text-text-secondary'
                    : 'sr-only'
                }
                role="status"
              >
                {state.enumerating ? 'Đang đọc danh sách thiết bị…' : state.enumerationError}
              </p>
              {deviceControls.map(({ kind, name }) => {
                const device = state[kind];
                return (
                  <fieldset
                    className="min-w-0 rounded-lg border border-border-subtle px-3 pb-3 sm:px-4 sm:pb-4"
                    key={kind}
                    disabled={deviceControlsDisabled}
                  >
                    <legend className="px-1 text-sm font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <DeviceIcon kind={kind} />
                        {name}
                      </span>
                    </legend>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <label
                        className="text-sm font-medium text-text-secondary"
                        htmlFor={`${id}-${kind}`}
                      >
                        Chọn {name.toLowerCase()}
                      </label>
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${deviceStatusClass[device.status]}`}
                        aria-hidden="true"
                      >
                        {device.status === 'requesting' && device.isActive
                          ? 'Đang đổi thiết bị'
                          : deviceStatusLabel[device.status]}
                      </span>
                    </div>
                    <select
                      className={`${controlClass} mt-2 w-full border-border-control bg-surface`}
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
                    <p
                      className="mt-2 text-sm text-text-secondary"
                      id={`${id}-${kind}-status`}
                      role="status"
                    >
                      {device.message}
                    </p>
                    {!device.devices.length && !state.enumerating && (
                      <p className="mt-1 text-sm text-text-secondary">
                        Chưa có thiết bị được liệt kê. Bấm Bật để kiểm tra thiết bị mặc định và
                        quyền truy cập.
                      </p>
                    )}
                  </fieldset>
                );
              })}
              {onContinue && (
                <>
                  <p className="text-sm text-text-secondary">
                    Bạn vẫn có thể tiếp tục để xem nội dung mà không bật camera hoặc microphone.
                  </p>
                  <p
                    id={`${id}-continue-status`}
                    className="text-sm text-text-secondary"
                    role="status"
                  >
                    {deviceRequestPending
                      ? 'Đang mở hoặc đổi thiết bị. Hãy chờ hoàn tất hoặc tắt thiết bị để tiếp tục.'
                      : ''}
                  </p>
                  <button
                    className={`${primaryButtonClass} w-full`}
                    type="button"
                    onClick={continueToSession}
                    disabled={continuePending || deviceRequestPending}
                    aria-describedby={`${id}-continue-status`}
                  >
                    {continuePending ? 'Đang tiếp tục…' : 'Tiếp tục vào phiên'}
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
