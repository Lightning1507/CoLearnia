import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AuthenticatedData } from '@colearnia/contracts';
import { AuthScreen } from './AuthScreen';
import { authApi, sessionKey, sessionOptions } from './session';
import { WorkspaceOpen, WorkspacePicker } from '../workspaces/WorkspacePages';
import './auth.css';

// Composition point for SCRUM-34. No fixture identity is used after authentication.
export function AuthBoundary() {
  const client = useQueryClient();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<'active' | 'denied' | 'unknown' | null>(null);
  const [expired, setExpired] = useState(false);
  const logoutInFlight = useRef(false);
  const session = useQuery({
    ...sessionOptions,
    enabled: !submitting && !loggingOut && logoutError !== 'denied' && logoutError !== 'unknown',
  });
  const data = session.data;

  const clearSession = useCallback(async () => {
    await client.cancelQueries({ queryKey: sessionKey, exact: true });
    client.setQueryData(sessionKey, null);
    client.removeQueries({ queryKey: ['workspaces'] });
  }, [client]);

  useEffect(() => {
    if (!data) return;
    const expiresAt = Date.parse(data.expiresAt);
    let timer: number | undefined;
    function checkExpiry() {
      window.clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        void clearSession();
      } else timer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [clearSession, data]);

  async function logout(value: AuthenticatedData) {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLoggingOut(true);
    setLogoutError(null);
    await client.cancelQueries({ queryKey: sessionKey, exact: true });
    try {
      await authApi.logout(value.csrfToken, new AbortController().signal);
      await clearSession();
    } catch {
      try {
        const current = await authApi.me(new AbortController().signal);
        if (current) {
          client.removeQueries({ queryKey: ['workspaces'] });
          client.setQueryData(sessionKey, current);
          setLogoutError('active');
        } else setLogoutError('denied');
      } catch {
        setLogoutError('unknown');
      }
    } finally {
      logoutInFlight.current = false;
      setLoggingOut(false);
    }
  }

  async function start() {
    setSubmitting(true);
    await client.cancelQueries({ queryKey: sessionKey });
  }
  const finish = useCallback(() => setSubmitting(false), []);
  function success(value: AuthenticatedData) {
    setExpired(false);
    setLogoutError(null);
    client.setQueryData(sessionKey, value);
    setSubmitting(false);
  }
  if (session.isPending)
    return (
      <main className="auth-state" role="status">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  if (session.isError && data === undefined)
    return (
      <main className="auth-state">
        <h1>Chưa kiểm tra được phiên đăng nhập</h1>
        <p role="alert">Không kết nối được dịch vụ. Vui lòng kiểm tra kết nối và thử lại.</p>
        <button
          className="auth-primary"
          type="button"
          disabled={session.isFetching}
          onClick={() => void session.refetch()}
        >
          Thử lại
        </button>
      </main>
    );
  if (data) {
    const account = (
      <div>
        <button
          className="auth-secondary"
          type="button"
          disabled={loggingOut}
          onClick={() => void logout(data)}
        >
          {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </button>
        {logoutError && (
          <p role="alert">
            {logoutError === 'active'
              ? 'Trình duyệt vẫn có phiên đăng nhập. Hãy bấm Đăng xuất nếu muốn thoát phiên hiện tại.'
              : 'Chưa xác nhận được việc đăng xuất. Bạn có thể thử lại.'}
          </p>
        )}
      </div>
    );
    if (loggingOut || logoutError === 'denied' || logoutError === 'unknown')
      return <main className="auth-state">{account}</main>;
    if (pathname === '/workspaces')
      return <WorkspacePicker key={data.user.id} session={data} account={account} />;
    if (pathname.startsWith('/workspaces/'))
      return <WorkspaceOpen key={data.user.id} userId={data.user.id} account={account} />;
    return <Navigate to="/workspaces" replace />;
  }
  if (pathname !== '/login' && pathname !== '/register') return <Navigate to="/login" replace />;
  return (
    <>
      {expired && (
        <p className="auth-state" role="status">
          Phiên đăng nhập đã hết hạn.
        </p>
      )}
      <AuthScreen
        key={location.pathname}
        mode={pathname === '/register' ? 'register' : 'login'}
        onStart={start}
        onSuccess={success}
        onFinish={finish}
        onCheckSession={() => void session.refetch()}
        checkWorkspaceList={location.state?.checkWorkspaceList === true}
        sessionCheckFailed={session.isRefetchError}
        sessionChecking={session.isFetching}
      />
    </>
  );
}
