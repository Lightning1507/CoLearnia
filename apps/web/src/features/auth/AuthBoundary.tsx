import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AuthenticatedData } from '@colearnia/contracts';
import { AuthScreen } from './AuthScreen';
import { sessionKey, sessionOptions } from './session';
import './auth.css';

// Composition point for SCRUM-34. No fixture identity is used after authentication.
export function AuthBoundary() {
  const client = useQueryClient();
  const location = useLocation();
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
  if (session.isError)
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
    if (location.pathname !== '/') return <Navigate to="/" replace />;
    return (
      <main className="auth-layout">
        <section className="auth-brand" aria-label="CoLearnia">
          <span className="auth-mark" aria-hidden="true">
            C
          </span>
          <strong>CoLearnia</strong>
        </section>
        <section className="auth-card" aria-labelledby="account-title">
          <p className="auth-eyebrow">TÀI KHOẢN</p>
          <h1 id="account-title">Chào {data.user.displayName}</h1>
          <p className="auth-intro">Bạn đã đăng nhập bằng {data.user.email}.</p>
          <p className="auth-intro">Phiên đăng nhập sẽ được kiểm tra lại khi bạn tải lại trang.</p>
        </section>
      </main>
    );
  }
  if (location.pathname === '/') return <Navigate to="/login" replace />;
  return (
    <AuthScreen
      key={location.pathname}
      mode={location.pathname === '/register' ? 'register' : 'login'}
      onStart={start}
      onSuccess={success}
      onFinish={finish}
      onCheckSession={() => void session.refetch()}
    />
  );
}
