import { useCallback, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ScreenSharePicker } from '../runtime/screenSharePicker';
import { useTransientNotice } from '../../../app/useTransientNotice';

function ScreenIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="4" width="19" height="14" rx="2" />
      <path d="M8 22h8M12 18v4M12 14V8M9 11l3-3 3 3" />
    </svg>
  );
}

// Render in the call toolbar with the picker owned by the call, above panel lifetime.
export function ScreenShareControls({
  picker,
  compact = false,
}: {
  picker: ScreenSharePicker;
  compact?: boolean;
}) {
  const primary = useRef<HTMLButtonElement>(null);
  const announcement = useRef<HTMLSpanElement>(null);
  const statusId = useId();
  const restoreFocus = useRef(false);
  const triggerRef = useCallback((button: HTMLButtonElement | null) => {
    primary.current = button;
    if (!button) return;
    return () => {
      if (button.ownerDocument.activeElement === button) restoreFocus.current = true;
      primary.current = null;
    };
  }, []);

  const { status, error } = useSyncExternalStore(
    picker.subscribe,
    picker.getSnapshot,
    picker.getSnapshot,
  );
  const canStart = status === 'idle';
  const sharing = status === 'sharing';
  const publishing = status === 'publishing';
  const retryStop = status === 'stopFailed';
  const timedError = useTransientNotice(retryStop ? undefined : error);
  const feedback = retryStop ? error : timedError;
  const stopping = status === 'stopping';
  const canStop = sharing || publishing || retryStop;
  const choosing = status === 'choosing';
  const action = retryStop
    ? 'Thử dừng lại'
    : stopping
      ? 'Đang dừng…'
      : canStop
        ? 'Dừng share'
        : 'Chia sẻ';
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    (canStart || canStop ? primary.current : announcement.current)?.focus();
  }, [canStart, canStop, status]);

  return (
    <div className="contents">
      {status !== 'hidden' && (
        <button
          ref={triggerRef}
          type="button"
          className="live-toolbar-control inline-flex h-[42px] min-w-12 items-center justify-center gap-1.5 rounded-lg px-[11px] text-[9px]"
          data-state={sharing ? 'active' : undefined}
          aria-pressed={sharing}
          title={canStop ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          aria-label={
            retryStop
              ? 'Thử dừng chia sẻ màn hình lại'
              : stopping
                ? 'Đang dừng chia sẻ màn hình'
                : canStop
                  ? 'Dừng chia sẻ màn hình'
                  : 'Chia sẻ màn hình'
          }
          aria-disabled={!canStart && !canStop}
          aria-describedby={statusId}
          onClick={() => {
            if (canStop) picker.cancel();
            else if (canStart) void picker.start();
          }}
        >
          <ScreenIcon className="size-4" />
          <span className={compact ? 'sr-only' : undefined}>{action}</span>
        </button>
      )}
      <span
        ref={announcement}
        id={statusId}
        role="status"
        tabIndex={-1}
        className={status === 'hidden' && !feedback ? 'sr-only focus:not-sr-only' : 'empty:sr-only'}
      >
        {feedback ??
          (choosing
            ? 'Chọn nội dung chia sẻ trong hộp thoại của trình duyệt.'
            : status === 'acquiring'
              ? 'Đang giữ chỗ chia sẻ…'
              : publishing
                ? 'Đang bắt đầu chia sẻ…'
                : stopping
                  ? 'Đang xác nhận dừng chia sẻ…'
                  : status === 'unavailable'
                    ? 'Hiện chưa thể chia sẻ màn hình.'
                    : status === 'hidden'
                      ? 'Tính năng chia sẻ màn hình không khả dụng trong nhóm thảo luận.'
                      : '')}
      </span>
    </div>
  );
}
