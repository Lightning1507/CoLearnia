import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  AuthenticatedData,
  ChannelSummary,
  WorkspaceRole,
  WorkspaceSummary,
} from '@colearnia/contracts';
import { WorkspaceShell } from '../workspaces/WorkspaceShell';
import type { WorkspacePanel } from '../workspaces/shell-contract';
import { sessionKey } from '../auth/session';
import { CreateChannelForm } from './CreateChannelForm';
import { ChannelApiError } from './channel-api';
import { channelListOptions } from './channel-list-query';
import './channel-list.css';

function message(error: unknown) {
  if (error instanceof ChannelApiError) {
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn.';
    if (error.status === 403) return 'Bạn không còn quyền quản lý kênh.';
    if (error.status === 404)
      return 'Workspace không còn tồn tại hoặc bạn không còn quyền truy cập.';
    if (error.status === 400) return 'Vị trí trang đã thay đổi. Hãy tải lại danh sách.';
  }
  return 'Chưa tải được danh sách kênh. Vui lòng thử lại.';
}

export function ChannelWorkspace({
  workspace,
  userId,
  expiresAt,
  account,
  onAccessLost,
}: {
  workspace: WorkspaceSummary & { role: WorkspaceRole };
  userId: string;
  expiresAt: string;
  account: ReactNode;
  onAccessLost: (message: string) => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [manage, setManage] = useState(false);
  const [panel, setPanel] = useState<WorkspacePanel>({ kind: 'empty' });
  const notified = useRef<unknown>(null);
  const canManage = workspace.role === 'OWNER' || workspace.role === 'ADMIN';
  const prefix = ['channels', userId, workspace.id, expiresAt] as const;
  const content = useInfiniteQuery(
    channelListOptions(client, userId, workspace.id, expiresAt, 'content'),
  );
  const management = useInfiniteQuery({
    ...channelListOptions(client, userId, workspace.id, expiresAt, 'manage'),
    enabled: manage && canManage,
  });
  useEffect(() => {
    const key = ['channels', userId, workspace.id, expiresAt];
    return () => {
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
    };
  }, [client, userId, workspace.id, expiresAt]);
  const failure = content.error ?? (manage ? management.error : null);
  useEffect(() => {
    if (!(failure instanceof ChannelApiError) || notified.current === failure) return;
    if (![401, 403, 404].includes(failure.status)) return;
    const current = client.getQueryData<AuthenticatedData | null>(sessionKey);
    if (current?.user.id !== userId || current.expiresAt !== expiresAt) return;
    notified.current = failure;
    if (failure.status === 401) client.setQueryData(sessionKey, null);
    else onAccessLost(message(failure));
  }, [failure, client, userId, expiresAt, workspace.id, onAccessLost]);

  // A failed permission refresh also withdraws any previously rendered projection.
  const channels = content.isError
    ? []
    : [
        ...new Map(
          content.data?.pages.flatMap((page) => page.items).map((row) => [row.id, row]) ?? [],
        ).values(),
      ];
  const selected =
    panel.kind === 'empty' ? undefined : channels.find((row) => row.id === panel.channelId);
  const managed = management.isError
    ? []
    : [
        ...new Map(
          management.data?.pages.flatMap((page) => page.items).map((row) => [row.id, row]) ?? [],
        ).values(),
      ];
  function select(channel: ChannelSummary) {
    setManage(false);
    setPanel({ kind: channel.type === 'TEXT' ? 'text' : 'live', channelId: channel.id });
  }
  function refresh() {
    void client.resetQueries({ queryKey: prefix });
  }
  const selectedPanel = selected && (
    <section className="channel-detail">
      <h2>{selected.type === 'TEXT' ? 'Kênh trò chuyện' : 'Phòng trực tiếp'}</h2>
      <p>
        {selected.accessMode === 'PRIVATE'
          ? 'Chỉ thành viên được cấp quyền truy cập.'
          : 'Dành cho thành viên Workspace.'}
      </p>
      <p>Bạn có quyền truy cập kênh này.</p>
    </section>
  );
  return (
    <WorkspaceShell
      workspace={workspace}
      channels={channels.map((channel) => ({
        channel,
        canReadContent: true,
        canManageChannel: canManage,
      }))}
      panel={manage && canManage ? { kind: 'empty' } : panel}
      onSelectChannel={select}
      onOpenWorkspaceList={() => navigate('/workspaces')}
      chatPanel={selectedPanel}
      callPanel={selectedPanel}
      persistentCallControls={account}
      sidebarControls={
        <div className="channel-sidebar-actions">
          <button
            className="channel-list-button"
            onClick={refresh}
            disabled={content.isFetching || management.isFetching}
          >
            Làm mới danh sách
          </button>
          {canManage && (
            <>
              <button
                className="channel-list-button"
                aria-pressed={manage}
                onClick={() => setManage(!manage)}
              >
                Quản lý kênh
              </button>
              <CreateChannelForm
                workspaceId={workspace.id}
                userId={userId}
                onAccessLost={onAccessLost}
              />
            </>
          )}
        </div>
      }
      sidebarStatus={
        <div className="channel-sidebar-status">
          {content.isPending && <p role="status">Đang tải kênh…</p>}
          {content.isError && <p role="alert">{message(content.error)}</p>}
          {content.isSuccess && channels.length === 0 && (
            <p role="status">
              {content.hasNextPage
                ? 'Chưa có kênh có thể truy cập trong các trang đã tải. Xem thêm để tiếp tục kiểm tra.'
                : 'Bạn chưa có kênh nào có thể truy cập.'}
            </p>
          )}
          {content.hasNextPage && (
            <button
              className="channel-list-button"
              disabled={content.isFetching}
              onClick={() => void content.fetchNextPage()}
            >
              {content.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm kênh'}
            </button>
          )}
        </div>
      }
      contentOverride={
        manage && canManage ? (
          <section className="channel-management">
            <header>
              <h2>Quản lý kênh</h2>
              <p>Các kênh trong {workspace.name}</p>
            </header>
            {management.isPending && <p role="status">Đang tải danh sách quản trị…</p>}
            {management.isError && <p role="alert">{message(management.error)}</p>}
            {management.isSuccess && managed.length === 0 && <p>Chưa có kênh trong trang này.</p>}
            <ul className="channel-management-list">
              {managed.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    <p>
                      {row.type} · {row.accessMode === 'PRIVATE' ? 'Riêng tư' : 'Toàn Workspace'}
                    </p>
                  </div>
                  {'canReadContent' in row && row.canReadContent === true ? (
                    <span>Có quyền truy cập nội dung</span>
                  ) : (
                    <span>Chưa được cấp quyền truy cập nội dung</span>
                  )}
                </li>
              ))}
            </ul>
            {management.hasNextPage && (
              <button
                className="channel-list-button"
                disabled={management.isFetching}
                onClick={() => void management.fetchNextPage()}
              >
                {management.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm kênh quản trị'}
              </button>
            )}
          </section>
        ) : undefined
      }
    />
  );
}
