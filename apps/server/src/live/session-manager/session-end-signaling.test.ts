import { randomUUID } from 'node:crypto';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { describe, expect, it, vi } from 'vitest';
import { attachSessionEndSocket } from './session-end-signaling.js';
import { MainJoinError } from './main-join-registry.js';

function setup() {
  let handler!: (raw: unknown, ack?: (value: unknown) => void) => void;
  const command = {
    requestId: randomUUID(),
    sessionId: '100000000000000000000001',
    epoch: randomUUID(),
    callGeneration: 1,
    expectedPolicyRevision: 1,
    action: 'HOST_LEAVE',
  };
  const auth: AuthenticatedContext = {
    userId: '100000000000000000000002',
    authSessionId: '100000000000000000000003',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const readAuth = vi.fn<() => AuthenticatedContext | null>(() => auth);
  const result = {
    requestId: command.requestId,
    data: {
      status: 'completed' as const,
      result: {
        sessionId: command.sessionId,
        epoch: command.epoch,
        state: 'ENDED' as const,
        cleanupPending: false,
      },
    },
  };
  const registry = { end: vi.fn(async () => result) };
  const socket = {
    id: randomUUID(),
    connected: true,
    on: (_event: 'session.end', listener: typeof handler) => {
      handler = listener;
    },
  };
  attachSessionEndSocket(registry, socket, readAuth);
  return { command, registry, socket, readAuth, handler, result };
}
describe('session.end signaling', () => {
  it('passes server identity and explicit host leave through the shared registry', async () => {
    const f = setup();
    const ack = vi.fn();
    f.handler(f.command, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith(f.result));
    expect(f.registry.end).toHaveBeenCalledWith(
      expect.objectContaining({ socketId: f.socket.id, isConnected: expect.any(Function) }),
      f.command,
    );
  });
  it('ignores a command without ack and rejects client-supplied identity', () => {
    const f = setup();
    f.handler(f.command);
    expect(f.registry.end).not.toHaveBeenCalled();
    const ack = vi.fn();
    f.handler({ ...f.command, userId: 'spoofed' }, ack);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
  });
  it('rejects unauthenticated sockets before entering the registry', () => {
    const f = setup();
    f.readAuth.mockReturnValue(null);
    const ack = vi.fn();
    f.handler(f.command, ack);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_REQUIRED' }) }),
    );
    expect(f.registry.end).not.toHaveBeenCalled();
  });
  it.each([new MainJoinError('FORBIDDEN'), new Error('private-DB-token')])(
    'maps registry errors without leaking details',
    async (error) => {
      const f = setup();
      f.registry.end.mockRejectedValueOnce(error);
      const ack = vi.fn();
      f.handler(f.command, ack);
      await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
      expect(JSON.stringify(ack.mock.calls)).not.toContain('private');
    },
  );
});
