import { createContext, useContext } from 'react';
import type { MainCall } from './mainCall';
export const MainCallContext = createContext<MainCall | null>(null);
export function useMainCall() {
  const value = useContext(MainCallContext);
  if (!value) throw new Error('MainCallProvider is missing');
  return value;
}
