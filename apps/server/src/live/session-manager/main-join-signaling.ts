import { randomUUID } from 'node:crypto';
import {
  requestIdSchema,
  sessionJoinInputSchema,
  sessionControlBudget,
  sameSessionScope,
} from '@colearnia/contracts';
import type { AuthenticatedContext, SessionSnapshotPart } from '@colearnia/contracts';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

type SocketPort = {
  id: string;
  connected: boolean;
  on(
    event: 'session.join',
    listener: (raw: unknown, ack?: (value: unknown) => void) => void,
  ): unknown;
  emit(event: 'session.snapshot', part: SessionSnapshotPart): unknown;
};

// readAuth is supplied by M1's authenticated socket adapter, never from the payload.
// Attach once per socket. Disconnect/reconnect/host election remain separate lifecycle tasks.
export function attachMainJoinSocket(
  registry: ReturnType<typeof createMainJoinRegistry>,
  socket: SocketPort,
  readAuth: () => AuthenticatedContext | null,
) {
  socket.on('session.join', (raw, ack) => {
    if (typeof ack !== 'function') return;
    const candidate =
      raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
    const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
    let responded = false;
    function reply(value: unknown) {
      if (responded) return;
      responded = true;
      ack!(value);
    }
    const fail = (code: string) =>
      reply({ requestId, error: { code, message: 'Không thể tham gia cuộc gọi.' } });
    const parsed = sessionJoinInputSchema.safeParse(raw);
    if (!parsed.success) {
      fail('VALIDATION_ERROR');
      return;
    }
    if (Buffer.byteLength(JSON.stringify(parsed.data)) > sessionControlBudget.maxControlBytes) {
      fail('PAYLOAD_TOO_LARGE');
      return;
    }
    void (async () => {
      const auth = readAuth();
      if (!auth) {
        fail('AUTH_REQUIRED');
        return;
      }
      const result = await registry.join(
        { auth, socketId: socket.id, isConnected: () => socket.connected },
        parsed.data,
      );
      const first = result.parts[0];
      if (!first) throw new MainJoinError('INTERNAL_ERROR');
      await registry.withContext(
        socket.id,
        {
          sessionId: first.sessionId,
          epoch: first.epoch,
          callGeneration: first.callGeneration,
        },
        (resolved) => {
          if (!resolved.ok) {
            fail(resolved.errorCode);
            return;
          }
          if (
            resolved.context.policyRevision !== first.policyRevision ||
            resolved.context.audienceEpoch !== first.audienceEpoch ||
            !sameSessionScope(resolved.context.scope, first.scope)
          ) {
            fail('CONFLICT');
            return;
          }
          reply(result.ack);
          // Synchronous enqueue only, after current ownership/access revalidation.
          for (const part of result.parts) socket.emit('session.snapshot', part);
        },
      );
    })().catch((error) =>
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
