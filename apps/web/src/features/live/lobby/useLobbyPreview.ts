import { useEffect, useState, useSyncExternalStore } from 'react';
import { LobbyPreview } from './lobby-preview';

export function useLobbyPreview() {
  // Construction is inert; StrictMode may construct twice without opening a device.
  const [preview] = useState(
    () =>
      new LobbyPreview({
        secure: globalThis.isSecureContext === true,
        mediaDevices: globalThis.navigator?.mediaDevices,
        permissions: globalThis.navigator?.permissions,
      }),
  );
  const state = useSyncExternalStore(preview.subscribe, preview.getSnapshot, preview.getSnapshot);
  useEffect(() => {
    preview.start();
    return () => {
      preview.dispose();
    };
  }, [preview]);
  return { state, preview };
}
