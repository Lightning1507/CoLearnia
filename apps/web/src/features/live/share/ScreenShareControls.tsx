import { useCallback, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ScreenSharePicker } from '../runtime/screenSharePicker';

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
export function ScreenShareControls({ picker }: { picker: ScreenSharePicker }) {
  const primary = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const announcement = useRef<HTMLSpanElement>(null);
  const titleId = useId();
  const descriptionId = useId();
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
  const canReserve = status === 'idle';
  const canChoose = status === 'reserved';
  const choosing = status === 'choosing';
  useLayoutEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    if (canChoose || choosing) {
      if (!modal.open) modal.showModal();
      return;
    }
    if (modal.open) {
      modal.close();
      restoreFocus.current = true;
    }
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    (canReserve ? primary.current : announcement.current)?.focus();
  }, [canChoose, canReserve, choosing, status]);

  return (
    <div className="contents">
      {status !== 'hidden' && (
        <button
          ref={triggerRef}
          type="button"
          className="live-toolbar-control inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm"
          aria-label="Chia sẻ màn hình"
          aria-haspopup="dialog"
          aria-disabled={!canReserve}
          aria-describedby={statusId}
          onClick={() => {
            if (canReserve) void picker.reserve();
          }}
        >
          <ScreenIcon className="size-4" />
          Chia sẻ
        </button>
      )}
      <span
        ref={announcement}
        id={statusId}
        role="status"
        tabIndex={-1}
        className={status === 'hidden' && !error ? 'sr-only focus:not-sr-only' : 'empty:sr-only'}
      >
        {error ??
          (status === 'acquiring'
            ? 'Đang giữ chỗ chia sẻ…'
            : status === 'selected'
              ? 'Đã chọn màn hình.'
              : status === 'unavailable'
                ? 'Hiện chưa thể chia sẻ màn hình.'
                : status === 'hidden'
                  ? 'Tính năng chia sẻ màn hình không khả dụng trong nhóm thảo luận.'
                  : '')}
      </span>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          picker.cancel();
        }}
        className="live-dialog m-auto w-[540px] max-w-[calc(100%-2rem)] overflow-auto rounded-[10px] border"
      >
        <header className="flex items-start justify-between gap-4 border-b border-(--cl-color-dialog-divider) px-5 pt-[18px] pb-3.5">
          <div>
            <h2 id={titleId} className="text-[17px] font-bold">
              Chọn màn hình để chia sẻ
            </h2>
            <p id={descriptionId} className="mt-1 text-xs text-(--cl-color-dialog-muted)">
              Bạn đã giữ chỗ chia sẻ. Chỗ này hết hạn sau 30 giây.
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại chia sẻ"
            className="grid size-9 shrink-0 place-items-center rounded-md text-(--cl-color-dialog-muted)"
            onClick={() => picker.cancel()}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-[18px]">
          <div className="flex min-h-[78px] items-center gap-2.5 rounded-lg border border-(--cl-color-share-choice-border) bg-(--cl-color-share-choice-bg) p-3">
            <span className="grid size-[42px] shrink-0 place-items-center rounded-md bg-white text-(--cl-color-share-choice-icon)">
              <ScreenIcon className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Nội dung chia sẻ</p>
              <p className="text-xs text-(--cl-color-dialog-muted)" role="status">
                {choosing
                  ? 'Đang chờ chọn màn hình…'
                  : 'Chọn màn hình hoặc cửa sổ trong trình duyệt.'}
              </p>
            </div>
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-(--cl-color-dialog-divider) bg-(--cl-color-dialog-footer-bg) px-5 py-3">
          <button
            type="button"
            className="min-h-9 rounded-md border border-(--cl-color-dialog-border) bg-white px-3 text-sm"
            onClick={() => picker.cancel()}
          >
            Hủy
          </button>
          <button
            type="button"
            aria-disabled={!canChoose}
            className="min-h-9 rounded-md bg-(--cl-color-action-primary-bg) px-3 text-sm font-semibold text-white aria-disabled:opacity-60"
            onClick={() => {
              if (canChoose) void picker.choose();
            }}
          >
            Bắt đầu chia sẻ
          </button>
        </footer>
      </dialog>
    </div>
  );
}
