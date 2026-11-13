import { afterEach, describe, expect, it, vi } from 'vitest';
import { screenPickerLeaseMs } from '@colearnia/contracts';
import type {
  ScreenPickerLease,
  SessionProjection,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import { ScreenSharePicker } from './screenSharePicker';

function projectionFor(
  cursor: SessionProjectionCursor,
  scope: SessionProjection['viewer']['scope'] = { type: 'MAIN' },
  publishScreen = true,
): SessionProjection {
  return {
    sessionId: cursor.sessionId,
    epoch: cursor.epoch,
    phase: 'GUIDANCE',
    policyRevision: cursor.policyRevision,
    hostParticipantId: null,
    viewer: {
      participantId: cursor.participantId,
      role: 'MEMBER',
      callGeneration: cursor.callGeneration,
      audienceEpoch: cursor.audienceEpoch,
      scope,
    },
    participants: [],
    groups: [],
    permissions: {
      publishMic: true,
      publishCamera: true,
      publishScreen,
      readBoard: true,
      drawBoard: false,
      freezeBoard: false,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fixture() {
  vi.useFakeTimers();
  const context: SessionProjectionCursor = {
    sessionId: '111111111111111111111111',
    participantId: '222222222222222222222222',
    epoch: '10000000-0000-4000-8000-000000000003',
    callGeneration: 1,
    audienceEpoch: 0,
    projectionSequence: 0,
    policyRevision: 0,
    scope: { type: 'MAIN' },
  };
  const lease: ScreenPickerLease = {
    leaseId: '10000000-0000-4000-8000-000000000004',
    leaseGeneration: 1,
    expiresAt: new Date(screenPickerLeaseMs).toISOString(),
  };
  const video = Object.assign(new EventTarget(), { stop: vi.fn(), readyState: 'live' });
  const audio = { stop: vi.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
  const ports = {
    acquire: vi.fn(async () => lease),
    release: vi.fn(async () => {}),
    capture: vi.fn(async () => stream),
  };
  const picker = new ScreenSharePicker(context, ports, () => Date.now());
  picker.updateContext({ ...context, projection: projectionFor(context) });
  return { picker, ports, context, lease, stream, video, audio };
}

afterEach(() => vi.useRealTimers());

describe('screen picker lease', () => {
  it('only opens capture on the second action and does so synchronously', async () => {
    const f = fixture();
    await f.picker.choose();
    expect(f.ports.capture).not.toHaveBeenCalled();
    await f.picker.reserve();
    expect(f.ports.capture).not.toHaveBeenCalled();
    const choosing = f.picker.choose();
    expect(f.ports.capture).toHaveBeenCalledOnce();
    expect(await choosing).toMatchObject({ lease: f.lease, stream: f.stream });
    const selection = f.picker.getSelection();
    await vi.advanceTimersByTimeAsync(screenPickerLeaseMs);
    expect(selection?.signal.aborted).toBe(true);
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
  });

  it('releases the reservation when the browser picker is cancelled', async () => {
    const f = fixture();
    f.ports.capture.mockRejectedValueOnce(new DOMException('Cancelled', 'NotAllowedError'));
    await f.picker.reserve();
    await f.picker.choose();
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
    expect(f.picker.getSnapshot().status).toBe('idle');
  });

  it('stops a capture arriving after expiry without clearing a newer lease', async () => {
    const f = fixture();
    const pending = deferred<MediaStream>();
    f.ports.capture.mockReturnValueOnce(pending.promise);
    await f.picker.reserve();
    const old = f.picker.choose();
    await vi.advanceTimersByTimeAsync(screenPickerLeaseMs);
    f.ports.acquire.mockResolvedValueOnce({
      ...f.lease,
      leaseId: '10000000-0000-4000-8000-000000000005',
      leaseGeneration: 2,
    });
    await f.picker.reserve();
    pending.resolve(f.stream);
    expect(await old).toBeUndefined();
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
    expect(f.picker.getSnapshot().status).toBe('reserved');
    f.picker.dispose();
  });

  it('releases a late acquire ACK after scope changes without opening the picker', async () => {
    const f = fixture();
    const pending = deferred<ScreenPickerLease>();
    f.ports.acquire.mockReturnValueOnce(pending.promise);
    const old = f.picker.reserve();
    const scope = {
      type: 'GROUP',
      groupId: '10000000-0000-4000-8000-000000000005',
      mode: 'DISCUSSION',
    } as const;
    const next = {
      ...f.context,
      audienceEpoch: 1,
      policyRevision: 1,
      projectionSequence: 1,
      scope: { type: scope.type, groupId: scope.groupId },
    };
    f.picker.updateContext({ ...next, projection: projectionFor(next, scope) });
    pending.resolve(f.lease);
    await old;
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
    expect(f.ports.capture).not.toHaveBeenCalled();
    expect(f.picker.getSnapshot()).toMatchObject({ status: 'hidden', error: expect.any(String) });
    await f.picker.reserve();
    expect(f.ports.acquire).toHaveBeenCalledOnce();
  });

  it('cleans up and blocks a new attempt when projection revokes permission in the same scope', async () => {
    const f = fixture();
    await f.picker.reserve();
    await f.picker.choose();
    const next = { ...f.context, policyRevision: 1, projectionSequence: 1 };
    f.picker.updateContext({ ...next, projection: projectionFor(next, { type: 'MAIN' }, false) });
    expect(f.picker.getSnapshot()).toMatchObject({
      status: 'unavailable',
      error: expect.any(String),
    });
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
    f.picker.updateContext({ ...f.context, projection: projectionFor(f.context) });
    await f.picker.reserve();
    expect(f.ports.acquire).toHaveBeenCalledOnce();

    const restored = { ...next, policyRevision: 2, projectionSequence: 2 };
    f.picker.updateContext({ ...restored, projection: projectionFor(restored) });
    await f.picker.reserve();
    expect(f.picker.getSnapshot().status).toBe('reserved');
    f.picker.dispose();
  });
});
