import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  AuthenticatedData,
  SessionProjection,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { MainCall } from './mainCall';
import { CallControllerOwner } from './callController';
import { authApi } from '../../auth/session';
import { requestMainTicket, readMainOwnership, mainCommand, waitForMain } from './mainConnection';
import { initializeMainMedia } from './mainMedia';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('./mainMedia', () => ({ initializeMainMedia: vi.fn() }));
vi.mock('./mainConnection', async (original) => ({
  ...(await original<typeof import('./mainConnection')>()),
  requestMainTicket: vi.fn(),
  readMainOwnership: vi.fn(async () => ({})),
}));

const identity = {
  sessionId: '1'.repeat(24),
  epoch: '10000000-0000-4000-8000-000000000001',
  participantId: '2'.repeat(24),
  callGeneration: 1,
};
const preferences = {
  microphone: { enabled: false, deviceId: '' },
  camera: { enabled: false, deviceId: '' },
};
const auth = {
  user: { id: '3'.repeat(24), displayName: 'Việt', email: 'local@example.test' },
  expiresAt: '2099-01-01T00:00:00.000Z',
  csrfToken: 'test',
} as AuthenticatedData;
const target = { channelId: '4'.repeat(24), workspaceId: '5'.repeat(24), channelName: 'Học tập' };
let owner: CallControllerOwner;
let call: MainCall;
let sockets: TestSocket[];
let generation: number;
let policyRevision: number;
const dispose = vi.fn();
const startDevices = vi.fn(async () => {});
function projection(cursor: SessionProjectionCursor): SessionProjection {
  return {
    sessionId: cursor.sessionId,
    epoch: cursor.epoch,
    phase: 'GUIDANCE',
    policyRevision: cursor.policyRevision,
    hostParticipantId: cursor.participantId,
    viewer: {
      participantId: cursor.participantId,
      role: 'HOST',
      callGeneration: cursor.callGeneration,
      audienceEpoch: 0,
      scope: { type: 'MAIN' },
    },
    participants: [{ participantId: cursor.participantId, displayName: 'Việt', role: 'HOST' }],
    groups: [],
    permissions: {
      publishMic: true,
      publishCamera: true,
      publishScreen: true,
      readBoard: true,
      drawBoard: true,
      freezeBoard: false,
    },
  };
}
class TestSocket extends EventEmitter {
  connected = false;
  id = crypto.randomUUID();
  volatile = this;
  requests: { event: string; input: Record<string, unknown> }[] = [];
  responder: ((event: string, input: Record<string, unknown>) => Promise<unknown>) | undefined;
  connect() {
    this.connected = true;
    super.emit('connect');
  }
  disconnect() {
    this.connected = false;
    super.emit('disconnect');
  }
  timeout() {
    return this;
  }
  async emitWithAck(event: string, input: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ event, input });
    if (this.responder) return this.responder(event, input);
    return this.answer(event, input);
  }
  answer(event: string, input: Record<string, unknown>) {
    return {
      requestId: input.requestId,
      data: {
        status: 'completed',
        result:
          event === 'session.end'
            ? {
                sessionId: identity.sessionId,
                epoch: identity.epoch,
                state: 'ENDED',
                cleanupPending: false,
              }
            : {
                participantId: identity.participantId,
                callGeneration: generation,
                resumeTicket: 'A'.repeat(43),
                snapshot: { snapshotId: crypto.randomUUID(), partCount: 1 },
              },
      },
    };
  }
  override emit(event: string, ...args: unknown[]): boolean {
    if (event === 'session.resync') {
      const input = args[0] as { requestId: string };
      const ack = args[1] as (raw: unknown) => void;
      const snapshotId = crypto.randomUUID();
      const cursor: SessionProjectionCursor = {
        ...identity,
        callGeneration: generation,
        scope: { type: 'MAIN' },
        audienceEpoch: 0,
        projectionSequence: 0,
        policyRevision,
      };
      queueMicrotask(() => {
        ack({
          requestId: input.requestId,
          data: { status: 'completed', result: { snapshotId, partCount: 1 } },
        });
        super.emit('session.snapshot', {
          ...cursor,
          event: 'session.snapshot',
          requestId: input.requestId,
          snapshotId,
          partIndex: 0,
          partCount: 1,
          fragment: JSON.stringify(projection(cursor)),
        });
      });
      return true;
    }
    return super.emit(event, ...args);
  }
}
beforeEach(() => {
  generation = 1;
  policyRevision = 1;
  sockets = [];
  dispose.mockClear();
  startDevices.mockClear();
  vi.stubGlobal('window', { location: { href: 'https://colearnia.example.test/' } });
  vi.spyOn(authApi, 'csrf').mockResolvedValue('csrf');
  vi.mocked(io).mockImplementation(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    return socket as unknown as Socket;
  });
  vi.mocked(requestMainTicket).mockResolvedValue({
    ...identity,
    ticket: 'ticket',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  vi.mocked(initializeMainMedia).mockImplementation(
    async ({ projection: runtime, signal, onView }) => {
      await waitForMain(
        () =>
          runtime.getSnapshot().status === 'ready'
            ? (runtime.getSnapshot().projection ?? undefined)
            : undefined,
        runtime.subscribe,
        signal,
      );
      onView({
        projection: runtime.getSnapshot().projection,
        stream: undefined,
        shareLabel: undefined,
      });
      return {
        dispose,
        startDevices,
        inspectAudio: vi.fn(),
        devices: {} as never,
        picker: {} as never,
      };
    },
  );
  owner = new CallControllerOwner();
  call = new MainCall(owner);
  call.setAuth(auth);
  call.open(target);
});
afterEach(() => {
  call.clear();
  owner.shutdown();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('joins once, keeps the call when minimized, and ends using the server role', async () => {
  await Promise.all([call.join(preferences), call.join(preferences)]);
  expect(sockets).toHaveLength(1);
  expect(call.getSnapshot().phase).toBe('active');
  call.expand(false);
  expect(owner.getSnapshot().status).toBe('active');
  await call.leave();
  expect(call.getSnapshot().phase).toBe('idle');
  expect(sockets[0]!.requests.filter(({ event }) => event === 'session.end')).toHaveLength(1);
  expect(owner.getSnapshot().status).toBe('idle');
});
it('reads server ownership in the lobby without joining or capturing devices', async () => {
  vi.mocked(readMainOwnership).mockResolvedValueOnce({ activeCallGeneration: 4 });
  call.open(target);
  await vi.waitFor(() => expect(call.getSnapshot().transferAvailable).toBe(true));
  expect(requestMainTicket).not.toHaveBeenCalled();
  expect(initializeMainMedia).not.toHaveBeenCalled();
});
it('sends takeover only after explicit confirmation, then terminates the old tab without leave/end', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  const context = {
    sessionId: identity.sessionId,
    epoch: identity.epoch,
    callGeneration: generation,
  };
  socket.emit('session.transferred', { ...context, callGeneration: generation + 1 });
  expect(call.getSnapshot().phase).toBe('active');
  socket.emit('session.transferred', context);
  expect(call.getSnapshot().phase).toBe('transferred');
  expect(call.getSnapshot().target).toEqual(target);
  expect(dispose).toHaveBeenCalledOnce();
  expect(
    socket.requests.some(({ event }) => event === 'session.end' || event === 'session.leave'),
  ).toBe(false);
  vi.mocked(requestMainTicket).mockResolvedValueOnce({
    sessionId: identity.sessionId,
    epoch: identity.epoch,
    ticket: 'new-ticket',
    expiresAt: '2099-01-01T00:00:00.000Z',
    activeCallGeneration: generation + 1,
  });
  generation += 2;
  await call.join(preferences, true);
  expect(call.getSnapshot().phase).toBe('active');
  expect(
    sockets[1]!.requests.find(({ event }) => event === 'session.join')?.input.takeover,
  ).toEqual({ confirmed: true, expectedCallGeneration: generation - 1 });
});
it('blocks a known active tab before requesting a ticket and clears account-specific hints on logout', async () => {
  call.clear();
  let receive: ((event: { data: unknown }) => void) | null = null;
  const post = vi.fn();
  const close = vi.fn();
  vi.stubGlobal('window', {
    ...window,
    BroadcastChannel: class {
      set onmessage(listener: (event: { data: unknown }) => void) {
        receive = listener;
      }
      postMessage = post;
      close = close;
    },
  });
  call.setAuth(auth);
  call.open(target);
  receive!({ data: { type: 'active', id: 'other-tab' } });
  await call.join(preferences);
  expect(call.getSnapshot()).toMatchObject({ phase: 'lobby', otherTabActive: true });
  expect(requestMainTicket).not.toHaveBeenCalled();
  expect(io).not.toHaveBeenCalled();
  receive!({ data: { type: 'release', id: 'other-tab' } });
  expect(call.getSnapshot().otherTabActive).toBe(false);
  call.setAuth(null);
  expect(close).toHaveBeenCalledOnce();
  expect(call.getSnapshot().otherTabActive).toBe(false);
});
it('waits after reload-like ownership refusal, refreshes the unconsumed ticket, then joins without takeover', async () => {
  vi.useFakeTimers();
  vi.mocked(io).mockImplementationOnce(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    let first = true;
    socket.responder = async (event, input) => {
      if (event === 'session.join' && first) {
        first = false;
        return {
          requestId: input.requestId,
          error: { code: 'CALL_ALREADY_ACTIVE', message: 'Old ownership' },
        };
      }
      return socket.answer(event, input);
    };
    return socket as unknown as Socket;
  });
  const joining = call.join(preferences);
  await vi.advanceTimersByTimeAsync(0);
  expect(call.getSnapshot().phase).toBe('joining');
  expect(call.getSnapshot().ownershipConflict).toBe(true);
  expect(startDevices).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  await joining;
  expect(call.getSnapshot().phase).toBe('active');
  const tickets = vi.mocked(requestMainTicket).mock.calls;
  expect(tickets).toHaveLength(2);
  expect(tickets[0]![1]).not.toBe(tickets[1]![1]);
  expect(
    sockets[0]!.requests
      .filter(({ event }) => event === 'session.join')
      .every(({ input }) => !('takeover' in input)),
  ).toBe(true);
});
it('keeps an active ownership protected and stops waiting after a bounded reload recovery window', async () => {
  vi.useFakeTimers();
  vi.mocked(io).mockImplementationOnce(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    socket.responder = async (_event, input) => ({
      requestId: input.requestId,
      error: { code: 'CALL_ALREADY_ACTIVE', message: 'Still active' },
    });
    return socket as unknown as Socket;
  });
  const joining = call.join(preferences);
  await vi.advanceTimersByTimeAsync(35000);
  await joining;
  expect(call.getSnapshot()).toMatchObject({ phase: 'lobby', ownershipConflict: true });
  expect(sockets[0]!.requests).toHaveLength(8);
  expect(startDevices).not.toHaveBeenCalled();
  expect(owner.getSnapshot().status).toBe('idle');
});
it('cancels ownership waiting without sending another ticket or late join', async () => {
  vi.useFakeTimers();
  vi.mocked(io).mockImplementationOnce(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    socket.responder = async (_event, input) => ({
      requestId: input.requestId,
      error: { code: 'CALL_ALREADY_ACTIVE', message: 'Still active' },
    });
    return socket as unknown as Socket;
  });
  const joining = call.join(preferences);
  await vi.advanceTimersByTimeAsync(0);
  call.cancel();
  await vi.advanceTimersByTimeAsync(35000);
  await joining;
  expect(vi.mocked(requestMainTicket)).toHaveBeenCalledTimes(1);
  expect(call.getSnapshot().phase).toBe('idle');
  expect(startDevices).not.toHaveBeenCalled();
});
it('ignores a late successful join after cancel and never initializes capture', async () => {
  let reply!: (value: unknown) => void;
  vi.mocked(io).mockImplementationOnce(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    socket.responder = () =>
      new Promise((resolve) => {
        reply = resolve;
      });
    return socket as unknown as Socket;
  });
  const pending = call.join(preferences);
  await vi.waitFor(() => expect(reply).toBeDefined());
  const input = sockets[0]!.requests[0]!;
  call.cancel();
  reply(sockets[0]!.answer(input.event, input.input));
  await pending;
  expect(call.getSnapshot().phase).toBe('idle');
  expect(startDevices).not.toHaveBeenCalled();
});
it('cancels media bootstrap after join ACK while departure ACK is still pending', async () => {
  const initialize = vi.mocked(initializeMainMedia).getMockImplementation()!;
  let release!: () => void;
  let bootstrapSignal!: AbortSignal;
  vi.mocked(initializeMainMedia).mockImplementationOnce(async (input) => {
    bootstrapSignal = input.signal;
    const resources = await initialize(input);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return resources; // Simulate late bootstrap completion despite cancellation.
  });
  const joining = call.join({ ...preferences, microphone: { enabled: true, deviceId: '' } });
  await vi.waitFor(() => expect(release).toBeDefined());
  let departureReply!: (value: unknown) => void;
  const socket = sockets[0]!;
  socket.responder = () =>
    new Promise((resolve) => {
      departureReply = resolve;
    });
  call.cancel();
  expect(bootstrapSignal.aborted).toBe(true);
  await vi.waitFor(() => expect(departureReply).toBeDefined());
  release();
  await joining;
  await vi.waitFor(() => expect(dispose).toHaveBeenCalled());
  expect(startDevices).not.toHaveBeenCalled();
  expect(call.getSnapshot()).toMatchObject({
    phase: 'leaving',
    cleanupPending: true,
    expanded: false,
  });
  expect(socket.connected).toBe(true);
  const request = socket.requests.find(({ event }) => event === 'session.end')!;
  departureReply(socket.answer(request.event, request.input));
  await vi.waitFor(() => expect(call.getSnapshot().phase).toBe('idle'));
  expect(call.canResume()).toBe(false);
});
it('retains the same leave intent after pending cleanup, blocks a new join, then confirms it', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  socket.responder = async (_event, input) => ({
    requestId: input.requestId,
    data: {
      status: 'pending',
      result: {
        sessionId: identity.sessionId,
        epoch: identity.epoch,
        state: 'ENDING',
        cleanupPending: true,
      },
    },
  });
  await call.leave();
  expect(call.getSnapshot().cleanupPending).toBe(true);
  expect(dispose).toHaveBeenCalled();
  call.open({ ...target, channelId: '6'.repeat(24) });
  expect(call.getSnapshot().target?.channelId).toBe(target.channelId);
  socket.responder = async (event, input) => socket.answer(event, input);
  await call.leave();
  const requests = socket.requests.filter(({ event }) => event === 'session.end');
  expect(requests).toHaveLength(4);
  expect(
    requests.every(
      (request) => JSON.stringify(request.input) === JSON.stringify(requests[0]!.input),
    ),
  ).toBe(true);
  expect(call.getSnapshot().phase).toBe('idle');
});
it('accepts a confirmed ENDED acknowledgement while adapter finalization remains pending', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  socket.responder = async (event, input) => {
    const ack = socket.answer(event, input);
    return { ...ack, data: { ...ack.data, result: { ...ack.data.result, cleanupPending: true } } };
  };
  await call.leave();
  expect(call.getSnapshot()).toMatchObject({ phase: 'idle', cleanupPending: false });
  expect(socket.requests.filter(({ event }) => event === 'session.end')).toHaveLength(1);
  expect(owner.getSnapshot().status).toBe('idle');
});
it('automatically reconciles a pending end with the same intent before showing an error', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  let count = 0;
  socket.responder = async (event, input) =>
    ++count === 1
      ? {
          requestId: input.requestId,
          data: {
            status: 'pending',
            result: {
              sessionId: identity.sessionId,
              epoch: identity.epoch,
              state: 'ENDING',
              cleanupPending: true,
            },
          },
        }
      : socket.answer(event, input);
  const leaving = call.leave();
  await vi.waitFor(() =>
    expect(socket.requests.filter(({ event }) => event === 'session.end')).toHaveLength(1),
  );
  expect(call.getSnapshot()).toMatchObject({ phase: 'leaving', expanded: false });
  await leaving;
  const requests = socket.requests.filter(({ event }) => event === 'session.end');
  expect(requests).toHaveLength(2);
  expect(requests[1]!.input).toEqual(requests[0]!.input);
  expect(call.getSnapshot()).toMatchObject({ phase: 'idle', cleanupPending: false });
});
it('cancels pending reconciliation on logout without sending another end request', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  socket.responder = async (_event, input) => ({
    requestId: input.requestId,
    data: {
      status: 'pending',
      result: {
        sessionId: identity.sessionId,
        epoch: identity.epoch,
        state: 'ENDING',
        cleanupPending: true,
      },
    },
  });
  const leaving = call.leave();
  await vi.waitFor(() => expect(call.getSnapshot().message).toContain('Đang tự xác nhận lại'));
  call.setAuth(null);
  await leaving;
  expect(socket.requests.filter(({ event }) => event === 'session.end')).toHaveLength(1);
  expect(call.getSnapshot()).toMatchObject({ phase: 'idle', cleanupPending: false });
});
it('closes old ownership on disconnect and resumes into a new generation with devices off', async () => {
  await call.join({ ...preferences, camera: { enabled: true, deviceId: 'camera-a' } });
  sockets[0]!.disconnect();
  expect(owner.getSnapshot().status).toBe('idle');
  generation = 2;
  await call.resume();
  expect(call.getSnapshot().handle?.identity.callGeneration).toBe(2);
  expect(vi.mocked(initializeMainMedia).mock.calls.at(-1)![0].preferences.camera.enabled).toBe(
    false,
  );
});
it('replays the same resume intent after both ACK attempts are lost and the socket reconnects', async () => {
  await call.join(preferences);
  sockets[0]!.disconnect();
  vi.mocked(io).mockImplementationOnce(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    socket.responder = async () => {
      generation = 2; // Server accepted the intent, but neither ACK reaches the client.
      throw new Error('ACK lost');
    };
    return socket as unknown as Socket;
  });
  await call.resume();
  expect(call.canResume()).toBe(true);
  const lost = sockets[1]!.requests.filter(({ event }) => event === 'session.resume');
  expect(lost).toHaveLength(2);
  await call.resume();
  const replay = sockets[2]!.requests.find(({ event }) => event === 'session.resume')!;
  expect(replay.input).toEqual(lost[0]!.input);
  expect(lost[1]!.input).toEqual(lost[0]!.input);
  expect(call.getSnapshot().handle?.identity.callGeneration).toBe(2);
  sockets[2]!.disconnect();
  generation = 3;
  await call.resume();
  const next = sockets[3]!.requests.find(({ event }) => event === 'session.resume')!;
  expect(next.input.requestId).not.toBe(replay.input.requestId);
  expect(next.input.callGeneration).toBe(2);
});
it('retries a lost ACK with the same request and rejects cancellation before returning a late ACK', async () => {
  const socket = new TestSocket();
  socket.connected = true;
  let attempts = 0;
  socket.responder = async (_event, input) => {
    if (!attempts++) throw new Error('timeout');
    return { requestId: input.requestId };
  };
  const abort = new AbortController();
  const input = { requestId: crypto.randomUUID() };
  await mainCommand(socket as unknown as Socket, 'test', input, abort.signal);
  expect(socket.requests.map(({ input }) => input)).toEqual([input, input]);
  socket.responder = async (_event, value) => {
    abort.abort();
    return { requestId: value.requestId };
  };
  await expect(
    mainCommand(socket as unknown as Socket, 'test', input, abort.signal),
  ).rejects.toThrow();
});
it('does not send reliable MAIN commands through the disposable volatile port', async () => {
  const input = { requestId: crypto.randomUUID() };
  const emitWithAck = vi.fn(async () => ({ requestId: input.requestId }));
  const socket = {
    connected: true,
    timeout: () => ({ emitWithAck }),
    get volatile() {
      throw new Error('A volatile packet could be silently dropped');
    },
  } as unknown as Socket;
  await expect(
    mainCommand(socket, 'session.join', input, new AbortController().signal),
  ).resolves.toEqual({ requestId: input.requestId });
});
it('ignores a late leave ACK after logout without restoring old pending UI', async () => {
  await call.join(preferences);
  let reply!: (value: unknown) => void;
  const socket = sockets[0]!;
  socket.responder = () =>
    new Promise((resolve) => {
      reply = resolve;
    });
  const leaving = call.leave();
  await vi.waitFor(() => expect(reply).toBeDefined());
  call.setAuth(null);
  reply({
    requestId: socket.requests.at(-1)!.input.requestId,
    error: { code: 'CONFLICT', message: 'Changed' },
  });
  await leaving;
  expect(call.getSnapshot()).toMatchObject({
    phase: 'idle',
    cleanupPending: false,
    message: undefined,
  });
  expect(owner.getSnapshot().status).toBe('idle');
});
it('resyncs a definitive policy conflict before issuing a new leave intent', async () => {
  await call.join(preferences);
  const socket = sockets[0]!;
  policyRevision = 2;
  socket.responder = async (_event, input) => ({
    requestId: input.requestId,
    error: { code: 'CONFLICT', message: 'Changed' },
  });
  await call.leave();
  expect(call.getSnapshot().cleanupPending).toBe(true);
  socket.responder = async (event, input) => socket.answer(event, input);
  await call.leave();
  const requests = socket.requests.filter(({ event }) => event === 'session.end');
  expect(requests).toHaveLength(2);
  expect(requests[0]!.input.expectedPolicyRevision).toBe(1);
  expect(requests[1]!.input.expectedPolicyRevision).toBe(2);
  expect(requests[1]!.input.requestId).not.toBe(requests[0]!.input.requestId);
  expect(call.getSnapshot().phase).toBe('idle');
});
