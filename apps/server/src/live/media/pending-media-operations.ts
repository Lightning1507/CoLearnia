import { sameSessionScope } from '@colearnia/contracts';
import type { LiveContext, SessionCleanupRequest } from '@colearnia/contracts';

export function matchesMediaCleanup(context: LiveContext, request: SessionCleanupRequest): boolean {
  if (context.sessionId !== request.sessionId || context.epoch !== request.epoch) return false;
  const { target } = request;
  if (target.type === 'SCOPE') return sameSessionScope(context.scope, target.scope);
  if (
    context.participantId !== target.participantId ||
    !('callGeneration' in request) ||
    context.callGeneration !== request.callGeneration
  )
    return false;
  return (
    target.type === 'PARTICIPANT' ||
    (context.audienceEpoch === target.audienceEpoch &&
      sameSessionScope(context.scope, target.scope))
  );
}

// Track and invalidate under the authority gate. Settling native work removes its own entry.
export function createPendingMediaOperations() {
  const operations = new Set<{ bindings: readonly LiveContext[]; cancel(): void }>();

  return {
    track(bindings: readonly LiveContext[], cancel: () => void) {
      const operation = { bindings, cancel };
      operations.add(operation);
      return () => {
        operations.delete(operation);
      };
    },
    invalidate(request: SessionCleanupRequest) {
      let cleanupPending = false;
      for (const operation of operations) {
        if (!operation.bindings.some((binding) => matchesMediaCleanup(binding, request))) continue;
        operation.cancel();
        if (operations.has(operation)) cleanupPending = true;
      }
      return cleanupPending;
    },
  };
}
