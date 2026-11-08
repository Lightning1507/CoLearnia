import type { ChannelSummary } from '@colearnia/contracts';
import { Fragment } from 'react';
import type { WorkspaceShellProps } from './shell-contract';
import { readableSidebarChannels, resolvePanelChannel } from './shell-contract';
import './workspace-shell.css';

function ChannelGroup({
  label,
  groupId,
  channels,
  selectedId,
  onSelect,
}: {
  label: string;
  groupId: string;
  channels: readonly ChannelSummary[];
  selectedId: string | undefined;
  onSelect: (channel: ChannelSummary) => void;
}) {
  if (channels.length === 0) return null;

  return (
    <section className="workspace-channel-group" aria-labelledby={groupId}>
      <h2 id={groupId}>{label}</h2>
      <ul>
        {channels.map((channel) => {
          const selected = channel.id === selectedId;
          return (
            <li key={channel.id}>
              <button
                type="button"
                className="workspace-channel"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(channel)}
              >
                <span aria-hidden="true">{channel.type === 'TEXT' ? '#' : '◉'}</span>
                <span>{channel.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function WorkspaceShell({
  workspace,
  channels,
  panel,
  onSelectChannel,
  chatPanel,
  callPanel,
  persistentCallControls,
}: WorkspaceShellProps) {
  const readable = readableSidebarChannels(channels, workspace.id);
  const selected = resolvePanelChannel(channels, workspace.id, panel);
  const textChannels = readable.map(({ channel }) => channel).filter(({ type }) => type === 'TEXT');
  const liveChannels = readable.map(({ channel }) => channel).filter(({ type }) => type === 'LIVE');

  return (
    <div className="workspace-shell" data-testid="workspace-shell">
      <aside className="workspace-sidebar" aria-label={`Kênh của ${workspace.name}`}>
        <div className="workspace-brand">
          <span className="workspace-brand-mark" aria-hidden="true">
            C
          </span>
          <span>CoLearnia</span>
        </div>
        <div className="workspace-identity">
          <p>KHÔNG GIAN HỌC TẬP</p>
          <strong>{workspace.name}</strong>
        </div>

        {readable.length === 0 ? (
          <p className="workspace-sidebar-empty">Bạn chưa có kênh nào có thể truy cập.</p>
        ) : (
          <nav aria-label="Danh sách kênh">
            <ChannelGroup
              label="KÊNH TRÒ CHUYỆN"
              groupId="workspace-text-channels"
              channels={textChannels}
              selectedId={selected?.channel.id}
              onSelect={onSelectChannel}
            />
            <ChannelGroup
              label="PHÒNG TRỰC TIẾP"
              groupId="workspace-live-channels"
              channels={liveChannels}
              selectedId={selected?.channel.id}
              onSelect={onSelectChannel}
            />
          </nav>
        )}
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-title">
            <p>
              {selected
                ? selected.channel.type === 'TEXT'
                  ? 'Kênh trò chuyện'
                  : 'Phòng trực tiếp'
                : 'Workspace'}
            </p>
            <h1>{selected?.channel.name ?? workspace.name}</h1>
          </div>
          <div className="workspace-call-controls">{persistentCallControls}</div>
        </header>

        <section className="workspace-panel-host" aria-live="polite">
          {panel.kind === 'empty' ? (
            <div className="workspace-panel-empty">
              <span aria-hidden="true">↗</span>
              <h2>Chọn một kênh để bắt đầu</h2>
              <p>Chat và phòng học trực tiếp sẽ mở tại đây.</p>
            </div>
          ) : !selected ? (
            <div className="workspace-panel-empty" role="status">
              <span aria-hidden="true">!</span>
              <h2>Kênh không còn khả dụng</h2>
              <p>Quyền truy cập hoặc dữ liệu kênh đã thay đổi. Nội dung cũ đã được đóng.</p>
            </div>
          ) : (
            <Fragment key={`${workspace.id}:${selected.channel.id}`}>
              {panel.kind === 'text' ? chatPanel : callPanel}
            </Fragment>
          )}
        </section>
      </main>
    </div>
  );
}
