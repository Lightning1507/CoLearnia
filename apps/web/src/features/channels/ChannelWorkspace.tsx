import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMainCall } from '../live/runtime/mainCallContext';
import type {
  AuthenticatedData,
  ChannelSummary,
  TextHistoryMessage,
  WorkspaceRole,
  WorkspaceSummary,
} from '@colearnia/contracts';
import { WorkspaceShell } from '../workspaces/WorkspaceShell';
import type { WorkspacePanel } from '../workspaces/shell-contract';
import { sessionKey, sessionOptions } from '../auth/session';
import { CreateChannelForm } from './CreateChannelForm';
import { ChannelApiError } from './channel-api';
import { channelListOptions } from './channel-list-query';
import './channel-list.css';
import { TextChannel } from '../text/TextChannel';
import { workspaceListOptions } from '../workspaces/workspace-api';
import { useTextMemory } from '../text/text-memory';

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
  const mainCall = useMainCall();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { channelId } = useParams();
  const [manage, setManage] = useState(false);
  const [pickerOpened, setPickerOpened] = useState(false);
  const picker = useInfiniteQuery({ ...workspaceListOptions(userId), enabled: pickerOpened });
  const [searchProjection, setSearchProjection] = useState<{
    channelId: string;
    messages: readonly TextHistoryMessage[];
  }>();
  const textMemory = useTextMemory();
  const [recentText, setRecentText] = useState<string[]>([]);
  const [textAccessNotice, setTextAccessNotice] = useState('');
  const withdrawText = useCallback(
    (revokedChannelId: string) => {
      textMemory?.forget(workspace.id, revokedChannelId);
      setSearchProjection((current) =>
        current?.channelId === revokedChannelId ? undefined : current,
      );
      setRecentText((ids) => ids.filter((id) => id !== revokedChannelId));
      setTextAccessNotice(
        'Quyền truy cập chat đã thay đổi. Nội dung kênh đã được xóa khỏi bộ nhớ.',
      );
      const queryKey = ['channels', userId, workspace.id, expiresAt];
      if (channelId === revokedChannelId) {
        navigate(`/workspaces/${workspace.id}`, { replace: true });
        void client.resetQueries({ queryKey });
      } else {
        void client.invalidateQueries({ queryKey });
      }
      void client.invalidateQueries({ queryKey: sessionKey });
    },
    [channelId, client, userId, workspace.id, expiresAt, navigate, textMemory],
  );
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
    else {
      textMemory?.forget(workspace.id);
      onAccessLost(message(failure));
    }
  }, [failure, client, userId, expiresAt, workspace.id, onAccessLost, textMemory]);

  // A failed permission refresh also withdraws any previously rendered projection.
  const channels = content.isError
    ? []
    : [
        ...new Map(
          content.data?.pages.flatMap((page) => page.items).map((row) => [row.id, row]) ?? [],
        ).values(),
      ];
  const selected = channels.find((row) => row.id === channelId);
  const { data: session } = useQuery({ ...sessionOptions, enabled: false });
  const hasSession = session?.user.id === userId && session.expiresAt === expiresAt;
  const selectedTextId = selected?.type === 'TEXT' ? selected.id : undefined;
  // Keep only the current and most recently visited authorized TEXT channels mounted.
  const retainedText = hasSession
    ? [
        ...(selectedTextId ? [selectedTextId] : []),
        ...recentText.filter(
          (id) =>
            id !== selectedTextId && channels.some((row) => row.id === id && row.type === 'TEXT'),
        ),
      ].slice(0, 2)
    : [];
  if (
    retainedText.length !== recentText.length ||
    retainedText.some((id, i) => id !== recentText[i])
  )
    setRecentText(retainedText);

  function releaseHiddenText(requestedChannelId: string) {
    if (requestedChannelId !== selectedTextId || retainedText.length < 2) return false;
    setRecentText([requestedChannelId]);
    return true;
  }
  const panel: WorkspacePanel = selected
    ? { kind: selected.type === 'TEXT' ? 'text' : 'live', channelId: selected.id }
    : { kind: 'empty' };
  const liveRoute = location.pathname.endsWith('/live');
  const handledLiveRoute = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      handledLiveRoute.current = undefined;
    },
    [],
  );
  useEffect(() => {
    if (!liveRoute) {
      handledLiveRoute.current = undefined;
      return;
    }
    if (!selected || handledLiveRoute.current === location.key) return;
    if (selected.type !== 'LIVE') {
      navigate(`/workspaces/${workspace.id}/channels/${selected.id}`, { replace: true });
      return;
    }
    const auth = client.getQueryData<AuthenticatedData | null>(sessionKey);
    if (
      auth?.user.id !== userId ||
      auth.expiresAt !== expiresAt ||
      Date.parse(expiresAt) <= Date.now()
    )
      return;
    handledLiveRoute.current = location.key;
    // Channel came from the current authenticated content list, never URL data alone.
    mainCall.setAuth(auth);
    const current = mainCall.getSnapshot();
    if (
      current.target &&
      current.phase !== 'idle' &&
      current.phase !== 'lobby' &&
      current.target.channelId !== selected.id
    ) {
      navigate(
        `/workspaces/${current.target.workspaceId}/channels/${current.target.channelId}/live`,
        { replace: true },
      );
      return;
    }
    mainCall.open({
      channelId: selected.id,
      channelName: selected.name,
      workspaceId: workspace.id,
    });
  }, [
    liveRoute,
    selected,
    location.key,
    client,
    userId,
    expiresAt,
    mainCall,
    workspace.id,
    navigate,
  ]);
  // Resolve a deep link across bounded pages; the existing More button can continue.
  useEffect(() => {
    if (
      channelId &&
      /^[a-f\d]{24}$/i.test(channelId) &&
      !selected &&
      !content.isError &&
      !content.isFetching &&
      content.hasNextPage &&
      (content.data?.pages.length ?? 0) < 10
    )
      void content.fetchNextPage({ cancelRefetch: false });
  }, [channelId, selected, content]);
  const managed = management.isError
    ? []
    : [
        ...new Map(
          management.data?.pages.flatMap((page) => page.items).map((row) => [row.id, row]) ?? [],
        ).values(),
      ];
  function select(channel: ChannelSummary) {
    setTextAccessNotice('');
    setManage(false);
    navigate(`/workspaces/${workspace.id}/channels/${channel.id}`);
  }
  function refresh() {
    void client.resetQueries({ queryKey: prefix });
  }
  const selectedPanel = selected && (
    <section
      className={`channel-detail${selected.type === 'LIVE' ? ' flex min-h-80 flex-1 flex-col items-center justify-center text-center' : ''}`}
    >
      <h2>{selected.type === 'TEXT' ? 'Kênh trò chuyện' : 'Phòng trực tiếp'}</h2>
      <p>
        {selected.accessMode === 'PRIVATE'
          ? 'Chỉ thành viên được cấp quyền truy cập.'
          : 'Dành cho thành viên Workspace.'}
      </p>
      <p>Bạn có quyền truy cập kênh này.</p>
      {selected.type === 'LIVE' && (
        <button
          type="button"
          className="auth-primary mt-4"
          onClick={() => navigate(`/workspaces/${workspace.id}/channels/${selected.id}/live`)}
        >
          Vào phòng trực tiếp
        </button>
      )}
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
      onPickerOpen={() => setPickerOpened(true)}
      workspaceChoices={{
        items: [
          ...new Map(
            (picker.data?.pages ?? []).flatMap((page) =>
              page.items.map((item) => [item.id, item] as const),
            ),
          ).values(),
        ],
        pending: picker.isPending,
        failed: picker.isError,
        loadingMore: picker.isFetchingNextPage,
        ...(picker.hasNextPage && { onMore: () => void picker.fetchNextPage() }),
        onRetry: () => void picker.refetch(),
        onChoose: (item) => navigate(`/workspaces/${item.id}`),
      }}
      {...(session?.user.id === userId && {
        user: { displayName: session.user.displayName, role: workspace.role },
      })}
      searchMessages={
        !manage && selectedTextId && searchProjection?.channelId === selectedTextId
          ? searchProjection.messages
          : []
      }
      chatPanel={selectedPanel}
      retainedChatPanel={
        hasSession && retainedText.length > 0
          ? retainedText.map((id) => {
              const visible = id === selectedTextId && !(manage && canManage);
              return (
                <div
                  key={`${userId}:${expiresAt}:${id}`}
                  hidden={!visible}
                  className={visible ? 'flex min-h-0 flex-1 flex-col' : undefined}
                >
                  <TextChannel
                    channelId={id}
                    workspaceId={workspace.id}
                    channelName={channels.find((channel) => channel.id === id)?.name}
                    session={session}
                    selected={visible}
                    onAccessLost={withdrawText}
                    onSubscriptionBusy={releaseHiddenText}
                    onSearchProjection={setSearchProjection}
                  />
                </div>
              );
            })
          : undefined
      }
      callPanel={selectedPanel}
      persistentCallControls={account}
      createChannel={
        canManage ? (
          <CreateChannelForm
            compact
            workspaceId={workspace.id}
            userId={userId}
            onAccessLost={onAccessLost}
          />
        ) : undefined
      }
      workspaceActions={
        <>
          <button
            type="button"
            data-workspace-option
            className="channel-list-button"
            onClick={refresh}
            disabled={content.isFetching || management.isFetching}
          >
            Làm mới danh sách
          </button>
          {canManage && (
            <button
              type="button"
              data-workspace-option
              className="channel-list-button"
              aria-pressed={manage}
              onClick={() => setManage(!manage)}
            >
              Quản lý kênh
            </button>
          )}
        </>
      }
      sidebarStatus={
        <div className="channel-sidebar-status">
          {textAccessNotice && <p role="status">{textAccessNotice}</p>}
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
        ) : channelId && !selected ? (
          <section
            className="grid min-h-80 flex-1 content-center gap-3 p-6 text-center"
            role="status"
          >
            <h2 className="text-lg font-semibold">
              {content.isPending || content.isFetching
                ? 'Đang mở kênh…'
                : content.hasNextPage
                  ? 'Kênh chưa có trong các trang đã tải'
                  : 'Kênh không còn khả dụng'}
            </h2>
            <p>
              {content.isPending || content.isFetching
                ? 'Đang kiểm tra kênh và quyền truy cập…'
                : content.isError
                  ? message(content.error)
                  : content.hasNextPage
                    ? 'Dùng Xem thêm kênh để tiếp tục kiểm tra quyền truy cập.'
                    : 'Kênh không tồn tại hoặc bạn không có quyền truy cập.'}
            </p>
          </section>
        ) : undefined
      }
    />
  );
}
