import { useSyncExternalStore } from 'react';
import type { SessionProjectionRuntime } from './sessionProjectionRuntime';

export function useSessionProjection(runtime: SessionProjectionRuntime) {
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}

export function useAudienceValue<T>(runtime: SessionProjectionRuntime, key: string) {
  useSessionProjection(runtime);
  const lease = runtime.cache.capture();
  return useSyncExternalStore(runtime.cache.subscribe, () =>
    lease ? runtime.cache.read<T>(lease, key) : undefined,
  );
}
