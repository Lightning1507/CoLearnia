import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { CallControllerProvider } from '../features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../features/live/runtime/callController';
import { WorkspaceFixturePage } from '../features/workspaces/WorkspaceFixturePage';
import { AuthBoundary } from '../features/auth/AuthBoundary';

export function App() {
  const [callOwner] = useState(() => new CallControllerOwner());

  return (
    <CallControllerProvider owner={callOwner}>
      <Routes>
        <Route path="/" element={<AuthBoundary />} />
        <Route path="/login" element={<AuthBoundary />} />
        <Route path="/register" element={<AuthBoundary />} />
        <Route path="/workspaces" element={<AuthBoundary />} />
        <Route path="/workspaces/:workspaceId" element={<AuthBoundary />} />
        <Route path="/workspace" element={<WorkspaceFixturePage />} />
        <Route
          path="*"
          element={
            <main className="not-found">
              <h1>Không tìm thấy trang</h1>
              <Link to="/">Về trang chính</Link>
            </main>
          }
        />
      </Routes>
    </CallControllerProvider>
  );
}
