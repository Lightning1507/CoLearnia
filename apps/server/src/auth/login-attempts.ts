const windowMs = 60_000;
const maxKeys = 4096;

// A bounded fixed window. Refuse new keys when full instead of evicting active counters.
export function createLoginAttemptLimit(limit: number, now = () => performance.now()) {
  const counts = new Map<string, number>();
  let expiresAt = now() + windowMs;

  return (key: string): number | undefined => {
    const time = now();
    if (time >= expiresAt) {
      counts.clear();
      expiresAt = time + windowMs;
    }
    const count = counts.get(key) ?? 0;
    if (count >= limit || (count === 0 && counts.size >= maxKeys)) {
      return Math.ceil((expiresAt - time) / 1000);
    }
    counts.set(key, count + 1);
    return undefined;
  };
}
