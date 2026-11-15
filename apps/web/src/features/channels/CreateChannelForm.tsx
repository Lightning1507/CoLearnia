import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { channelNameSchema } from '@colearnia/contracts';
import type {
  AuthenticatedData,
  ChannelAccess,
  ChannelSummary,
  ChannelType,
  CreateChannelInput,
} from '@colearnia/contracts';
import { authApi, sessionKey } from '../auth/session';
import { ChannelApiError, createChannel } from './channel-api';
import './create-channel.css';

type Attempt = { input: CreateChannelInput; startedAt: number };
const retryWindowMs = 600_000;
const messages: Record<string, string> = {
  VALIDATION_ERROR: 'Tên kênh cần từ 1 đến 80 ký tự. Kiểm tra loại kênh và quyền truy cập.',
  CSRF_INVALID: 'Chưa xác nhận được phiên gửi yêu cầu. Hãy thử lại.',
  FORBIDDEN: 'Bạn không còn quyền tạo kênh trong Workspace này.',
  NOT_FOUND: 'Workspace hoặc kênh không còn tồn tại hay bạn không còn quyền quản lý.',
  CONFLICT: 'Yêu cầu cũ có nội dung khác. Hãy kiểm tra kênh đã tạo trước khi tiếp tục.',
  CHANNEL_REPLAY_UNAVAILABLE:
    'Không thể đối chiếu yêu cầu cũ. Hãy kiểm tra kênh đã tạo trước khi tạo mới.',
  SERVER_BUSY: 'Hệ thống đang bận. Vui lòng thử lại sau.',
};

