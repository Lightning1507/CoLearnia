import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { ChannelSummary } from '@colearnia/contracts';
import type { WorkspaceShellProps } from './shell-contract';
import { readableSidebarChannels, resolvePanelChannel } from './shell-contract';
import { WorkspaceIcon } from './WorkspaceIcon';
import { WorkspaceSearch } from './WorkspaceSearch';
import { useWorkspaceDrawer, useWorkspaceTheme, workspaceInitials } from './workspace-appearance';
import './workspace-shell.css';
import { CallDockRegistration, MeetingNavigation } from './meeting-navigation';

const roleNames = { OWNER: 'Chủ Workspace', ADMIN: 'Quản trị viên', MEMBER: 'Thành viên' };

function openSidebarDialog(dialog: HTMLDialogElement | null, trigger: HTMLButtonElement) {
  if (!dialog || dialog.open) return;
  const anchor = trigger.getBoundingClientRect();
  const edge = 10;
  dialog.showModal();
  const left = Math.max(edge, Math.min(anchor.left, window.innerWidth - dialog.offsetWidth - edge));
  const below = anchor.bottom + 6;
  const above = anchor.top - dialog.offsetHeight - 6;
  const bottom = window.innerHeight - dialog.offsetHeight - edge;
  const top = below > bottom && above >= edge ? above : Math.max(edge, Math.min(below, bottom));
  dialog.style.setProperty('--ws-dialog-left', left + 'px');
  dialog.style.setProperty('--ws-dialog-top', top + 'px');
}

function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  if (
    event.clientX < left ||
    event.clientX > right ||
    event.clientY < top ||
    event.clientY > bottom
  )
    event.currentTarget.close();
}

function ChannelIcon({ channel }: { channel: ChannelSummary }) {
  return (
    <span className="ws-channel-icon" aria-hidden="true">
      {channel.accessMode === 'PRIVATE' && <WorkspaceIcon name="lock" />}
      <WorkspaceIcon name={channel.type === 'LIVE' ? 'video' : 'hash'} />
    </span>
  );
}

