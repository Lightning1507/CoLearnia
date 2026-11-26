import { useEffect, useState } from 'react';

// Expire the feedback without changing the underlying request or device state.
export function useTransientNotice<T>(notice: T | null | undefined) {
  const [current, setCurrent] = useState({ notice, expired: false });
  if (notice !== current.notice) setCurrent({ notice, expired: false });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setCurrent((state) => (state.notice === notice ? { notice, expired: true } : state));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return notice === current.notice && current.expired ? undefined : notice;
}
