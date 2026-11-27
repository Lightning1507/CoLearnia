import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import { CallControllerProvider } from '../features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../features/live/runtime/callController';
import { WorkspaceFixturePage } from '../features/workspaces/WorkspaceFixturePage';
import { AuthBoundary } from '../features/auth/AuthBoundary';
import { MainCallProvider } from '../features/live/MainCallProvider';
import { sessionOptions } from '../features/auth/session';
import { createTextMemory, TextMemoryContext } from '../features/text/text-memory';

export function App() {
  const [callOwner] = useState(() => new CallControllerOwner());
  const { data: session } = useQuery({ ...sessionOptions, enabled: false });
  const login = session ? session.user.id + ':' + session.expiresAt : undefined;
  const textMemory = useMemo(() => (login ? createTextMemory() : undefined), [login]);

  return (
    <CallControllerProvider owner={callOwner}>
      <MainCallProvider owner={callOwner}>
        <TextMemoryContext.Provider value={textMemory}>
          <Routes>
            <Route path="/" element={<AuthBoundary />} />
            <Route path="/login" element={<AuthBoundary />} />
            <Route path="/register" element={<AuthBoundary />} />
            <Route path="/workspaces" element={<AuthBoundary />} />
            <Route path="/workspaces/:workspaceId" element={<AuthBoundary />} />
            <Route path="/workspaces/:workspaceId/channels/:channelId" element={<AuthBoundary />} />
            <Route
              path="/workspaces/:workspaceId/channels/:channelId/live"
              element={<AuthBoundary />}
            />
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
        </TextMemoryContext.Provider>
      </MainCallProvider>
    </CallControllerProvider>
  );
}
