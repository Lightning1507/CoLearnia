import { randomUUID } from 'node:crypto';
import { requestIdSchema, sessionEndInputSchema } from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

type SocketPort = {
  id: string;
  connected: boolean;
  on(
    event: 'session.end',
    listener: (raw: unknown, ack?: (value: unknown) => void) => void,
  ): unknown;
};

// HOST_LEAVE is an explicit host action, never inferred from socket disconnect.
export function attachSessionEndSocket(
  registry: Pick<ReturnType<typeof createMainJoinRegistry>, 'end'>,
  socket: SocketPort,
  readAuth: () => AuthenticatedContext | null,
) {
  socket.on('session.end', (raw, ack) => {
    if (typeof ack !== 'function') return;
    const candidate =
      raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
    const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
    const fail = (code: string) =>
      ack({ requestId, error: { code, message: 'Không thể kết thúc cuộc họp.' } });
    const parsed = sessionEndInputSchema.safeParse(raw);
    if (!parsed.success) {
      fail('VALIDATION_ERROR');
      return;
    }
    const auth = readAuth();
    if (!auth) {
      fail('AUTH_REQUIRED');
      return;
    }
    void registry
      .end({ auth, socketId: socket.id, isConnected: () => socket.connected }, parsed.data)
      .then(ack, (error) =>
        fail(
          error instanceof MainJoinError
            ? error.code
            : error instanceof CoordinationError
              ? 'SERVER_BUSY'
              : 'DEPENDENCY_UNAVAILABLE',
        ),
      );
  });
}
