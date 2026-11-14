import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { loginInputSchema, registerInputSchema } from '@colearnia/contracts';
import type { AuthenticatedData } from '@colearnia/contracts';
import { AuthApiError } from './auth-api';
import type { AuthField, AuthMode } from './auth-api';
import { authApi } from './session';
import { AuthBrand } from './AuthBrand';
import './auth.css';

type FormField = AuthField | 'confirmPassword';

type Props = {
  mode: AuthMode;
  onStart: () => Promise<void>;
  onSuccess: (data: AuthenticatedData) => void;
  onCheckSession: () => void;
  onFinish: () => void;
  checkWorkspaceList?: boolean;
  sessionCheckFailed?: boolean;
  sessionChecking?: boolean;
};

export function AuthScreen({
  mode,
  onStart,
  onSuccess,
  onCheckSession,
  onFinish,
  checkWorkspaceList,
  sessionCheckFailed,
  sessionChecking,
}: Props) {
  const [fields, setFields] = useState({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Partial<Record<FormField, string | undefined>>>({});
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirmPassword: false,
  });
  const [failure, setFailure] = useState<AuthApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      onFinish();
    },
    [onFinish],
  );
  useEffect(() => {
    if (!failure?.retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [failure]);
  const wait = Math.max(0, Math.ceil(((failure?.retryAt ?? 0) - now) / 1000));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request.current || wait > 0) return;
    const input = {
      email: fields.email,
      password: fields.password,
      ...(mode === 'register' ? { displayName: fields.displayName } : {}),
    };
    const parsed = (mode === 'register' ? registerInputSchema : loginInputSchema).safeParse(input);
    setFailure(null);
    const next: Partial<Record<FormField, string | undefined>> = {};
    if (mode === 'register') {
      if (!fields.confirmPassword) next.confirmPassword = 'Nhập lại mật khẩu để xác nhận.';
      else if (fields.confirmPassword !== fields.password)
        next.confirmPassword = 'Mật khẩu nhập lại chưa khớp.';
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email') next.email = 'Nhập email hợp lệ (tối đa 254 ký tự).';
        if (field === 'displayName')
          next.displayName = 'Họ và tên cần từ 1 đến 80 ký tự sau khi bỏ khoảng trắng đầu/cuối.';
        if (field === 'password')
          next.password =
            mode === 'register'
              ? 'Mật khẩu cần từ 15 đến 128 ký tự.'
              : 'Nhập mật khẩu từ 1 đến 128 ký tự.';
      }
    }
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      const first = (['displayName', 'email', 'password', 'confirmPassword'] as const).find(
        (field) => next[field],
      );
      form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      await onStart();
      if (controller.signal.aborted) return;
      const data = await authApi.authenticate(mode, parsed.data, controller.signal);
      if (!controller.signal.aborted) onSuccess(data);
    } catch (error) {
      if (controller.signal.aborted) return;
      const known =
        error instanceof AuthApiError
          ? error
          : new AuthApiError(
              'NETWORK_ERROR',
              'Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.',
            );
      setFailure(known);
      setErrors(known.fieldErrors);
      setNow(Date.now());
      summary.current?.focus();
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
        onFinish();
      }
    }
  }

  function field(
    name: FormField,
    label: string,
    type: string,
    autoComplete: string,
    hint?: string,
  ) {
    const error = errors[name];
    const isPassword = name === 'password' || name === 'confirmPassword';
    const visible = isPassword && visiblePasswords[name];
    return (
      <div className="auth-field">
        <label htmlFor={`auth-${name}`}>{label}</label>
        <div className={isPassword ? 'auth-password-control' : undefined}>
          <input
            id={`auth-${name}`}
            name={name}
            type={visible ? 'text' : type}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete={autoComplete}
            value={fields[name]}
            disabled={pending}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={
              [hint ? `auth-${name}-hint` : '', error ? `auth-${name}-error` : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(event) => {
              const updated = { ...fields, [name]: event.target.value };
              setFields(updated);
              if (mode === 'register' && updated.confirmPassword && isPassword) {
                setErrors((previous) => ({
                  ...previous,
                  confirmPassword:
                    updated.confirmPassword === updated.password
                      ? undefined
                      : 'Mật khẩu nhập lại chưa khớp.',
                }));
              }
            }}
            onBlur={() => {
              if (name === 'confirmPassword')
                setErrors((previous) => ({
                  ...previous,
                  confirmPassword: !fields.confirmPassword
                    ? 'Nhập lại mật khẩu để xác nhận.'
                    : fields.confirmPassword !== fields.password
                      ? 'Mật khẩu nhập lại chưa khớp.'
                      : undefined,
                }));
            }}
          />
          {isPassword && (
            <button
              type="button"
              className="auth-password-toggle"
              disabled={pending}
              aria-label={`${visible ? 'Ẩn' : 'Hiện'} ${name === 'confirmPassword' ? 'mật khẩu nhập lại' : 'mật khẩu'}`}
              aria-controls={`auth-${name}`}
              aria-pressed={visible}
              onClick={() =>
                setVisiblePasswords((previous) => ({ ...previous, [name]: !previous[name] }))
              }
            >
              {visible ? 'Ẩn' : 'Hiện'}
            </button>
          )}
        </div>
        {hint && (
          <p id={`auth-${name}-hint`} className="auth-hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={`auth-${name}-error`} className="auth-field-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <main className="auth-layout auth-layout-decorated">
      <AuthBrand />
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-eyebrow">TÀI KHOẢN</p>
        <h1 id="auth-title">
          {mode === 'login' ? 'Đăng nhập vào CoLearnia' : 'Tạo tài khoản CoLearnia'}
        </h1>
        <p className="auth-intro">
          {mode === 'login'
            ? 'Cùng học. Cùng kết nối.'
            : 'Đăng ký xong, bạn sẽ được đăng nhập tự động.'}
        </p>
        <nav className="auth-switch" aria-label="Truy cập tài khoản">
          {(['login', 'register'] as const).map((item) =>
            pending ? (
              <span key={item} aria-disabled="true" className={mode === item ? 'active' : ''}>
                {item === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </span>
            ) : (
              <Link
                key={item}
                to={item === 'login' ? '/login' : '/register'}
                aria-current={mode === item ? 'page' : undefined}
              >
                {item === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </Link>
            ),
          )}
        </nav>
        {checkWorkspaceList && (
          <p role="status">Đăng nhập lại rồi kiểm tra danh sách Workspace trước khi tạo lại.</p>
        )}
        {sessionCheckFailed && (
          <div className="auth-error" role="alert">
            Chưa kiểm tra lại được phiên đăng nhập. Thông tin bạn đang nhập vẫn được giữ.
            <button
              className="auth-secondary"
              type="button"
              disabled={sessionChecking || pending}
              onClick={onCheckSession}
            >
              Thử kiểm tra phiên lại
            </button>
          </div>
        )}
        <form ref={form} onSubmit={(event) => void submit(event)} noValidate aria-busy={pending}>
          {mode === 'register' &&
            field(
              'displayName',
              'Họ và tên',
              'text',
              'name',
              'Họ và tên của bạn sẽ hiển thị trong CoLearnia, ví dụ: Nguyễn Minh Quân.',
            )}
          {field('email', 'Email', 'email', 'username')}
          {field(
            'password',
            'Mật khẩu',
            'password',
            mode === 'register' ? 'new-password' : 'current-password',
            mode === 'register' ? '15–128 ký tự; có thể dùng dấu và khoảng trắng.' : undefined,
          )}
          {mode === 'register' &&
            field('confirmPassword', 'Nhập lại mật khẩu', 'password', 'new-password')}
          <div
            ref={summary}
            tabIndex={-1}
            className={failure ? 'auth-error' : undefined}
            role={failure ? 'alert' : undefined}
          >
            {failure?.message}
            {failure?.code === 'ACCOUNT_CREATED_LOGIN_REQUIRED' && (
              <Link to="/login">Đăng nhập ngay</Link>
            )}
            {failure?.uncertain && (
              <button className="auth-secondary" type="button" onClick={onCheckSession}>
                Kiểm tra phiên lại
              </button>
            )}
          </div>
          <button
            className="auth-primary"
            type="submit"
            disabled={pending || wait > 0 || failure?.code === 'ACCOUNT_CREATED_LOGIN_REQUIRED'}
          >
            {pending
              ? 'Đang xử lý…'
              : wait > 0
                ? `Thử lại sau ${wait} giây`
                : mode === 'login'
                  ? 'Đăng nhập'
                  : 'Đăng ký và tiếp tục'}
          </button>
          {wait > 0 && <p className="auth-hint">Vui lòng chờ trước khi gửi yêu cầu tiếp theo.</p>}
        </form>
      </section>
    </main>
  );
}
