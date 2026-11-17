import type { MediaSourceDescriptor } from '@colearnia/contracts';

// Tracks are borrowed from the call runtime, never owned by a tile.
export type CameraView = Readonly<{
  source: MediaSourceDescriptor;
  local: boolean;
  track: MediaStreamTrack | undefined;
}>;

export type CameraSnapshot = Readonly<{
  synchronized: boolean;
  cameras: readonly CameraView[];
}>;

export const emptyCameraSnapshot: CameraSnapshot = { synchronized: false, cameras: [] };

export function cameraStatus(camera: CameraView, synchronized: boolean, playing: boolean) {
  if (!synchronized) return 'Đang đồng bộ camera';
  if (camera.source.publicationState === 'PAUSED') return 'Camera tạm dừng';
  if (camera.source.publicationState === 'SWITCHING') return 'Đang chuyển camera';
  if (!camera.track || camera.track.readyState !== 'live' || !playing) return 'Đang chờ hình ảnh';
  return camera.local ? 'Camera đang phát · Bạn' : 'Đang nhận hình ảnh';
}
