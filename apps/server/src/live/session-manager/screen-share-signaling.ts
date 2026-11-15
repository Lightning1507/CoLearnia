import { randomUUID } from 'node:crypto';
import {
  requestIdSchema,
  sameSessionScope,
  screenAcquireInputSchema,
  screenReleaseInputSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

type ScreenCommand = 'screen.acquire' | 'screen.release';
type SocketPort = {
  id: string;
  connected: boolean;
  on(
    event: ScreenCommand,
    listener: (raw: unknown, ack?: (value: unknown) => void) => void,
  ): unknown;
};

export function attachScreenShareSocket(
  registry: Pick<ReturnType<typeof createMainJoinRegistry>, 'withContext'>,
  socket: SocketPort,
  readAuth: () => AuthenticatedContext | null,
) {
  for (const event of ['screen.acquire', 'screen.release'] as const) {
    socket.on(event, (raw, ack) => {
      if (typeof ack !== 'function') return;
      const schema =
        event === 'screen.acquire' ? screenAcquireInputSchema : screenReleaseInputSchema;
      const parsed = schema.safeParse(raw);
      const candidate =
        raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
      const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
      const error = (code: string) => ({
        requestId,
        error: { code, message: 'Không thể xử lý yêu cầu chia sẻ màn hình.' },
      });
      const completed = (result: unknown) => ({
        requestId,
        data: { status: 'completed', result },
      });
      if (!parsed.success) return ack(error('VALIDATION_ERROR'));
      const auth = readAuth();
      if (!auth || !socket.connected) return ack(error('AUTH_REQUIRED'));
      const { sessionId, epoch, callGeneration, expectedPolicyRevision, payload } = parsed.data;
      void registry
        .withContext(
          socket.id,
          { sessionId, epoch, callGeneration },
          (resolved, _, _policy, share) => {
            if (!resolved.ok) return error(resolved.errorCode);
            const { context } = resolved;
            if (
              !socket.connected ||
              context.auth.userId !== auth.userId ||
              context.auth.authSessionId !== auth.authSessionId
            )
              return error('AUTH_REQUIRED');
            if (!share) return error('DEPENDENCY_UNAVAILABLE');
            if ('scope' in payload) {
              if (
                context.policyRevision !== expectedPolicyRevision ||
                !sameSessionScope(context.scope, payload.scope)
              )
                return error('CONFLICT');
              const acquired = share.leases.acquireHeld(share.held);
              if (!acquired.ok) return error(acquired.errorCode);
              const { leaseId, leaseGeneration, expiresAtMs } = acquired.value;
              return completed({
                leaseId,
                leaseGeneration,
                expiresAt: new Date(expiresAtMs).toISOString(),
              });
            }
            // An unrelated revision change must not block cleanup of the exact reservation.
            return completed({ released: share.leases.stopHeld(share.held, payload) });
          },
        )
        .then(ack, (cause) =>
          ack(
            error(
              cause instanceof MainJoinError
                ? cause.code
                : cause instanceof CoordinationError
                  ? 'SERVER_BUSY'
                  : 'DEPENDENCY_UNAVAILABLE',
            ),
          ),
        );
    });
  }
}
