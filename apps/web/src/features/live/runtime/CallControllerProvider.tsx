import type { ReactNode } from 'react';
import { CallControllerContext } from './callControllerContext';
import type { CallControllerOwner } from './callController';

export function CallControllerProvider({
  owner,
  children,
}: {
  owner: CallControllerOwner;
  children: ReactNode;
}) {
  return <CallControllerContext.Provider value={owner}>{children}</CallControllerContext.Provider>;
}
