import { useSyncExternalStore } from 'react';

const themeKey = 'colearnia.workspace.theme';
const themeEvent = 'colearnia-workspace-theme';

function readTheme() {
  try {
    return localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function subscribeTheme(listener: () => void) {
  window.addEventListener(themeEvent, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useWorkspaceTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'light');
  function toggle() {
    try {
      localStorage.setItem(themeKey, theme === 'dark' ? 'light' : 'dark');
      window.dispatchEvent(new Event(themeEvent));
    } catch {
      // Storage is optional in restricted browser contexts.
    }
  }
  return { theme, toggle };
}

const drawerQuery = '(max-width: 720px)';
function subscribeDrawer(listener: () => void) {
  const query = window.matchMedia?.(drawerQuery);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
export function useWorkspaceDrawer() {
  return useSyncExternalStore(
    subscribeDrawer,
    () => window.matchMedia?.(drawerQuery).matches ?? false,
    () => false,
  );
}

export function workspaceInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase('vi');
}
