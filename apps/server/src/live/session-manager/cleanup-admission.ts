// One application-owned instance is shared by all session transitions.
export class CleanupAdmission {
  private readonly users = new Map<string, number>();
  private readonly sessions = new Map<string, number>();
  private active = 0;

  constructor(private readonly limits = { perUser: 2, perSession: 8, process: 32 }) {
    if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) {
      throw new TypeError('Invalid cleanup admission limits');
    }
    this.limits = { ...limits };
  }

  tryAcquire(userId: string, sessionKey: string): (() => void) | null {
    const user = this.users.get(userId) ?? 0;
    const session = this.sessions.get(sessionKey) ?? 0;
    if (
      user >= this.limits.perUser ||
      session >= this.limits.perSession ||
      this.active >= this.limits.process
    ) {
      return null;
    }
    this.active++;
    this.users.set(userId, user + 1);
    this.sessions.set(sessionKey, session + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      for (const [map, key] of [
        [this.users, userId],
        [this.sessions, sessionKey],
      ] as const) {
        const remaining = (map.get(key) ?? 1) - 1;
        if (remaining > 0) map.set(key, remaining);
        else map.delete(key);
      }
    };
  }

  stats() {
    return { active: this.active, users: this.users.size, sessions: this.sessions.size };
  }
}

export const sessionCleanupAdmission = new CleanupAdmission();
