import { useState, type RefObject } from 'react';
import type { ChannelSummary, TextHistoryMessage } from '@colearnia/contracts';
import { WorkspaceIcon } from './WorkspaceIcon';

export function WorkspaceSearch({
  dialog,
  channels,
  messages,
  onSelect,
  onClose,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  channels: readonly ChannelSummary[];
  messages: readonly TextHistoryMessage[];
  onSelect: (channel: ChannelSummary) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const term = query.trim().toLocaleLowerCase('vi');
  const results = [
    ...channels
      .filter((channel) => channel.name.toLocaleLowerCase('vi').includes(term))
      .map((channel) => ({
        key: channel.id,
        label: channel.name,
        kind: channel.type === 'TEXT' ? 'Kênh chữ' : 'Họp trực tiếp',
        channel,
      })),
    ...(term
      ? messages
          .filter((message) => message.text.toLocaleLowerCase('vi').includes(term))
          .map((message) => ({
            key: message.id,
            label: message.text,
            kind: 'Tin nhắn',
            channel: undefined,
          }))
      : []),
  ].slice(0, 24);
  const selected = Math.min(index, results.length - 1);
  function choose(result: (typeof results)[number]) {
    dialog.current?.close();
    if (result.channel) onSelect(result.channel);
    else
      requestAnimationFrame(() => {
        const row = document.getElementById(`workspace-message-${result.key}`);
        row?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: 'center' });
      });
  }
  return (
    <dialog
      ref={dialog}
      className="ws-dialog ws-search"
      aria-label="Tìm tin nhắn và kênh"
      onClose={() => {
        setQuery('');
        setIndex(0);
        onClose();
      }}
    >
      <div className="ws-dialog-heading">
        <h2>Tìm kiếm</h2>
        <button
          className="ws-icon-button"
          type="button"
          aria-label="Đóng tìm kiếm"
          onClick={() => dialog.current?.close()}
        >
          <WorkspaceIcon name="close" />
        </button>
      </div>
      <p className="ws-muted">Kênh có quyền xem và tin đã tải trong kênh đang mở.</p>
      <input
        autoFocus
        type="search"
        value={query}
        aria-label="Nhập từ khóa"
        placeholder="Tìm kênh hoặc tin nhắn…"
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (results.length === 0) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next =
              (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
            setIndex(next);
            dialog.current?.querySelectorAll('.ws-search-result').item(next)?.scrollIntoView({
              block: 'nearest',
            });
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            const result = results[selected];
            if (result) choose(result);
          }
        }}
      />
      {results.length ? (
        <ul className="ws-search-results">
          {results.map((result, row) => (
            <li key={`${result.kind}:${result.key}`}>
              <button
                type="button"
                className="ws-search-result"
                data-highlighted={selected === row}
                onFocus={() => setIndex(row)}
                onClick={() => choose(result)}
              >
                <WorkspaceIcon
                  name={
                    result.channel ? (result.channel.type === 'LIVE' ? 'video' : 'hash') : 'chat'
                  }
                />
                <span>{result.label}</span>
                <small>{result.kind}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ws-muted" role="status">
          Không có kết quả trong dữ liệu đã tải.
        </p>
      )}
    </dialog>
  );
}
