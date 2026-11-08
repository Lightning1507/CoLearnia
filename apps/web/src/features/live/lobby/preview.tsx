import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LobbyDeviceCheck } from './LobbyDeviceCheck';
import '../../../styles/global.css';

// Isolated Vite development entry; deliberately does not implement session access or join.
if (import.meta.env.DEV) {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <LobbyDeviceCheck
          channelName="Kiểm tra thiết bị"
          onBack={() => window.location.assign('/')}
        />
      </StrictMode>,
    );
  }
}
