import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { workspaceNameSchema } from '@colearnia/contracts';
import type { AuthenticatedData } from '@colearnia/contracts';
import { authApi, sessionKey } from '../auth/session';
import { WorkspaceApiError, workspaceApi } from './workspace-api';
import './workspace-picker.css';

const roles = { OWNER: 'Chủ Workspace', ADMIN: 'Quản trị viên', MEMBER: 'Thành viên' };
const listKey = (userId: string) => ['workspaces', userId, 'list'] as const;
const retryWindowMs = 600_000;
type Attempt = { name: string; requestId: string; startedAt: number };
type CreateIssue =
  'invalid' | 'csrf' | 'unknown' | 'conflict' | 'forbidden' | 'busy' | 'replay-unavailable';

const issueMessages: Record<CreateIssue, string> = {
  invalid: 'Tên Workspace cần từ 2 đến 80 ký tự.',
  csrf: 'Chưa xác nhận được phiên gửi yêu cầu. Hãy kiểm tra phiên rồi thử lại.',
  unknown: 'Chưa xác nhận được kết quả tạo. Hãy kiểm tra danh sách trước khi gửi lại.',
  conflict: 'Yêu cầu này xung đột với một lần tạo trước. Hãy kiểm tra danh sách.',
  forbidden: 'Bạn không còn quyền truy cập Workspace của lần tạo trước.',
  busy: 'Hệ thống đang bận. Vui lòng thử lại sau.',
  'replay-unavailable': 'Không thể đối chiếu yêu cầu cũ. Hãy kiểm tra danh sách trước khi tạo mới.',
};

