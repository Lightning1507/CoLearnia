import { createContext, useContext, useSyncExternalStore } from 'react';
import type { CallControllerOwner } from './call-controller';

type CallStateSource = Pick<CallControllerOwner, 'subscribe' | 'getSnapshot'>;

export const CallControllerContext = createContext<CallStateSource | null>(null);

export function useCallSnapshot() {
  const source = useContext(CallControllerContext);
  if (!source) throw new Error('CallControllerProvider is missing');
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}
