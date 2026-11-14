import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AuthenticatedData } from '@colearnia/contracts';
import { AuthScreen } from './AuthScreen';
import { sessionKey, sessionOptions } from './session';
import { WorkspaceOpen, WorkspacePicker } from '../workspaces/WorkspacePages';
import './auth.css';

// Composition point for SCRUM-34. No fixture identity is used after authentication.
export function AuthBoundary() {
  const client = useQueryClient();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const [submitting, setSubmitting] = useState(false);
  const session = useQuery({ ...sessionOptions, enabled: !submitting });
  const data = session.data;
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(
      () => {
        client.setQueryData(sessionKey, null);
        void client.invalidateQueries({ queryKey: sessionKey });
      },
      Math.max(0, Math.min(Date.parse(data.expiresAt) - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [client, data]);

  async function start() {
    setSubmitting(true);
    await client.cancelQueries({ queryKey: sessionKey });
  }
  const finish = useCallback(() => setSubmitting(false), []);
  function success(value: AuthenticatedData) {
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
    if (pathname === '/workspaces') return <WorkspacePicker key={data.user.id} session={data} />;
    if (pathname.startsWith('/workspaces/'))
      return <WorkspaceOpen key={data.user.id} userId={data.user.id} />;
    return <Navigate to="/workspaces" replace />;
  }
  if (pathname !== '/login' && pathname !== '/register') return <Navigate to="/login" replace />;
  return (
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
  );
}
