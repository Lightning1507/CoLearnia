import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionResyncInput } from '@colearnia/contracts';
import { CallControllerOwner } from './callController';
import { createSessionProjectionInitializer } from './sessionProjectionSocket';
import type { SessionProjectionSocket } from './sessionProjectionSocket';
import type { SessionProjectionRuntime } from './sessionProjectionRuntime';

const identity = {
  sessionId: '1'.repeat(24),
  epoch: '10000000-0000-4000-8000-000000000001',
  participantId: '2'.repeat(24),
  callGeneration: 1,
};
type Listener = (packet: unknown) => void;
class Socket implements SessionProjectionSocket {
  connected = true;
  listeners = new Map<string, Set<Listener>>();
  requests: { input: SessionResyncInput; ack: Listener }[] = [];
  on(name: string, listener: Listener) {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(name, set);
  }
  off(name: string, listener: Listener) {
    this.listeners.get(name)?.delete(listener);
  }
  emit(_name: 'session.resync', input: SessionResyncInput, ack: Listener) {
    this.requests.push({ input, ack });
  }
  receive(name: string, packet: unknown) {
    for (const listener of this.listeners.get(name) ?? []) listener(packet);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((count, set) => count + set.size, 0);
  }
}
function snapshot(socket: Socket, sequence = 0) {
  const { input, ack } = socket.requests.at(-1)!;
  const header = {
    ...identity,
    audienceEpoch: 0,
    projectionSequence: sequence,
    policyRevision: 0,
    scope: { type: 'MAIN' },
  };
  socket.receive('session.snapshot', {
    event: 'session.snapshot',
    ...header,
    requestId: input.requestId,
    snapshotId: identity.epoch,
    partIndex: 0,
    partCount: 1,
    fragment: JSON.stringify({
      sessionId: identity.sessionId,
      epoch: identity.epoch,
      phase: 'GUIDANCE',
      policyRevision: 0,
      hostParticipantId: identity.participantId,
      viewer: {
        ...identity,
        sessionId: undefined,
        epoch: undefined,
        role: 'HOST',
        audienceEpoch: 0,
        scope: header.scope,
      },
      participants: [],
      groups: [],
      permissions: {
        publishMic: true,
        publishCamera: true,
        publishScreen: true,
        readBoard: true,
        drawBoard: true,
        freezeBoard: false,
      },
    }),
  });
  ack({
    requestId: input.requestId,
    data: { status: 'completed', result: { snapshotId: identity.epoch, partCount: 1 } },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('session projection call adapter', () => {
  it('unsubscribes immediately when a terminal ACK arrives synchronously during binding', async () => {
    const owner = new CallControllerOwner();
    const socket = new Socket();
    socket.emit = (_name, input, ack) => {
      ack({ requestId: input.requestId, error: { code: 'SESSION_ENDED', message: 'Ended' } });
    };
    await expect(
      owner.acquire(
        identity,
        createSessionProjectionInitializer({ owner, socket, onRuntime: () => {} }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(owner.getSnapshot().status).toBe('idle');
    expect(socket.listenerCount).toBe(0);
    owner.shutdown();
  });

  it('keeps projection across panel subscriptions, preserves unchanged media context on resync, and disposes with ownership', async () => {
    const owner = new CallControllerOwner();
    const socket = new Socket();
    let runtime!: SessionProjectionRuntime;
    let mediaGet!: () => unknown;
    const dispose = vi.fn();
    const initialize = createSessionProjectionInitializer({
      owner,
      socket,
      onRuntime: (value) => {
        runtime = value;
      },
      initialize: (_identity, _signal, media) => {
        const update = vi.spyOn(media, 'updateContext');
        mediaGet = () => update.mock.calls.at(-1)?.[0];
        return dispose;
      },
    });
    await owner.acquire(identity, initialize);
    snapshot(socket);
    expect(runtime.getSnapshot().status).toBe('ready');
    const before = runtime.getSnapshot();
    const unsubscribe = runtime.subscribe(vi.fn());
    unsubscribe();
    runtime.subscribe(vi.fn())();
    expect(runtime.getSnapshot()).toBe(before);
    expect(socket.requests).toHaveLength(1);
    runtime.resync();
    snapshot(socket);
    expect(runtime.getSnapshot().status).toBe('ready');
    expect(mediaGet()).toMatchObject({ projectionSequence: 0 });
    owner.end(identity);
    expect(runtime.getSnapshot().status).toBe('closed');
    expect(socket.listenerCount).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
    snapshot(socket, 99);
    expect(runtime.getSnapshot().status).toBe('closed');
    owner.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans exactly the old generation on terminal ACK and ignores its late ACK after a new acquire', async () => {
    const owner = new CallControllerOwner();
    const socket = new Socket();
    let runtime!: SessionProjectionRuntime;
    const initialize = createSessionProjectionInitializer({
      owner,
      socket,
      onRuntime: (value) => {
        runtime = value;
      },
    });
    await owner.acquire(identity, initialize);
    const old = socket.requests[0]!;
    old.ack({ requestId: old.input.requestId, error: { code: 'SESSION_ENDED', message: 'Ended' } });
    expect(owner.getSnapshot().status).toBe('idle');
    expect(socket.listenerCount).toBe(0);
    await owner.acquire({ ...identity, callGeneration: 2 }, initialize);
    old.ack({ requestId: old.input.requestId, error: { code: 'SESSION_ENDED', message: 'Late' } });
    expect(owner.getSnapshot().status).toBe('active');
    expect(runtime.getSnapshot().status).toBe('syncing');
    owner.shutdown();
  });

  it('disconnect removes listeners and denies data without auto resuming or rejoining', async () => {
    const owner = new CallControllerOwner();
    const socket = new Socket();
    let runtime!: SessionProjectionRuntime;
    await owner.acquire(
      identity,
      createSessionProjectionInitializer({
        owner,
        socket,
        onRuntime: (value) => {
          runtime = value;
        },
      }),
    );
    snapshot(socket);
    const lease = runtime.cache.capture()!;
    socket.connected = false;
    socket.receive('disconnect', 'transport close');
    expect(runtime.getSnapshot().status).toBe('closed');
    expect(lease.signal.aborted).toBe(true);
    expect(socket.listenerCount).toBe(0);
    socket.connected = true;
    socket.receive('connect', undefined);
    expect(socket.requests).toHaveLength(1);
    owner.shutdown();
  });
});
