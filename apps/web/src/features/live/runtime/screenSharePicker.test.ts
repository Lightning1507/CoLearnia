import { afterEach, describe, expect, it, vi } from 'vitest';
import { screenPickerLeaseMs, sessionControlBudget } from '@colearnia/contracts';
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

function fixture(
  publish: ConstructorParameters<typeof ScreenSharePicker>[1]['publish'] = async () => {},
) {
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
    publish: vi.fn(publish),
  };
  const picker = new ScreenSharePicker(context, ports, () => Date.now());
  picker.updateContext({ ...context, projection: projectionFor(context) });
  return { picker, ports, context, lease, stream, video, audio };
}

afterEach(() => vi.useRealTimers());

describe('screen picker lease', () => {
  it('opens the native picker on the first click before asking for a reservation', async () => {
    const f = fixture(async () => {});
    const pending = deferred<MediaStream>();
    f.ports.capture.mockReturnValueOnce(pending.promise);
    const starting = f.picker.start();
    expect(f.ports.capture).toHaveBeenCalledOnce();
    expect(f.ports.acquire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(screenPickerLeaseMs + 1);
    pending.resolve(f.stream);
    await starting;
    expect(f.ports.acquire).toHaveBeenCalledOnce();
    expect(f.picker.getSnapshot().status).toBe('sharing');
  });

  it('stops capture after a reservation expires in flight without publishing', async () => {
    const f = fixture();
    const pending = deferred<ScreenPickerLease>();
    f.ports.acquire.mockReturnValueOnce(pending.promise);
    const starting = f.picker.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(screenPickerLeaseMs);
    pending.resolve(f.lease);
    await starting;
    expect(f.ports.publish).not.toHaveBeenCalled();
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
  });

  it('does not acquire a reservation when the browser picker is cancelled', async () => {
    const f = fixture();
    f.ports.capture.mockRejectedValueOnce(new DOMException('Cancelled', 'NotAllowedError'));
    await f.picker.start();
    expect(f.ports.acquire).not.toHaveBeenCalled();
    expect(f.picker.getSnapshot().status).toBe('idle');
  });

  it('stops a capture arriving after cancellation without clearing a newer attempt', async () => {
    const f = fixture();
    const pending = deferred<MediaStream>();
    f.ports.capture.mockReturnValueOnce(pending.promise);
    const old = f.picker.start();
    f.picker.cancel();
    const next = deferred<MediaStream>();
    f.ports.capture.mockReturnValueOnce(next.promise);
    const newer = f.picker.start();
    pending.resolve(f.stream);
    expect(await old).toBeUndefined();
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.ports.acquire).not.toHaveBeenCalled();
    expect(f.picker.getSnapshot().status).toBe('choosing');
    next.resolve(f.stream);
    await newer;
  });

  it('stops local capture and releases a late acquire ACK after scope changes', async () => {
    const f = fixture();
    const pending = deferred<ScreenPickerLease>();
    f.ports.acquire.mockReturnValueOnce(pending.promise);
    const old = f.picker.start();
    await Promise.resolve();
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
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.ports.publish).not.toHaveBeenCalled();
    expect(f.picker.getSnapshot()).toMatchObject({ status: 'hidden', error: expect.any(String) });
    await f.picker.start();
    expect(f.ports.acquire).toHaveBeenCalledOnce();
    expect(f.ports.capture).toHaveBeenCalledOnce();
  });

  it('cleans up and blocks a new attempt when projection revokes permission in the same scope', async () => {
    const f = fixture();
    await f.picker.start();
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
    await f.picker.start();
    expect(f.ports.acquire).toHaveBeenCalledOnce();

    const restored = { ...next, policyRevision: 2, projectionSequence: 2 };
    f.picker.updateContext({ ...restored, projection: projectionFor(restored) });
    await f.picker.start();
    expect(f.picker.getSnapshot().status).toBe('sharing');
    f.picker.dispose();
  });

  it('stops the selected tracks when another participant already holds the slot', async () => {
    const f = fixture();
    f.ports.acquire.mockRejectedValueOnce(new Error('SHARE_BUSY'));
    await f.picker.start();
    expect(f.ports.publish).not.toHaveBeenCalled();
    expect(f.video.stop).toHaveBeenCalledOnce();
    expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(f.picker.getSnapshot()).toMatchObject({
      status: 'idle',
      error: expect.stringContaining('Đang có người chia sẻ'),
    });
  });
});

