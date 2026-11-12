import { randomUUID } from 'node:crypto';
import type { AuthenticatedContext, SessionSnapshotPart } from '@colearnia/contracts';
import { describe, expect, it, vi } from 'vitest';
import { attachMainReconnectSocket } from './main-reconnect-signaling.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

function fixture() {
  const handlers = new Map<string, (raw?: unknown, ack?: (value: unknown) => void) => void>();
  const socket = {
    id: randomUUID(),
    connected: true,
    on: (event: string, listener: (raw?: unknown, ack?: (value: unknown) => void) => void) => {
      handlers.set(event, listener);
    },
    emit: vi.fn(),
  };
  const context = {
    sessionId: '1'.repeat(24),
    epoch: randomUUID(),
    callGeneration: 1,
    audienceEpoch: 0,
    policyRevision: 0,
    scope: { type: 'MAIN' },
  };
  const part = context as SessionSnapshotPart;
  const registry = {
    resume: vi.fn(async () => ({ ack: { data: {} }, parts: [part] })),
    resync: vi.fn(async () => ({ ack: { data: {} }, parts: [part] })),
    disconnect: vi.fn(async () => {}),
    withContext: vi.fn(async (_id, _request, use) => use({ ok: true, context })),
  };
  const readAuth = vi.fn<() => AuthenticatedContext | null>(() => ({
    userId: '1'.repeat(24),
    authSessionId: '2'.repeat(24),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }));
  const onError = vi.fn();
  attachMainReconnectSocket(
    registry as unknown as ReturnType<typeof createMainJoinRegistry>,
    socket,
    readAuth,
    onError,
  );
  return {
    socket,
    context,
    registry,
    readAuth,
    onError,
    send: (event: string, raw?: unknown) => {
      const ack = vi.fn();
      handlers.get(event)!(raw, ack);
      return ack;
    },
  };
}
describe('MAIN reconnect signaling', () => {
  it.each(['session.resume', 'session.resync'])(
    'revalidates %s before snapshot delivery',
    async (event) => {
      const f = fixture();
      const { sessionId, epoch, callGeneration } = f.context;
      const command = {
        requestId: randomUUID(),
        sessionId,
        epoch,
        callGeneration,
        ...(event === 'session.resume' ? { resumeTicket: 't'.repeat(43) } : { payload: {} }),
      };
      const ack = f.send(event, command);
      await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
      expect(f.registry.withContext).toHaveBeenCalledOnce();
      expect(f.socket.emit).toHaveBeenCalledWith('session.snapshot', expect.any(Object));
    },
  );
  it('uses only the server socket id for disconnect, regardless of client payload', async () => {
    const f = fixture();
    f.send('disconnect', { socketId: 'another-socket' });
    await vi.waitFor(() => expect(f.registry.disconnect).toHaveBeenCalledWith(f.socket.id));
  });
  it('redacts lifecycle exceptions before reporting', async () => {
    const f = fixture();
    f.registry.disconnect.mockRejectedValueOnce(new Error('private-resume-ticket'));
    f.send('disconnect');
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledWith('DEPENDENCY_UNAVAILABLE'));
    expect(JSON.stringify(f.onError.mock.calls)).not.toContain('private-resume-ticket');
  });
  it('rejects identity supplied by the client', () => {
    const f = fixture();
    const ack = f.send('session.resume', { requestId: randomUUID(), actorId: 'spoofed' });
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(f.registry.resume).not.toHaveBeenCalled();
  });
  it('does not deliver a prepared snapshot after access is revoked', async () => {
    const f = fixture();
    f.registry.withContext.mockImplementationOnce(async (_id, _request, use) =>
      use({ ok: false, errorCode: 'FORBIDDEN' }),
    );
    const { sessionId, epoch, callGeneration } = f.context;
    const ack = f.send('session.resync', {
      requestId: randomUUID(),
      sessionId,
      epoch,
      callGeneration,
      payload: {},
    });
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(f.socket.emit).not.toHaveBeenCalled();
  });
});