// Mount keyed by User + Workspace. Drafts and responses never cross that boundary.
export function CreateChannelForm({
  workspaceId,
  userId,
  onAccessLost,
}: {
  workspaceId: string;
  userId: string;
  onAccessLost: (message: string) => void;
}) {
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const alive = useRef(false);
  const submitting = useRef(false);
  const titleId = useId();
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('TEXT');
  const [accessMode, setAccessMode] = useState<ChannelAccess>('WORKSPACE');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string>();
  const [invalidName, setInvalidName] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [created, setCreated] = useState<ChannelSummary>();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  function isCurrent(session: AuthenticatedData) {
    const current = client.getQueryData<AuthenticatedData | null>(sessionKey);
    return (
      alive.current &&
      current?.user.id === userId &&
      current.expiresAt === session.expiresAt &&
      current.csrfToken === session.csrfToken &&
      Date.parse(current.expiresAt) > Date.now()
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || blocked) return;
    const parsed = channelNameSchema.safeParse(name);
    if (!parsed.success) {
      setInvalidName(true);
      setError(messages.VALIDATION_ERROR);
      return;
    }
    let session = client.getQueryData<AuthenticatedData | null>(sessionKey);
    if (!session || !isCurrent(session)) {
      onAccessLost('Phiên đăng nhập đã hết hạn.');
      return;
    }
    const operation = attempt ?? {
      input: { name: parsed.data, type, accessMode, requestId: crypto.randomUUID() },
      startedAt: Date.now(),
    };
    if (Date.now() - operation.startedAt >= retryWindowMs) {
      setBlocked(true);
      setError(messages.CHANNEL_REPLAY_UNAVAILABLE);
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(undefined);
    setInvalidName(false);
    try {
      const input = { ...operation.input, ...(attempt && { replayOnly: true as const }) };
      let result: ChannelSummary;
      try {
        result = await createChannel(workspaceId, input, session.csrfToken);
      } catch (failure) {
        if (!(failure instanceof ChannelApiError && failure.code === 'CSRF_INVALID')) throw failure;
        if (!isCurrent(session)) return;
        const refreshed = await authApi.me(AbortSignal.timeout(12_000));
        if (!isCurrent(session)) return;
        if (!refreshed) throw new ChannelApiError(401, 'AUTH_REQUIRED');
        if (refreshed.user.id !== userId || refreshed.expiresAt !== session.expiresAt) {
          void client.invalidateQueries({ queryKey: sessionKey, exact: true });
          return;
        }
        client.setQueryData(sessionKey, refreshed);
        session = refreshed;
        result = await createChannel(workspaceId, input, refreshed.csrfToken);
      }
      if (!isCurrent(session)) return;
      setCreated(result);
      setAttempt(null);
      setName('');
      setType('TEXT');
      setAccessMode('WORKSPACE');
      void client.invalidateQueries({ queryKey: ['channels', userId, workspaceId] });
      close();
    } catch (failure) {
      if (!isCurrent(session)) return;
      const code = failure instanceof ChannelApiError ? failure.code : '';
      if (failure instanceof ChannelApiError && failure.status === 401) {
        client.setQueryData(sessionKey, null);
        onAccessLost('Phiên đăng nhập đã hết hạn. Kiểm tra kết quả tạo sau khi đăng nhập lại.');
        return;
      }
      if (code === 'FORBIDDEN' || code === 'NOT_FOUND') {
        close();
        onAccessLost(messages[code]!);
        return;
      }
      // Only explicit pre-write rejection is safe to edit. An earlier ambiguous POST
      // remains ambiguous even if a later attempt is rejected before reaching service.
      const rejected = ['VALIDATION_ERROR', 'CSRF_INVALID', 'SERVER_BUSY'].includes(code);
      if (!rejected || attempt) setAttempt(operation);
      if (code === 'CHANNEL_REPLAY_UNAVAILABLE' || code === 'CONFLICT') setBlocked(true);
      setError(
        messages[code] ??
          'Chưa xác nhận được kết quả tạo. Bạn có thể đối chiếu bằng yêu cầu cũ; không tạo yêu cầu mới.',
      );
    } finally {
      submitting.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <div className="channel-create">
      <button
        ref={trigger}
        type="button"
        className="auth-primary"
        aria-haspopup="dialog"
        onClick={() => {
          if (!attempt) {
            setError(undefined);
            setInvalidName(false);
          }
          dialog.current?.showModal();
        }}
      >
        {attempt ? 'Kiểm tra yêu cầu tạo kênh' : 'Tạo kênh'}
      </button>
      {created && (
        <p role="status">
          Đã tạo kênh {created.name} · {created.type} ·{' '}
          {created.accessMode === 'PRIVATE'
            ? 'Riêng tư — chưa cấp quyền nội dung'
            : 'Toàn Workspace'}
          .
        </p>
      )}
      {attempt && (
        <p role="status">Có yêu cầu tạo kênh chưa xác nhận. Đóng form không hủy yêu cầu đã gửi.</p>
      )}
      <dialog
        ref={dialog}
        className="channel-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          if (!submitting.current) close();
        }}
      >
        <form onSubmit={(event) => void submit(event)} noValidate aria-busy={pending}>
          <header>
            <h2 id={titleId}>Tạo kênh mới</h2>
            <p>Thiết lập không gian trao đổi cho nhóm.</p>
          </header>
          <div className="channel-dialog-fields">
            <div className="auth-field">
              <label htmlFor={nameId}>Tên kênh</label>
              <input
                id={nameId}
                autoFocus
                value={name}
                placeholder="Ví dụ: nghiên-cứu"
                disabled={pending}
                readOnly={Boolean(attempt)}
                aria-invalid={invalidName}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <fieldset disabled={pending || Boolean(attempt)}>
              <legend>Loại kênh</legend>
              <div className="channel-choices">
                {(['TEXT', 'LIVE'] as const).map((kind) => (
                  <label
                    key={kind}
                    className={type === kind ? 'channel-choice selected' : 'channel-choice'}
                  >
                    <input
                      type="radio"
                      name={`${titleId}-type`}
                      checked={type === kind}
                      onChange={() => setType(kind)}
                    />
                    <span>
                      <strong>{kind}</strong>
                      <small>
                        {kind === 'TEXT'
                          ? 'Trao đổi bằng tin nhắn và tệp'
                          : 'Không gian gọi trực tiếp'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={pending || Boolean(attempt)}>
              <legend>Quyền truy cập</legend>
              <div className="channel-choices">
                {(['WORKSPACE', 'PRIVATE'] as const).map((access) => (
                  <label
                    key={access}
                    className={accessMode === access ? 'channel-choice selected' : 'channel-choice'}
                  >
                    <input
                      type="radio"
                      name={`${titleId}-access`}
                      checked={accessMode === access}
                      onChange={() => setAccessMode(access)}
                    />
                    <span>{access === 'WORKSPACE' ? 'Toàn Workspace' : 'Riêng tư (PRIVATE)'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {accessMode === 'PRIVATE' && (
              <p className="auth-hint">
                Kênh mới chưa cấp quyền nội dung cho ai, kể cả người tạo. Cần thêm thành viên vào
                danh sách quyền PRIVATE trước khi sử dụng.
              </p>
            )}
            {error && (
              <p id={errorId} className="channel-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button type="button" className="auth-secondary" disabled={pending} onClick={close}>
              {attempt ? 'Đóng' : 'Hủy'}
            </button>
            <button className="auth-primary" disabled={pending || blocked}>
              {pending ? 'Đang xử lý…' : attempt ? 'Đối chiếu yêu cầu cũ' : 'Tạo kênh'}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