function ChannelGroup({
  label,
  channels,
  selectedId,
  onSelect,
  actions,
  live,
}: {
  label: string;
  channels: readonly ChannelSummary[];
  selectedId?: string | undefined;
  onSelect: (channel: ChannelSummary) => void;
  actions?: ReactNode;
  live?: boolean;
}) {
  const headingId = useId();
  return (
    <section className="ws-channel-group" aria-labelledby={headingId}>
      <div className="ws-section-heading">
        <h2 id={headingId}>{label}</h2>
        {actions}
      </div>
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              className={live ? 'workspace-channel ws-channel-live' : 'workspace-channel'}
              title={channel.name}
              aria-label={
                channel.name +
                ' · ' +
                (live ? 'Phòng trực tiếp' : 'Kênh trò chuyện') +
                (channel.accessMode === 'PRIVATE' ? ' · Riêng tư' : '')
              }
              aria-current={channel.id === selectedId ? 'page' : undefined}
              onClick={() => onSelect(channel)}
            >
              <ChannelIcon channel={channel} />
              <span className="ws-truncate">{channel.name}</span>
            </button>
          </li>
        ))}
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
  workspaceChoices,
  onPickerOpen,
  user,
  createChannel,
  workspaceActions,
  searchMessages = [],
  workspaceMenuTriggerRef,
  chatPanel,
  retainedChatPanel,
  callPanel,
  persistentCallControls,
  sidebarControls,
  sidebarStatus,
  contentOverride,
}: WorkspaceShellProps) {
  const accessible = readableSidebarChannels(channels, workspace.id).map(({ channel }) => channel);
  const selected = resolvePanelChannel(channels, workspace.id, panel)?.channel;
  const mobile = useWorkspaceDrawer();
  const meeting = useContext(MeetingNavigation);
  const registerDock = useContext(CallDockRegistration);
  const dockRef = useCallback(
    (element: HTMLDivElement | null) => registerDock?.(element),
    [registerDock],
  );
  const meetingFocused = meeting?.focused === true;
  const meetingDrawerOpen = meeting?.open === true;
  const useDrawer = mobile || meetingFocused;
  const { theme, toggle } = useWorkspaceTheme();
  const [context, setContext] = useState<'members' | 'channel'>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const focusChannelAfterDrawer = useRef(false);
  const navigationButton = useRef<HTMLButtonElement>(null);
  const workspacePicker = useRef<HTMLDialogElement>(null);
  const options = useRef<HTMLDialogElement>(null);
  const dm = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLDialogElement>(null);
  const searchOrigin = useRef<HTMLElement | null>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const channelInfo = useRef<HTMLButtonElement>(null);
  const membersButton = useRef<HTMLButtonElement>(null);
  const contextClose = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationId = useId();
  const contextId = useId();
  const optionsId = useId();
  useLayoutEffect(() => {
    const dialog = drawer.current;
    if (meetingFocused && meetingDrawerOpen && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (meetingFocused && meetingDrawerOpen && dialog?.open) dialog.close();
    };
  }, [meetingDrawerOpen, meetingFocused]);

  function showContext(next: 'members' | 'channel') {
    if (context === next) {
      setContext(undefined);
      return;
    }
    setContext(next);
    requestAnimationFrame(() => contextClose.current?.focus());
  }
  function closeContext() {
    const trigger = context === 'members' ? membersButton : channelInfo;
    setContext(undefined);
    trigger.current?.focus();
  }
  function select(channel: ChannelSummary) {
    focusChannelAfterDrawer.current = drawer.current?.open === true;
    drawer.current?.close();
    setContext(undefined);
    onSelectChannel(channel);
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'k' ||
        (!event.ctrlKey && !event.metaKey) ||
        event.isComposing ||
        event.defaultPrevented
      )
        return;
      if (document.querySelector('dialog[open]') || searchButton.current?.closest('[inert]'))
        return;
      event.preventDefault();
      searchOrigin.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      search.current?.showModal();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const sidebar = (
    <>
      <div className="ws-brand">
        <button
          type="button"
          onClick={() => {
            drawer.current?.close();
            onOpenWorkspaceList();
          }}
        >
          <img
            className="ws-brand-mark"
            src={new URL('./workspace-mark.svg', import.meta.url).href}
            width="32"
            height="32"
            alt=""
          />{' '}
          CoLearnia
        </button>
        {useDrawer && (
          <button
            aria-label="Đóng danh sách kênh"
            type="button"
            className="ws-icon-button"
            onClick={() => drawer.current?.close()}
          >
            <WorkspaceIcon name="close" />
          </button>
        )}
      </div>
      <div className="ws-switcher">
        <button
          type="button"
          className="ws-workspace-button"
          ref={workspaceMenuTriggerRef}
          aria-label={'Mở menu Workspace ' + workspace.name}
          aria-haspopup="dialog"
          onClick={(event) => {
            onPickerOpen?.();
            openSidebarDialog(workspacePicker.current, event.currentTarget);
          }}
        >
          <span className="ws-monogram" aria-hidden="true">
            {workspaceInitials(workspace.name)}
          </span>
          <strong className="ws-truncate">{workspace.name}</strong>
          <WorkspaceIcon name="chevron" />
        </button>
        <button
          type="button"
          className="ws-icon-button"
          aria-label={'Tùy chọn Workspace ' + workspace.name}
          aria-haspopup="dialog"
          aria-controls={optionsId}
          aria-expanded={optionsOpen}
          onClick={(event) => {
            openSidebarDialog(options.current, event.currentTarget);
            setOptionsOpen(true);
          }}
        >
          <WorkspaceIcon name="more" />
        </button>
      </div>
      <nav className="ws-channel-navigation" aria-label="Danh sách kênh">
        <ChannelGroup
          label="Kênh"
          channels={accessible.filter(({ type }) => type === 'TEXT')}
          actions={createChannel}
          selectedId={selected?.id}
          onSelect={select}
        />
        <ChannelGroup
          label="Họp trực tiếp"
          channels={accessible.filter(({ type }) => type === 'LIVE')}
          selectedId={selected?.id}
          live
          onSelect={select}
        />
        <section className="ws-channel-group" aria-label="Trò chuyện riêng">
          <div className="ws-section-heading">
            <h2>Trò chuyện</h2>
            <button
              type="button"
              className="ws-icon-button ws-small"
              aria-label="Bắt đầu trò chuyện riêng"
              aria-haspopup="dialog"
              onClick={() => dm.current?.showModal()}
            >
              <WorkspaceIcon name="plus" />
            </button>
          </div>
          <p className="ws-section-empty">Trò chuyện riêng chưa khả dụng.</p>
        </section>
        {sidebarControls}
        {sidebarStatus}
      </nav>
      <div className="ws-account">
        {user && (
          <div className="ws-account-identity">
            <span className="ws-monogram ws-avatar" aria-hidden="true">
              {workspaceInitials(user.displayName)}
            </span>
            <span>
              <strong className="ws-truncate">{user.displayName}</strong>
              <small>{roleNames[user.role]}</small>
            </span>
          </div>
        )}
        <button
          type="button"
          className="ws-icon-button"
          aria-pressed={theme === 'dark'}
          aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          onClick={toggle}
        >
          <WorkspaceIcon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
      {!useDrawer && registerDock && <div className="ws-call-dock" ref={dockRef} />}
    </>
  );

  return (
    <div
      className="workspace-shell ws-v8 @container/room-layout"
      data-workspace-theme={theme}
      data-testid="workspace-shell"
    >
      {useDrawer ? (
        <dialog
          id={navigationId}
          ref={drawer}
          aria-label={'Kênh của ' + workspace.name}
          className="workspace-sidebar ws-drawer"
          onClose={() => {
            setDrawerOpen(false);
            if (meetingFocused) {
              meeting?.close();
              if (focusChannelAfterDrawer.current) {
                focusChannelAfterDrawer.current = false;
                requestAnimationFrame(() => heading.current?.focus());
              }
              return;
            }
            const focusTarget = focusChannelAfterDrawer.current ? heading : navigationButton;
            focusChannelAfterDrawer.current = false;
            focusTarget.current?.focus();
          }}
          onClick={closeOnBackdrop}
        >
          {sidebar}
        </dialog>
      ) : (
        <aside
          id={navigationId}
          className="workspace-sidebar"
          aria-label={'Kênh của ' + workspace.name}
        >
          {sidebar}
        </aside>
      )}
      <main
        hidden={meetingFocused}
        className="workspace-main"
        onKeyDown={(event) => {
          if (context && event.key === 'Escape') {
            event.stopPropagation();
            closeContext();
          }
        }}
      >
        <header className="workspace-topbar">
          {mobile && (
            <button
              type="button"
              className="ws-icon-button"
              aria-label="Mở danh sách kênh và trò chuyện"
              ref={navigationButton}
              aria-expanded={drawerOpen}
              aria-controls={navigationId}
              onClick={() => {
                drawer.current?.showModal();
                setDrawerOpen(true);
              }}
            >
              <WorkspaceIcon name="menu" />
            </button>
          )}
          {selected && (
            <span className="ws-channel-mark">
              <ChannelIcon channel={selected} />
            </span>
          )}
          <div className="ws-header-copy">
            <h1 ref={heading} tabIndex={-1}>
              {selected ? (
                <button
                  className="ws-channel-title"
                  ref={channelInfo}
                  type="button"
                  aria-expanded={context === 'channel'}
                  aria-controls={context ? contextId : undefined}
                  onClick={() => showContext('channel')}
                >
                  <span className="ws-truncate">{selected.name}</span>
                  <WorkspaceIcon name="chevron" />
                </button>
              ) : (
                <span className="ws-truncate">{workspace.name}</span>
              )}
            </h1>
            {selected && <p>{selected.accessMode === 'PRIVATE' ? 'Riêng tư' : 'Toàn Workspace'}</p>}
          </div>
          <button
            type="button"
            className="ws-icon-button"
            aria-label="Tìm tin nhắn và kênh"
            title="Tìm kiếm (Ctrl/⌘ + K)"
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            ref={searchButton}
            onClick={() => {
              searchOrigin.current = searchButton.current;
              search.current?.showModal();
            }}
          >
            <WorkspaceIcon name="search" />
          </button>
          <button
            type="button"
            className="ws-icon-button ws-members-button"
            aria-label="Thành viên Workspace"
            aria-expanded={context === 'members'}
            aria-controls={context ? contextId : undefined}
            ref={membersButton}
            onClick={() => showContext('members')}
          >
            <WorkspaceIcon name="people" />
            <span>Thành viên</span>
          </button>
          {!user && persistentCallControls}
        </header>
        <div className="ws-content" data-context-open={Boolean(context)}>
          <section className="workspace-panel-host" aria-label="Nội dung kênh">
            {contentOverride ??
              (panel.kind === 'empty' ? (
                <div className="ws-empty">
                  <span className="ws-monogram" aria-hidden="true">
                    <WorkspaceIcon name="chat" />
                  </span>
                  <h2>Chọn một kênh để bắt đầu</h2>
                  <p>Tin nhắn và phòng học trực tiếp sẽ mở tại đây.</p>
                </div>
              ) : !selected ? (
                <div className="ws-empty" role="status">
                  <h2>Kênh không còn khả dụng</h2>
                  <p>Quyền truy cập hoặc dữ liệu kênh đã thay đổi.</p>
                </div>
              ) : (
                <Fragment key={workspace.id + ':' + selected.id}>
                  {panel.kind === 'text' ? (retainedChatPanel ? null : chatPanel) : callPanel}
                </Fragment>
              ))}
            {retainedChatPanel}
          </section>
          {context && (
            <aside className="ws-context" aria-label="Thông tin Workspace và kênh" id={contextId}>
              <div className="ws-dialog-heading">
                <h2>Thông tin nhóm</h2>
                <button
                  className="ws-icon-button"
                  ref={contextClose}
                  type="button"
                  aria-label="Đóng bảng thông tin"
                  onClick={closeContext}
                >
                  <WorkspaceIcon name="close" />
                </button>
              </div>
              <div className="ws-context-tabs" aria-label="Chọn nội dung">
                <button
                  type="button"
                  aria-pressed={context === 'members'}
                  onClick={() => setContext('members')}
                >
                  Thành viên
                </button>
                <button
                  type="button"
                  disabled={!selected}
                  aria-pressed={context === 'channel'}
                  onClick={() => setContext('channel')}
                >
                  Thông tin kênh
                </button>
              </div>
              {context === 'channel' && selected ? (
                <div className="ws-context-body">
                  <p className="ws-muted">
                    {selected.type === 'TEXT' ? 'Kênh chữ' : 'Họp trực tiếp'}
                  </p>
                  <h3>{selected.name}</h3>
                  <p>
                    {selected.accessMode === 'PRIVATE'
                      ? 'Chỉ thành viên được cấp quyền truy cập.'
                      : 'Dành cho thành viên Workspace.'}
                  </p>
                </div>
              ) : (
                <div className="ws-context-body">
                  {user && (
                    <div className="ws-account-identity">
                      <span className="ws-monogram ws-avatar" aria-hidden="true">
                        {workspaceInitials(user.displayName)}
                      </span>
                      <span>
                        <strong>{user.displayName} · Bạn</strong>
                        <small>{roleNames[user.role]}</small>
                      </span>
                    </div>
                  )}
                  <p className="ws-muted">Danh sách thành viên Workspace chưa khả dụng.</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </main>
      <dialog
        ref={workspacePicker}
        className="ws-dialog ws-picker ws-sidebar-dialog"
        aria-label="Menu Workspace"
        onClick={closeOnBackdrop}
      >
        <div className="ws-dialog-heading">
          <h2>Chuyển Workspace</h2>
          <button
            className="ws-icon-button"
            type="button"
            aria-label="Đóng bộ chọn Workspace"
            onClick={() => workspacePicker.current?.close()}
          >
            <WorkspaceIcon name="close" />
          </button>
        </div>
        {workspaceChoices?.pending && (
          <p role="status" className="ws-muted">
            Đang tải Workspace…
          </p>
        )}
        {workspaceChoices?.failed && (
          <button type="button" className="ws-action" onClick={workspaceChoices.onRetry}>
            Thử tải lại
          </button>
        )}
        {workspaceChoices && !workspaceChoices.failed && (
          <ul className="ws-picker-list">
            {workspaceChoices.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === workspace.id ? 'true' : undefined}
                  onClick={() => {
                    workspacePicker.current?.close();
                    drawer.current?.close();
                    if (item.id !== workspace.id) workspaceChoices.onChoose(item);
                  }}
                >
                  <span className="ws-monogram" aria-hidden="true">
                    {workspaceInitials(item.name)}
                  </span>
                  <span className="ws-truncate">{item.name}</span>
                  {item.id === workspace.id && <WorkspaceIcon name="check" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {workspaceChoices?.onMore && (
          <button
            className="ws-action"
            type="button"
            disabled={workspaceChoices.loadingMore}
            onClick={workspaceChoices.onMore}
          >
            Xem thêm
          </button>
        )}
        <button
          type="button"
          className="ws-action"
          onClick={() => {
            workspacePicker.current?.close();
            drawer.current?.close();
            onOpenWorkspaceList();
          }}
        >
          Danh sách Workspace
        </button>
      </dialog>
      <dialog
        id={optionsId}
        ref={options}
        className="ws-dialog ws-options ws-sidebar-dialog"
        aria-label="Tùy chọn Workspace"
        onClose={() => setOptionsOpen(false)}
        onClick={closeOnBackdrop}
      >
        <div className="ws-dialog-heading">
          <div className="ws-option-title">
            <h2>{workspace.name}</h2>
            {user && <p className="ws-muted">{roleNames[user.role]}</p>}
          </div>
          <button
            type="button"
            className="ws-icon-button"
            aria-label="Đóng tùy chọn Workspace"
            onClick={() => options.current?.close()}
          >
            <WorkspaceIcon name="close" />
          </button>
        </div>
        <div
          className="ws-option-actions"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('button[data-workspace-option]')
            ) {
              options.current?.close();
              drawer.current?.close();
            }
          }}
        >
          {workspaceActions}
        </div>
        {user && persistentCallControls}
      </dialog>
      <dialog ref={dm} className="ws-dialog" aria-label="Bắt đầu trò chuyện riêng">
        <div className="ws-dialog-heading">
          <h2>Bắt đầu trò chuyện riêng</h2>
          <button
            type="button"
            className="ws-icon-button"
            aria-label="Đóng trò chuyện riêng"
            onClick={() => dm.current?.close()}
          >
            <WorkspaceIcon name="close" />
          </button>
        </div>
        <p className="ws-muted" role="status">
          Chưa thể chọn người nhận hoặc gửi tin nhắn riêng trong Workspace này.
        </p>
      </dialog>
      <WorkspaceSearch
        dialog={search}
        channels={accessible}
        messages={searchMessages}
        onSelect={select}
        onClose={() => {
          if (searchOrigin.current?.isConnected) searchOrigin.current.focus();
          else searchButton.current?.focus();
        }}
      />
    </div>
  );
}
