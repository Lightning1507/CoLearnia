import { createContext, useContext, useSyncExternalStore } from 'react';
import type { CallControllerOwner } from './callController';

type CallStateSource = Pick<
  CallControllerOwner,
  'subscribe' | 'getSnapshot' | 'getAudioBlocked' | 'enableAudio'
>;

export const CallControllerContext = createContext<CallStateSource | null>(null);

function useCallSource() {
  const source = useContext(CallControllerContext);
  if (!source) throw new Error('CallControllerProvider is missing');
  return source;
}

export function useCallSnapshot() {
  const source = useCallSource();
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export function useCallAudio() {
  const source = useCallSource();
  const blocked = useSyncExternalStore(source.subscribe, source.getAudioBlocked);
  return { blocked, enable: source.enableAudio };
}
