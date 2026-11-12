import { randomUUID } from 'node:crypto';
import {
  requestIdSchema,
  sessionResumeInputSchema,
  sessionResyncInputSchema,
  sessionControlBudget,
  sameSessionScope,
} from '@colearnia/contracts';
import type { AuthenticatedContext, SessionSnapshotPart } from '@colearnia/contracts';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { MainJoinError } from './main-join-registry.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

type Command = 'session.resume' | 'session.resync';
type SocketPort = {
  id: string;
  connected: boolean;
  on(event: Command, listener: (raw: unknown, ack?: (value: unknown) => void) => void): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  emit(event: 'session.snapshot', part: SessionSnapshotPart): unknown;
};
const errorCode = (error: unknown) =>
  error instanceof MainJoinError
    ? error.code
    : error instanceof CoordinationError
      ? 'SERVER_BUSY'
      : 'DEPENDENCY_UNAVAILABLE';

// Attach once alongside attachMainJoinSocket. Error reporting receives safe codes only.
export function attachMainReconnectSocket(
  registry: ReturnType<typeof createMainJoinRegistry>,
  socket: SocketPort,
  readAuth: () => AuthenticatedContext | null,
  onLifecycleError: (code: string) => void,
) {
  socket.on('disconnect', () => {
    void registry.disconnect(socket.id).catch((error) => onLifecycleError(errorCode(error)));
  });
  for (const event of ['session.resume', 'session.resync'] as const) {
    socket.on(event, (raw, ack) => {
      if (typeof ack !== 'function') return;
      const candidate =
        raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
      const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
      let responded = false;
      const reply = (value: unknown) => {
        if (!responded) {
          responded = true;
          ack(value);
        }
      };
      const fail = (code: string) =>
        reply({ requestId, error: { code, message: 'Không thể đồng bộ cuộc gọi.' } });
      const parsed =
        event === 'session.resume'
          ? sessionResumeInputSchema.safeParse(raw)
          : sessionResyncInputSchema.safeParse(raw);
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
        const binding = { auth, socketId: socket.id, isConnected: () => socket.connected };
        const result =
          event === 'session.resume'
            ? await registry.resume(binding, parsed.data)
            : await registry.resync(binding, parsed.data);
        const first = result.parts[0];
        if (!first) throw new MainJoinError('INTERNAL_ERROR');
        await registry.withContext(
          socket.id,
          { sessionId: first.sessionId, epoch: first.epoch, callGeneration: first.callGeneration },
          (resolved) => {
            if (!resolved.ok) {
              fail(resolved.errorCode);
              return;
            }
            if (
              !socket.connected ||
              resolved.context.policyRevision !== first.policyRevision ||
              resolved.context.audienceEpoch !== first.audienceEpoch ||
              !sameSessionScope(resolved.context.scope, first.scope)
            ) {
              fail('CONFLICT');
              return;
            }
            reply(result.ack);
            for (const part of result.parts) socket.emit('session.snapshot', part);
          },
        );
      })().catch((error) => fail(errorCode(error)));
    });
  }
}
