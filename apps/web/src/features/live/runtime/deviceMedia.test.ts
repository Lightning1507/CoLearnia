import { describe, expect, it, vi } from 'vitest';
import { DeviceMedia } from './deviceMedia';
import type { DeviceMediaContext } from './deviceMedia';

const context: DeviceMediaContext = {
  sessionId: '1'.repeat(24),
  epoch: '10000000-0000-4000-8000-000000000001',
  callGeneration: 1,
  audienceEpoch: 0,
  policyRevision: 0,
  scope: { type: 'MAIN' },
};

function media(kind: 'audio' | 'video') {
  const track = Object.assign(new EventTarget(), {
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;
  return { track, stream: { getTracks: () => [track] } as MediaStream };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('DeviceMedia', () => {
  it('starts only on request, stops capture before remote close, and does not reopen on resync', async () => {
    const camera = media('video');
    const capture = vi.fn(async () => camera.stream);
    const close = vi.fn(async () => {
      expect(camera.track.enabled).toBe(false);
      expect(camera.track.stop).toHaveBeenCalled();
    });
    const publish = vi.fn(async () => {
      expect(camera.track.enabled).toBe(false);
      return { close };
    });
    const devices = new DeviceMedia(capture, publish, { camera: 'chosen-camera' });
    devices.updateContext(context);
    expect(capture).not.toHaveBeenCalled();
    await devices.start('camera');
    expect(capture).toHaveBeenCalledWith({
      audio: false,
      video: { deviceId: { exact: 'chosen-camera' } },
    });
    expect(devices.getSnapshot().camera.phase).toBe('on');
    expect(camera.track.enabled).toBe(true);
    await devices.stop('camera');
    expect(devices.getSnapshot().camera.phase).toBe('off');
    devices.updateContext(null);
    devices.updateContext({ ...context, callGeneration: 2 });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stops a late getUserMedia result without publishing it', async () => {
    const mic = media('audio');
    const captured = deferred<MediaStream>();
    const publish = vi.fn();
    const devices = new DeviceMedia(() => captured.promise, publish);
    devices.updateContext(context);
    const starting = devices.start('microphone');
    await devices.stop('microphone');
    expect(devices.getSnapshot().microphone.phase).toBe('off');
    captured.resolve(mic.stream);
    await starting;
    expect(mic.track.stop).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('closes a late publication across lost permission and never enables its track', async () => {
    const mic = media('audio');
    const published = deferred<{ close(): Promise<void> }>();
    const publish = vi.fn(() => published.promise);
    const close = vi.fn(async () => {});
    const devices = new DeviceMedia(async () => mic.stream, publish);
    devices.updateContext(context);
    const starting = devices.start('microphone');
    await vi.waitFor(() => expect(publish).toHaveBeenCalled());
    devices.updateContext(null);
    published.resolve({ close });
    await starting;
    expect(devices.getSnapshot().microphone.phase).toBe('off');
    expect(mic.track.enabled).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports browser permission denial and leaves the other device alone', async () => {
    const camera = media('video');
    const capture = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.audio) throw new DOMException('denied', 'NotAllowedError');
      return camera.stream;
    });
    const devices = new DeviceMedia(capture, async () => ({ close: async () => {} }));
    devices.updateContext(context);
    await devices.start('camera');
    await devices.start('microphone');
    expect(devices.getSnapshot().microphone).toMatchObject({
      phase: 'off',
      error: expect.any(String),
    });
    expect(devices.getSnapshot().camera.phase).toBe('on');
  });
});
