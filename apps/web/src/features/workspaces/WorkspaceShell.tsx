import type { ChannelSummary, WorkspaceSummary } from '@colearnia/contracts';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { WorkspaceShellProps } from './shell-contract';
import { readableSidebarChannels, resolvePanelChannel } from './shell-contract';

const channelIconPaths = {
  hash: <path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />
  ),
};

function ChannelIcon({ channel }: { channel: ChannelSummary }) {
  const icon =
    channel.type === 'LIVE' ? 'phone' : channel.accessMode === 'PRIVATE' ? 'lock' : 'hash';
  return (
    <svg
      className="size-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-channel-icon={icon}
    >
      {channelIconPaths[icon]}
    </svg>
  );
}

function WorkspaceMenu({
  workspace,
  onOpenWorkspaceList,
}: {
  workspace: WorkspaceSummary;
  onOpenWorkspaceList: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const document = container.current?.ownerDocument;
    if (!document) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    listButton.current?.focus();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        className="flex h-16 w-full min-w-0 items-center gap-2.5 border-b border-[color:var(--workspace-border)] px-3.5 text-left hover:bg-[var(--workspace-channel-hover-bg)]"
        ref={trigger}
        aria-label={`Mở menu Workspace ${workspace.name}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <span
          className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-[var(--workspace-brand-bg)] text-xs font-bold text-[color:var(--workspace-brand-text)]"
          aria-hidden="true"
        >
          C
        </span>
        <strong className="min-w-0 flex-1 truncate text-sm">{workspace.name}</strong>
        <svg
          aria-hidden="true"
          className="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <nav
          id={menuId}
          aria-label="Menu Workspace"
          className="absolute inset-x-2 top-[60px] z-20 grid gap-2 rounded-lg border border-[color:var(--workspace-border)] bg-[var(--workspace-content-bg)] p-3 shadow-lg"
        >
          <div className="grid gap-1 border-b border-[color:var(--workspace-border)] pb-3">
            <p className="text-xs text-[color:var(--workspace-muted)]">Workspace hiện tại</p>
            <strong className="truncate text-sm">{workspace.name}</strong>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--workspace-channel-hover-bg)]"
            ref={listButton}
            onClick={() => {
              setOpen(false);
              onOpenWorkspaceList();
            }}
          >
            Danh sách Workspace
          </button>
        </nav>
      )}
    </div>
  );
}

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
    <section className="shrink-0 min-[721px]:mt-3" aria-labelledby={groupId}>
      <h2
        className="sr-only px-2 pb-2 text-[10px] font-semibold tracking-wide text-[color:var(--workspace-muted)] min-[721px]:not-sr-only"
        id={groupId}
      >
        {label}
      </h2>
      <ul className="flex gap-0.5 min-[721px]:flex-col">
        {channels.map((channel) => {
          const selected = channel.id === selectedId;
          return (
            <li className="max-w-56 shrink-0 min-[721px]:max-w-none" key={channel.id}>
              <button
                type="button"
                className={`workspace-channel flex h-[34px] w-full items-center gap-[9px] rounded-md px-2.5 text-left text-[13px] ${selected ? 'bg-[var(--workspace-channel-selected-bg)] font-semibold text-[color:var(--workspace-channel-selected-text)]' : 'text-[color:var(--workspace-text)] hover:bg-[var(--workspace-channel-hover-bg)]'}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(channel)}
              >
                <ChannelIcon channel={channel} />
                <span className="min-w-0 truncate">{channel.name}</span>
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
  onOpenWorkspaceList,
  chatPanel,
  callPanel,
  persistentCallControls,
}: WorkspaceShellProps) {
  const readable = readableSidebarChannels(channels, workspace.id);
  const selected = resolvePanelChannel(channels, workspace.id, panel);
  const textChannels = readable.map(({ channel }) => channel).filter(({ type }) => type === 'TEXT');
  const liveChannels = readable.map(({ channel }) => channel).filter(({ type }) => type === 'LIVE');

  return (
    <div
      className="workspace-shell @container/room-layout grid min-h-dvh min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-[var(--workspace-content-bg)] text-[color:var(--workspace-text)] min-[721px]:grid-cols-[256px_minmax(0,1fr)] min-[721px]:grid-rows-1"
      data-testid="workspace-shell"
    >
      <aside
        className="workspace-sidebar min-w-0 border-b border-[color:var(--workspace-border)] bg-[var(--workspace-sidebar-bg)] min-[721px]:border-r min-[721px]:border-b-0"
        aria-label={`Kênh của ${workspace.name}`}
      >
        <WorkspaceMenu workspace={workspace} onOpenWorkspaceList={onOpenWorkspaceList} />

        {readable.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--workspace-muted)]">
            Bạn chưa có kênh nào có thể truy cập.
          </p>
        ) : (
          <nav
            className="flex gap-3 overflow-x-auto px-2 py-2.5 min-[721px]:block"
            aria-label="Danh sách kênh"
          >
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

      <main className="workspace-main flex min-w-0 flex-col bg-[var(--workspace-content-bg)]">
        <header className="workspace-topbar flex min-h-16 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[color:var(--workspace-border)] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {selected && <ChannelIcon channel={selected.channel} />}
            <div className="min-w-0">
              <h1 className="m-0 truncate text-[15px] leading-5 font-semibold tracking-normal">
                {selected?.channel.name ?? workspace.name}
              </h1>
              <p className="truncate text-[11px] text-[color:var(--workspace-muted)]">
                {selected
                  ? selected.channel.type === 'TEXT'
                    ? 'Kênh trò chuyện'
                    : 'Phòng trực tiếp'
                  : 'Workspace'}
              </p>
            </div>
          </div>
          <div className="min-w-0 max-w-full">{persistentCallControls}</div>
        </header>

        <section className="workspace-panel-host flex min-w-0 flex-1 flex-col" aria-live="polite">
          {panel.kind === 'empty' ? (
            <div className="grid min-h-80 flex-1 content-center gap-2 px-5 py-6 text-center">
              <h2 className="text-lg font-semibold">Chọn một kênh để bắt đầu</h2>
              <p className="text-sm text-[color:var(--workspace-muted)]">
                Chat và phòng học trực tiếp sẽ mở tại đây.
              </p>
            </div>
          ) : !selected ? (
            <div
              className="grid min-h-80 flex-1 content-center gap-2 px-5 py-6 text-center"
              role="status"
            >
              <h2 className="text-lg font-semibold">Kênh không còn khả dụng</h2>
              <p className="text-sm text-[color:var(--workspace-muted)]">
                Quyền truy cập hoặc dữ liệu kênh đã thay đổi. Nội dung cũ đã được đóng.
              </p>
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
