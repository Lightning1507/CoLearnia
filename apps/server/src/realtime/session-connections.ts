import type { AuthenticatedContext } from '@colearnia/contracts';

export function createSessionConnections(
  onExpire: (auth: AuthenticatedContext) => Promise<boolean>,
  onUnconfirmed: () => void = () => {},
) {
  type Entry = { sockets: Set<() => void>; timer: ReturnType<typeof setTimeout> };
  const sessions = new Map<string, Entry>();

  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;

  async function expire(auth: AuthenticatedContext, attempt = 0) {
    const sessionId = auth.authSessionId;
    try {
      if (await onExpire(auth)) return;
    } catch {
      // A busy coordinator or unavailable adapter can recover on retry.
    }
    if (stopped) return;
    if (attempt >= 4 || retryTimers.size >= 1024) {
      onUnconfirmed();
      return;
    }
    const timer = setTimeout(
      () => {
        retryTimers.delete(sessionId);
        void expire(auth, attempt + 1);
      },
      1000 * 2 ** attempt,
    ).unref();
    retryTimers.set(sessionId, timer);
  }

  function close(authSessionId: string) {
    const entry = sessions.get(authSessionId);
    if (!entry) return;
    sessions.delete(authSessionId);
    clearTimeout(entry.timer);
    for (const disconnect of entry.sockets) disconnect();
  }

  return {
    close,
    stop() {
      stopped = true;
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear();
      for (const id of sessions.keys()) close(id);
    },
    track(auth: AuthenticatedContext, disconnect: () => void) {
      const { authSessionId } = auth;
      const expiresAt = Date.parse(auth.expiresAt);
      let entry = sessions.get(authSessionId);
      if (!entry) {
        const schedule = () =>
          setTimeout(
            () => {
              const current = sessions.get(authSessionId);
              if (!current) return;
              if (expiresAt > Date.now()) {
                current.timer = schedule();
                return;
              }
              close(authSessionId);
              void expire(auth);
            },
            Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)),
          ).unref();
        entry = { sockets: new Set(), timer: schedule() };
        sessions.set(authSessionId, entry);
      }
      entry.sockets.add(disconnect);
      const tracked = entry;
      return () => {
        tracked.sockets.delete(disconnect);
        if (sessions.get(authSessionId) === tracked && tracked.sockets.size === 0) {
          sessions.delete(authSessionId);
          clearTimeout(tracked.timer);
        }
      };
    },
  };
}