it('browser Stop aborts the published pair and releases the exact lease after picker TTL', async () => {
  const publish = vi.fn<NonNullable<ConstructorParameters<typeof ScreenSharePicker>[1]['publish']>>(
    async () => {},
  );
  const f = fixture(publish);
  await f.picker.start();
  const signal = publish.mock.calls[0]![3];
  expect(f.picker.getSnapshot().status).toBe('sharing');
  await vi.advanceTimersByTimeAsync(screenPickerLeaseMs);
  expect(signal.aborted).toBe(false);
  f.video.dispatchEvent(new Event('ended'));
  expect(signal.aborted).toBe(true);
  expect(f.video.stop).toHaveBeenCalledOnce();
  expect(f.audio.stop).toHaveBeenCalledOnce();
  expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
  expect(f.picker.getSnapshot().status).toBe('stopping');
  await Promise.resolve();
  expect(f.picker.getSnapshot()).toEqual({
    status: 'idle',
    error: 'Đã dừng chia sẻ màn hình.',
  });
});

it('keeps the old lease for retry when browser Stop cannot be confirmed', async () => {
  const f = fixture(async () => {});
  const confirmation = deferred<void>();
  f.ports.release
    .mockRejectedValueOnce(new Error('Stop request timed out'))
    .mockReturnValueOnce(confirmation.promise);
  await f.picker.start();
  f.video.dispatchEvent(new Event('ended'));
  await Promise.resolve();
  expect(f.picker.getSnapshot().status).toBe('stopFailed');
  expect(f.video.stop).toHaveBeenCalledOnce();
  expect(f.audio.stop).toHaveBeenCalledOnce();
  await f.picker.start();
  expect(f.ports.acquire).toHaveBeenCalledOnce();

  f.picker.cancel();
  f.picker.cancel();
  expect(f.picker.getSnapshot().status).toBe('stopping');
  expect(f.ports.release.mock.calls).toEqual([
    [f.context, f.lease],
    [f.context, f.lease],
  ]);
  confirmation.resolve();
  await Promise.resolve();
  expect(f.picker.getSnapshot().status).toBe('idle');
  expect(f.video.stop).toHaveBeenCalledOnce();
});

it('does not stop a committed SCREEN at the picker deadline while audio is pending', async () => {
  const audio = deferred<void>();
  const publish = vi.fn<NonNullable<ConstructorParameters<typeof ScreenSharePicker>[1]['publish']>>(
    () => audio.promise,
  );
  const f = fixture(publish);
  const lease = deferred<ScreenPickerLease>();
  f.ports.acquire.mockReturnValueOnce(lease.promise);
  const choosing = f.picker.start();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(screenPickerLeaseMs - 1);
  lease.resolve(f.lease);
  await vi.advanceTimersByTimeAsync(2);
  expect(publish).toHaveBeenCalledOnce();
  expect(publish.mock.calls[0]![3].aborted).toBe(false);
  expect(f.picker.getSnapshot().status).toBe('publishing');
  expect(f.ports.release).not.toHaveBeenCalled();
  audio.resolve();
  await choosing;
  expect(f.picker.getSnapshot().status).toBe('sharing');
});

it('cancels publication that exceeds its own deadline and ignores a late result', async () => {
  const publication = deferred<void>();
  const f = fixture(() => publication.promise);
  const choosing = f.picker.start();
  await vi.advanceTimersByTimeAsync(sessionControlBudget.foregroundTransitionTimeoutMs);
  expect(f.ports.release).toHaveBeenCalledExactlyOnceWith(f.context, f.lease);
  expect(f.video.stop).toHaveBeenCalledOnce();
  publication.resolve();
  await choosing;
  expect(f.picker.getSnapshot().status).toBe('idle');
});