export function WorkspacePicker({ session }: { session: AuthenticatedData }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [issue, setIssue] = useState<CreateIssue | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [expiredAttempt, setExpiredAttempt] = useState<string>();
  useEffect(() => {
    if (!attempt) return;
    const timer = window.setTimeout(
      () => setExpiredAttempt(attempt.requestId),
      Math.max(0, retryWindowMs - (Date.now() - attempt.startedAt)),
    );
    return () => window.clearTimeout(timer);
  }, [attempt]);
  const retryExpired = attempt !== null && expiredAttempt === attempt.requestId;
  const [updating, setUpdating] = useState(false);
  const submitting = useRef(false);
  const key = listKey(session.user.id);
  const list = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => workspaceApi.list(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    gcTime: 0,
    retry: false,
  });
  const create = useMutation({
    mutationFn: async ({ input, replay }: { input: Attempt; replay: boolean }) => {
      function post(csrfToken: string) {
        if (Date.now() - input.startedAt >= retryWindowMs)
          throw new WorkspaceApiError(410, 'WORKSPACE_REPLAY_UNAVAILABLE');
        return workspaceApi.create(replay ? { ...input, replayOnly: true } : input, csrfToken);
      }
      try {
        return await post(session.csrfToken);
      } catch (error) {
        if (!(error instanceof WorkspaceApiError && error.code === 'CSRF_INVALID')) throw error;
        const refreshed = await authApi.me(AbortSignal.timeout(12_000));
        if (refreshed?.user.id !== session.user.id)
          throw new WorkspaceApiError(401, 'AUTH_REQUIRED');
        client.setQueryData(sessionKey, refreshed);
        return post(refreshed.csrfToken);
      }
    },
    networkMode: 'always',
    retry: false,
    gcTime: 0,
  });
  const items = [
    ...new Map(
      list.data?.pages.flatMap((page) => page.items.map((item) => [item.id, item] as const)),
    ).values(),
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || (attempt && (!reviewed || issue !== 'unknown'))) return;
    if (attempt && Date.now() - attempt.startedAt >= retryWindowMs) {
      setReviewed(false);
      return;
    }
    const parsed = workspaceNameSchema.safeParse(name);
    if (!parsed.success) {
      setIssue('invalid');
      return;
    }
    const input = attempt ?? {
      name: parsed.data,
      requestId: crypto.randomUUID(),
      startedAt: Date.now(),
    };
    submitting.current = true;
    setIssue(null);
    setReviewed(false);
    try {
      const workspace = await create.mutateAsync({ input, replay: attempt !== null });
      if (client.getQueryData<AuthenticatedData>(sessionKey)?.user.id !== session.user.id) return;
      void client.invalidateQueries({ queryKey: key });
      navigate(`/workspaces/${workspace.id}`);
    } catch (error) {
      if (client.getQueryData<AuthenticatedData>(sessionKey)?.user.id !== session.user.id) return;
      if (error instanceof WorkspaceApiError && error.status === 401) {
        client.setQueryData(sessionKey, null);
        navigate('/login', { replace: true, state: { checkWorkspaceList: true } });
        return;
      }
      const code = error instanceof WorkspaceApiError ? error.code : '';
      if (code === 'VALIDATION_ERROR' || code === 'CSRF_INVALID' || code === 'SERVER_BUSY') {
        setIssue(
          code === 'VALIDATION_ERROR' ? 'invalid' : code === 'CSRF_INVALID' ? 'csrf' : 'busy',
        );
        // A rejected retry does not settle an earlier ambiguous POST.
        if (attempt) {
          setAttempt(attempt);
          setIssue('unknown');
        }
      } else if (code === 'WORKSPACE_REPLAY_UNAVAILABLE') {
        setAttempt(input);
        setIssue('replay-unavailable');
      } else {
        setAttempt(input);
        setIssue(code === 'CONFLICT' ? 'conflict' : code === 'FORBIDDEN' ? 'forbidden' : 'unknown');
      }
    } finally {
      submitting.current = false;
    }
  }

  async function checkList() {
    setUpdating(true);
    setReviewed(false);
    try {
      const result = await list.refetch();
      setReviewed(result.isSuccess);
    } finally {
      setUpdating(false);
    }
  }

  const sessionLost = list.error instanceof WorkspaceApiError && list.error.status === 401;
  return (
    <main className="workspace-picker">
      <header className="workspace-picker-header">
        <strong>CoLearnia</strong>
        <span>{session.user.displayName}</span>
      </header>
      <div className="workspace-picker-content">
        <div className="workspace-picker-heading">
          <h1>Workspace của bạn</h1>
          {!formOpen && (
            <button className="auth-primary" onClick={() => setFormOpen(true)}>
              Tạo Workspace
            </button>
          )}
        </div>
        {formOpen && (
          <form
            className="workspace-picker-form auth-field"
            onSubmit={(event) => void submit(event)}
            noValidate
            aria-busy={create.isPending}
          >
            <label htmlFor="workspace-name">Tên Workspace</label>
            <input
              autoFocus
              id="workspace-name"
              value={name}
              readOnly={Boolean(attempt)}
              disabled={create.isPending}
              aria-invalid={issue === 'invalid'}
              aria-describedby={issue ? 'workspace-create-error' : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {issue && (
              <p role="alert" id="workspace-create-error">
                {issueMessages[issue]}
              </p>
            )}
            {attempt && reviewed && (
              <p role="status">
                Đã tải lại danh sách. Kiểm tra kết quả trước khi quyết định gửi lại.
              </p>
            )}
            {retryExpired && (
              <p role="status">
                Đã hết thời gian gửi lại. Hãy kiểm tra danh sách trước khi tạo mới.
              </p>
            )}
            {attempt && issue === 'unknown' && !retryExpired && (
              <p className="auth-hint">
                Trong vòng 10 phút, máy chủ chỉ xử lý lại yêu cầu đã ghi nhận.
              </p>
            )}
            <div className="workspace-picker-actions">
              {(!attempt || (issue === 'unknown' && reviewed && !retryExpired)) && (
                <button className="auth-primary" disabled={create.isPending || updating}>
                  {create.isPending
                    ? 'Đang tạo…'
                    : attempt
                      ? 'Gửi lại yêu cầu cũ'
                      : 'Tạo Workspace'}
                </button>
              )}
              {attempt && (
                <button
                  type="button"
                  className="auth-secondary"
                  disabled={updating || create.isPending}
                  onClick={() => void checkList()}
                >
                  {updating ? 'Đang kiểm tra…' : 'Tải lại danh sách'}
                </button>
              )}
              <button
                type="button"
                className="auth-secondary"
                disabled={create.isPending || updating}
                onClick={() => {
                  setFormOpen(false);
                  setName('');
                  setIssue(null);
                  setAttempt(null);
                  setReviewed(false);
                }}
              >
                {attempt ? 'Đóng yêu cầu này' : 'Hủy'}
              </button>
            </div>
          </form>
        )}
        {list.isPending && <p role="status">Đang tải Workspace…</p>}
        {list.isError && (
          <div role="alert">
            <p>
              {sessionLost ? 'Phiên đăng nhập đã hết hạn.' : 'Chưa tải được danh sách Workspace.'}
            </p>
            {sessionLost ? (
              <button
                className="auth-secondary"
                onClick={() => client.setQueryData(sessionKey, null)}
              >
                Đăng nhập lại
              </button>
            ) : (
              <button
                className="auth-secondary"
                disabled={list.isFetching}
                onClick={() => void list.refetch()}
              >
                Thử lại
              </button>
            )}
          </div>
        )}
        {!list.isError && items.length > 0 && (
          <ul className="workspace-picker-grid">
            {items.map((item) => (
              <li key={item.id}>
                <Link className="workspace-picker-card" to={`/workspaces/${item.id}`}>
                  <strong>{item.name}</strong>
                  <span>{roles[item.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.isSuccess && items.length === 0 && !list.hasNextPage && (
          <section className="workspace-picker-empty">
            <h2>Bạn chưa có Workspace nào</h2>
            {!formOpen && (
              <button className="auth-primary" onClick={() => setFormOpen(true)}>
                Tạo Workspace đầu tiên
              </button>
            )}
          </section>
        )}
        {list.hasNextPage && !list.isError && (
          <button
            className="auth-secondary"
            disabled={list.isFetching}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm Workspace'}
          </button>
        )}
      </div>
    </main>
  );
}

export function WorkspaceOpen({ userId }: { userId: string }) {
  const { workspaceId = '' } = useParams();
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ['workspaces', userId, 'open', workspaceId],
    queryFn: ({ signal }) => workspaceApi.open(workspaceId, signal),
    gcTime: 0,
    retry: false,
  });
  if (result.isPending)
    return (
      <main className="auth-state" role="status">
        Đang mở Workspace…
      </main>
    );
  if (result.isError) {
    const status = result.error instanceof WorkspaceApiError ? result.error.status : 0;
    return (
      <main className="auth-state">
        <h1>
          {status === 404
            ? 'Không tìm thấy Workspace'
            : status === 401
              ? 'Phiên đăng nhập đã hết hạn'
              : 'Chưa mở được Workspace'}
        </h1>
        {status === 401 ? (
          <button className="auth-secondary" onClick={() => client.setQueryData(sessionKey, null)}>
            Đăng nhập lại
          </button>
        ) : (
          status !== 404 && (
            <button className="auth-secondary" onClick={() => void result.refetch()}>
              Thử lại
            </button>
          )
        )}
        <Link to="/workspaces">Về danh sách Workspace</Link>
      </main>
    );
  }
  return (
    <main className="workspace-picker">
      <header className="workspace-picker-header">
        <Link to="/workspaces">Workspace của bạn</Link>
      </header>
      <section className="workspace-picker-content">
        <h1>{result.data.name}</h1>
        <p>{roles[result.data.role]}</p>
      </section>
    </main>
  );
}
