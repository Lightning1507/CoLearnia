import type { ReactNode } from 'react';
import { CallControllerContext } from './call-controller-context';
import type { CallControllerOwner } from './call-controller';

export function CallControllerProvider({
  owner,
  children,
}: {
  owner: CallControllerOwner;
  children: ReactNode;
}) {
  return <CallControllerContext.Provider value={owner}>{children}</CallControllerContext.Provider>;
}
