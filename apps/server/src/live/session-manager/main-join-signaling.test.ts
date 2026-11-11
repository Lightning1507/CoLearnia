import { randomUUID } from 'node:crypto';
import type { AuthenticatedContext, SessionSnapshotPart } from '@colearnia/contracts';
import { describe, expect, it, vi } from 'vitest';
import { attachMainJoinSocket } from './main-join-signaling.js';
import type { createMainJoinRegistry } from './main-join-registry.js';

function fixture() {
  let handler!: (raw: unknown, ack?: (value: unknown) => void) => void;
  const socket = {
    id: randomUUID(),
    connected: true,
    on: (_event: 'session.join', listener: typeof handler) => {
      handler = listener;
    },
    emit: vi.fn(),
  };
  const auth = {
    userId: 'fixture',
    authSessionId: 'fixture',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  const part = {
    sessionId: 'session',
    epoch: randomUUID(),
    callGeneration: 1,
    audienceEpoch: 0,
    policyRevision: 0,
    scope: { type: 'MAIN' },
  } as SessionSnapshotPart;
  const registry = {
    join: vi.fn(async () => ({ ack: { data: { status: 'completed' } }, parts: [part] })),
    withContext: vi.fn(async (_socket, _input, use) => use({ ok: true, context: { ...part } })),
  };
  const readAuth = vi.fn<() => AuthenticatedContext | null>(() => auth);
  attachMainJoinSocket(
    registry as unknown as ReturnType<typeof createMainJoinRegistry>,
    socket,
    readAuth,
  );
  const command = { requestId: randomUUID(), ticket: 'opaque-ticket' };
  return {
    socket,
    registry,
    readAuth,
    command,
    send: (raw: unknown = command) => {
      const ack = vi.fn();
      handler(raw, ack);
      return ack;
    },
    noAck: () => handler(command),
  };
}
describe('session.join socket adapter', () => {
  it('enqueues the owner snapshot after rechecking context and echoes the command ack', async () => {
    const f = fixture();
    const ack = f.send();
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(f.registry.withContext).toHaveBeenCalledOnce();
    expect(f.socket.emit).toHaveBeenCalledWith('session.snapshot', expect.any(Object));
    expect(f.registry.join).toHaveBeenCalledWith(
      expect.objectContaining({ socketId: f.socket.id, isConnected: expect.any(Function) }),
      f.command,
    );
  });
  it('ignores mutation without ack and rejects forged client identity', () => {
    const f = fixture();
    f.noAck();
    expect(f.registry.join).not.toHaveBeenCalled();
    const ack = f.send({ ...f.command, actorId: 'spoofed' });
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
  });
  it('rejects unauthenticated sockets', async () => {
    const f = fixture();
    f.readAuth.mockReturnValue(null);
    const ack = f.send();
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_REQUIRED' }) }),
    );
    expect(f.registry.join).not.toHaveBeenCalled();
  });
  it('never emits the prepared snapshot if access is lost before enqueue', async () => {
    const f = fixture();
    f.registry.withContext.mockImplementation(async (_socket, _input, use) =>
      use({ ok: false, errorCode: 'FORBIDDEN' }),
    );
    const ack = f.send();
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(f.socket.emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) }),
    );
  });
  it('redacts unexpected exception details', async () => {
    const f = fixture();
    f.registry.join.mockRejectedValueOnce(new Error('private-token-database-path'));
    const ack = f.send();
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(JSON.stringify(ack.mock.calls)).not.toContain('private-token');
  });
});
