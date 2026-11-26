import { useId, useSyncExternalStore } from 'react';
import type { DeviceMedia } from '../runtime/deviceMedia';
import type { DeviceKind } from '../lobby/lobbyPreview';

const labels = { microphone: 'mic', camera: 'camera' };

function DeviceIcon({ kind, muted }: { kind: DeviceKind; muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'microphone' ? (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
        </>
      ) : (
        <>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3" />
        </>
      )}
      {muted && <path d="M3 3l18 18" />}
    </svg>
  );
}

function DeviceControl({
  devices,
  kind,
  compact,
}: {
  devices: DeviceMedia;
  kind: DeviceKind;
  compact: boolean;
}) {
  const snapshot = useSyncExternalStore(
    devices.subscribe,
    devices.getSnapshot,
    devices.getSnapshot,
  );
  const { phase, error } = snapshot[kind];
  const helpId = useId();
  const canStop = phase === 'on' || phase === 'starting';
  const disabled =
    phase === 'stopping' || ((!snapshot.available || !devices.isAllowed(kind)) && !canStop);
  const label = labels[kind];
  const action = phase === 'starting' ? 'Hủy bật' : canStop ? 'Tắt' : 'Bật';
  const statusLabel = kind === 'microphone' ? 'Mic' : 'Camera';
  const help =
    error ??
    (phase === 'starting'
      ? 'Đang mở thiết bị. Bạn có thể hủy.'
      : phase === 'stopping'
        ? 'Đang đóng nguồn phát.'
        : !snapshot.available
          ? 'Thiết bị chỉ bật được khi cuộc gọi cho phép.'
          : '');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="live-toolbar-control inline-flex min-h-11 min-w-12 items-center justify-center gap-2 rounded-lg px-3 text-sm"
        aria-label={action + ' ' + label}
        title={action + ' ' + label}
        aria-pressed={phase === 'on'}
        aria-disabled={disabled}
        aria-describedby={help ? helpId : undefined}
        data-state={phase === 'off' ? 'off' : undefined}
        onClick={() => {
          if (disabled) return;
          if (canStop) void devices.stop(kind);
          else void devices.start(kind);
        }}
      >
        <DeviceIcon kind={kind} muted={compact && phase === 'off'} />
        <span className={compact ? 'sr-only' : undefined}>
          {statusLabel} {phase === 'on' ? 'bật' : phase === 'starting' ? 'đang bật' : 'tắt'}
        </span>
      </button>
      <span
        id={helpId}
        role="status"
        className={compact && !error ? 'sr-only' : 'text-sm empty:sr-only'}
      >
        {help}
      </span>
    </div>
  );
}

export function DeviceMediaControls({
  devices,
  compact = false,
}: {
  devices: DeviceMedia;
  compact?: boolean;
}) {
  return (
    <>
      <DeviceControl devices={devices} kind="microphone" compact={compact} />
      <DeviceControl devices={devices} kind="camera" compact={compact} />
    </>
  );
}
