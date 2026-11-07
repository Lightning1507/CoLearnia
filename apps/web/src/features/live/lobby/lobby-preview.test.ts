import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyPreview } from './lobby-preview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function device(kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: '', toJSON: () => ({}) };
}

function media(kind: 'audio' | 'video', deviceId: string) {
  const events = new EventTarget();
  const stop = vi.fn();
  const track = {
    kind,
    readyState: 'live',
    stop,
    getSettings: () => ({ deviceId }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as MediaStreamTrack;
  const stream = {
    id: `${kind}-${deviceId}`,
    getTracks: () => [track],
    getVideoTracks: () => (kind === 'video' ? [track] : []),
    getAudioTracks: () => (kind === 'audio' ? [track] : []),
  } as unknown as MediaStream;
  return { stream, track, stop, end: () => events.dispatchEvent(new Event('ended')) };
}

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function setup(
  options: { secure?: boolean; supported?: boolean; permissions?: Pick<Permissions, 'query'> } = {},
) {
  const events = new EventTarget();
  const enumerateDevices = vi
    .fn<() => Promise<MediaDeviceInfo[]>>()
    .mockResolvedValue([
      device('videoinput', 'cam1'),
      device('videoinput', 'cam2', 'USB camera'),
      device('audioinput', 'mic1'),
      device('audioinput', 'mic2', 'USB mic'),
      device('audiooutput', 'speaker'),
    ]);
  const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>();
  const addEventListener = vi.fn(events.addEventListener.bind(events));
  const removeEventListener = vi.fn(events.removeEventListener.bind(events));
  const preview = new LobbyPreview({
    secure: options.secure ?? true,
    mediaDevices:
      options.supported === false
        ? undefined
        : { enumerateDevices, getUserMedia, addEventListener, removeEventListener },
    permissions: options.permissions,
  });
  cleanup.push(preview.dispose);
  preview.start();
  return {
    preview,
    enumerateDevices,
    getUserMedia,
    addEventListener,
    removeEventListener,
    change: () => events.dispatchEvent(new Event('devicechange')),
  };
}

describe('lobby preview ownership and browser devices', () => {
  it('enumerates input devices and fallback labels without requesting permission', async () => {
    const { preview, getUserMedia } = setup();
    await vi.waitFor(() => expect(preview.getSnapshot().enumerating).toBe(false));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(preview.getSnapshot().camera.devices).toEqual([
      { id: 'cam1', label: 'Camera 1' },
      { id: 'cam2', label: 'USB camera' },
    ]);
    expect(preview.getSnapshot().microphone.devices.map((d) => d.id)).toEqual(['mic1', 'mic2']);
  });

  it('opens camera and microphone independently and distinguishes selected from opened', async () => {
    const { preview, getUserMedia } = setup();
    await preview.refreshDevices();
    preview.select('camera', 'cam2');
    expect(preview.getSnapshot().camera.openedId).toBeNull();
    const camera = media('video', 'cam2');
    getUserMedia
      .mockResolvedValueOnce(camera.stream)
      .mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    await preview.open('camera');
    await preview.open('microphone');
    expect(getUserMedia.mock.calls).toEqual([
      [{ video: { deviceId: { exact: 'cam2' } }, audio: false }],
      [{ audio: true, video: false }],
    ]);
    expect(preview.getSnapshot().videoStream).toBe(camera.stream);
    expect(preview.getSnapshot().camera.openedId).toBe('cam2');
    expect(preview.getSnapshot().microphone.status).toBe('denied');
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it('keeps microphone running when camera is denied and allows retry', async () => {
    const { preview, getUserMedia } = setup();
    const mic = media('audio', 'mic1');
    const camera = media('video', 'cam1');
    getUserMedia
      .mockResolvedValueOnce(mic.stream)
      .mockRejectedValueOnce(new DOMException('', 'NotAllowedError'))
      .mockResolvedValueOnce(camera.stream);
    await preview.open('microphone');
    await preview.open('camera');
    expect(preview.getSnapshot().camera.status).toBe('denied');
    expect(preview.getSnapshot().microphone.status).toBe('ready');
    await preview.open('camera');
    expect(preview.getSnapshot().camera.status).toBe('ready');
    expect(mic.stop).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['NotReadableError', 'busy'],
    ['OverconstrainedError', 'unavailable'],
    ['AbortError', 'error'],
    ['UnknownError', 'error'],
  ])('classifies %s without reporting granted', async (name, status) => {
    const { preview, getUserMedia } = setup();
    getUserMedia.mockRejectedValue(new DOMException('private internal details', name));
    await preview.open('camera');
    await preview.open('microphone');
    expect(preview.getSnapshot().camera.status).toBe(status);
    expect(preview.getSnapshot().microphone.status).toBe(status);
    expect(preview.getSnapshot().camera.message).not.toContain('private internal details');
    expect(preview.getSnapshot().videoStream).toBeNull();
  });

  it('releases stale successes and ignores stale failures on rapid device switches', async () => {
    const { preview, getUserMedia } = setup();
    await preview.refreshDevices();
    const first = deferred<MediaStream>();
    const second = deferred<MediaStream>();
    const stale = media('video', 'cam1');
    const latest = media('video', 'cam2');
    getUserMedia.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const pending = preview.open('camera');
    preview.select('camera', 'cam2');
    second.resolve(latest.stream);
    await vi.waitFor(() => expect(preview.getSnapshot().videoStream).toBe(latest.stream));
    first.resolve(stale.stream);
    await pending;
    expect(stale.stop).toHaveBeenCalledOnce();
    expect(latest.stop).not.toHaveBeenCalled();
    expect(preview.getSnapshot().camera.selectedId).toBe('cam2');
    const lateFailure = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(lateFailure.promise).mockResolvedValueOnce(latest.stream);
    const failed = preview.open('camera');
    await preview.open('camera');
    lateFailure.reject(new DOMException('', 'NotAllowedError'));
    await failed;
    expect(preview.getSnapshot().camera.status).toBe('ready');
  });

  it('stops replaced camera/mic tracks without touching the other media kind', async () => {
    const { preview, getUserMedia } = setup();
    const first = media('video', 'cam1');
    const second = media('video', 'cam2');
    const mic = media('audio', 'mic1');
    const nextMic = media('audio', 'mic2');
    getUserMedia
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(mic.stream)
      .mockResolvedValueOnce(second.stream)
      .mockResolvedValueOnce(nextMic.stream);
    await preview.open('camera');
    await preview.open('microphone');
    await preview.open('camera');
    expect(first.stop).toHaveBeenCalledOnce();
    expect(mic.stop).not.toHaveBeenCalled();
    await preview.open('microphone');
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(second.stop).not.toHaveBeenCalled();
    preview.dispose();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(nextMic.stop).toHaveBeenCalledOnce();
  });

  it('keeps the old preview until a replacement succeeds, then releases only the old stream', async () => {
    const { preview, getUserMedia } = setup();
    await preview.refreshDevices();
    const camera = media('video', 'cam1');
    const replacement = media('video', 'cam2');
    const pending = deferred<MediaStream>();
    getUserMedia.mockResolvedValueOnce(camera.stream).mockReturnValueOnce(pending.promise);
    await preview.open('camera');
    preview.select('camera', 'cam2');
    expect(preview.getSnapshot().camera.selectedId).toBe('cam2');
    expect(preview.getSnapshot().camera.openedId).toBe('cam1');
    expect(preview.getSnapshot().videoStream).toBe(camera.stream);
    expect(camera.stop).not.toHaveBeenCalled();
    pending.resolve(replacement.stream);
    await vi.waitFor(() => expect(preview.getSnapshot().camera.openedId).toBe('cam2'));
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(replacement.stop).not.toHaveBeenCalled();
  });

  it('releases an old stream after replacement fails and does not show a fake active preview', async () => {
    const { preview, getUserMedia } = setup();
    const camera = media('video', 'cam1');
    getUserMedia
      .mockResolvedValueOnce(camera.stream)
      .mockRejectedValueOnce(new DOMException('', 'NotReadableError'));
    await preview.open('camera');
    await preview.open('camera');
    expect(preview.getSnapshot().videoStream).toBeNull();
    expect(preview.getSnapshot().camera.openedId).toBeNull();
    expect(preview.getSnapshot().camera.status).toBe('busy');
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it('releases unusable returned streams', async () => {
    const { preview, getUserMedia } = setup();
    const wrongKind = media('audio', 'mic1');
    getUserMedia.mockResolvedValueOnce(wrongKind.stream);
    await preview.open('camera');
    expect(wrongKind.stop).toHaveBeenCalledOnce();
    expect(preview.getSnapshot().camera.status).toBe('busy');
  });

  it('does not attach a permission listener returned after disposal', async () => {
    const pending = deferred<PermissionStatus>();
    const permission = { addEventListener: vi.fn() } as unknown as PermissionStatus;
    const { preview } = setup({ permissions: { query: vi.fn().mockReturnValue(pending.promise) } });
    preview.dispose();
    pending.resolve(permission);
    await pending.promise;
    expect(permission.addEventListener).not.toHaveBeenCalled();
  });

  it('handles unplug and ended, clears stale selection and does not silently acquire another device', async () => {
    const { preview, getUserMedia, enumerateDevices, change } = setup();
    await preview.refreshDevices();
    preview.select('camera', 'cam1');
    const camera = media('video', 'cam1');
    getUserMedia.mockResolvedValueOnce(camera.stream);
    await preview.open('camera');
    await preview.refreshDevices();
    enumerateDevices.mockResolvedValue([device('videoinput', 'cam2')]);
    change();
    await vi.waitFor(() => expect(preview.getSnapshot().camera.status).toBe('unavailable'));
    expect(preview.getSnapshot().camera.selectedId).toBe('');
    expect(preview.getSnapshot().videoStream).toBeNull();
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    const next = media('video', 'cam2');
    getUserMedia.mockResolvedValueOnce(next.stream);
    await preview.open('camera');
    next.end();
    expect(next.stop).toHaveBeenCalledOnce();
    expect(preview.getSnapshot().camera.status).toBe('unavailable');
  });

  it('survives StrictMode setup-cleanup-setup and releases late requests from the old lifetime', async () => {
    const { preview, getUserMedia, addEventListener, removeEventListener } = setup();
    const old = deferred<MediaStream>();
    const stale = media('video', 'cam1');
    const current = media('video', 'cam2');
    const unrelated = media('audio', 'other-call');
    getUserMedia.mockReturnValueOnce(old.promise).mockResolvedValueOnce(current.stream);
    const request = preview.open('camera');
    preview.dispose();
    preview.start();
    await preview.open('camera');
    old.resolve(stale.stream);
    await request;
    expect(stale.stop).toHaveBeenCalledOnce();
    expect(preview.getSnapshot().videoStream).toBe(current.stream);
    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledOnce();
    preview.dispose();
    expect(current.stop).toHaveBeenCalledOnce();
    expect(unrelated.stop).not.toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending prompt without accepting its late stream', async () => {
    const { preview, getUserMedia } = setup();
    const pending = deferred<MediaStream>();
    const camera = media('video', 'cam1');
    getUserMedia.mockReturnValueOnce(pending.promise);
    const request = preview.open('camera');
    expect(preview.getSnapshot().camera.status).toBe('requesting');
    preview.stop('camera');
    pending.resolve(camera.stream);
    await request;
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(preview.getSnapshot().camera.status).toBe('off');
  });

  it('observes permission revocation and removes permission listeners', async () => {
    const permissionEvents = new EventTarget();
    const permission = {
      state: 'granted',
      addEventListener: vi.fn(permissionEvents.addEventListener.bind(permissionEvents)),
      removeEventListener: vi.fn(permissionEvents.removeEventListener.bind(permissionEvents)),
    };
    const { preview, getUserMedia } = setup({
      permissions: { query: vi.fn().mockResolvedValue(permission) },
    });
    await vi.waitFor(() => expect(permission.addEventListener).toHaveBeenCalledTimes(2));
    const camera = media('video', 'cam1');
    getUserMedia.mockResolvedValueOnce(camera.stream);
    await preview.open('camera');
    permission.state = 'denied';
    permissionEvents.dispatchEvent(new Event('change'));
    expect(preview.getSnapshot().camera.status).toBe('denied');
    expect(camera.stop).toHaveBeenCalledOnce();
    permission.state = 'granted';
    permissionEvents.dispatchEvent(new Event('change'));
    expect(preview.getSnapshot().camera.status).toBe('off');
    expect(getUserMedia).toHaveBeenCalledOnce();
    preview.dispose();
    expect(permission.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('ignores stale enumeration and cleans up after enumerate failure', async () => {
    const { preview, enumerateDevices } = setup();
    const stale = deferred<MediaDeviceInfo[]>();
    enumerateDevices
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([device('videoinput', 'latest')]);
    const pending = preview.refreshDevices();
    await preview.refreshDevices();
    stale.resolve([device('videoinput', 'old')]);
    await pending;
    expect(preview.getSnapshot().camera.devices[0]?.id).toBe('latest');
    enumerateDevices.mockRejectedValueOnce(new Error('internal'));
    await preview.refreshDevices();
    expect(preview.getSnapshot().enumerationError).toBeTruthy();
    expect(preview.getSnapshot().enumerating).toBe(false);
  });

  it('ignores empty device IDs and handles devices absent before permission', async () => {
    const { preview, enumerateDevices, getUserMedia } = setup();
    enumerateDevices.mockResolvedValue([device('videoinput', '')]);
    await preview.refreshDevices();
    expect(preview.getSnapshot().camera.devices).toEqual([]);
    preview.select('camera', 'unknown');
    expect(preview.getSnapshot().camera.selectedId).toBe('');
    enumerateDevices.mockResolvedValue([]);
    getUserMedia.mockRejectedValue(new DOMException('', 'NotFoundError'));
    await preview.open('camera');
    expect(preview.getSnapshot().camera.status).toBe('unavailable');
  });

  it.each([{ secure: false }, { supported: false }])(
    'keeps lobby usable when browser media is unavailable (%j)',
    async (options) => {
      const { preview, getUserMedia, enumerateDevices } = setup(options);
      await preview.open('camera');
      expect(preview.getSnapshot().environmentError).toBeTruthy();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(enumerateDevices).not.toHaveBeenCalled();
    },
  );
});
