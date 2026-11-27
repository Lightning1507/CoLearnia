import { createContext } from 'react';

export const MeetingNavigation = createContext<{
  focused: boolean;
  open: boolean;
  close: () => void;
} | null>(null);

export const CallDockRegistration = createContext<
  ((element: HTMLDivElement | null) => void) | null
>(null);
