import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { MediaSnapshotRuntime } from '../../../src/features/live/runtime/mediaSnapshotRuntime';
import { applySnapshot, binding, camera, context, event } from './fixtures';
import '../../../src/styles/global.css';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

async function verify() {
  const container = document.getElementById('root')!;
  const owner = new CallControllerOwner();
  let media!: MediaSnapshotRuntime;
  let initializations = 0;
  await owner.acquire(context, (_identity, _signal, runtime) => {
    initializations++;
    media = runtime;
    media.updateContext(context);
    return () => {};
  });
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const paint = canvas.getContext('2d')!;
  let frame = 0;
  const timer = setInterval(() => {
    paint.fillStyle = frame++ % 2 ? '#165a72' : '#347562';
    paint.fillRect(0, 0, 320, 180);
    paint.fillStyle = 'white';
    paint.font = '24px sans-serif';
    paint.fillText(`Camera fixture ${frame}`, 20, 95);
  }, 40);
  const stream = canvas.captureStream(25);
  const track = stream.getVideoTracks()[0]!;
  let attachments = 0;
  let closes = 0;
  const handle = {
    videoTrack: track,
    attach: () => {
      attachments++;
    },
    close: () => {
      closes++;
    },
  };
  let root = createRoot(container);
  const render = () =>
    root.render(
      <StrictMode>
        <CallControllerProvider owner={owner}>
          <RoomShell
            channelName="Kiểm thử camera"
            sessionId={context.sessionId}
            controls={<p>Danh sách participant độc lập: 2 người</p>}
          />
        </CallControllerProvider>
      </StrictMode>,
    );
  await act(render);
  const snapshot = await applySnapshot(media);
  await act(() => {
    media.attachConsumer(snapshot, binding, handle);
  });
  check(container.textContent?.includes('Đang chờ hình ảnh'), 'Consumer chưa ready phải chờ');
  check(!container.querySelector('video'), 'Không attach video trước ready');
  await act(() => {
    media.confirmConsumerReady(snapshot, binding, handle);
  });
  const waitVideo = async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (container.textContent?.includes('Đang nhận hình ảnh')) return;
      await act(delay);
    }
    throw new Error('Video chưa phát frame');
  };
  await waitVideo();
  const firstVideo = container.querySelector('video')!;
  check(firstVideo.muted && firstVideo.playsInline, 'Video phải muted/playsInline');
  check(
    firstVideo.srcObject instanceof MediaStream &&
      firstVideo.srcObject.getAudioTracks().length === 0,
    'Binding chỉ chứa video',
  );
  await act(() => {
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, publicationState: 'PAUSED', sourceRevision: 2 } }, 1),
    );
  });
  check(container.textContent?.includes('Camera tạm dừng'), 'Thiếu trạng thái pause');
  check(
    !container.querySelector('video') && firstVideo.srcObject === null,
    'Pause phải detach frame cũ',
  );
  check(track.readyState === 'live', 'Tile không sở hữu track');
  await act(() => {
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, sourceRevision: 3 } }, 2),
    );
  });
  check(container.textContent?.includes('Đang chờ hình ảnh'), 'Resume phải chờ frame');
  await waitVideo();
  await act(() => root.unmount());
  check(track.readyState === 'live' && closes === 0, 'Unmount không đóng Consumer/track');
  root = createRoot(container);
  await act(render);
  await waitVideo();
  check(initializations === 1 && attachments === 1, 'Remount không tạo thêm runtime/Consumer');
  await act(() => {
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, publicationState: 'SWITCHING', sourceRevision: 4 } }, 3),
    );
  });
  check(
    container.textContent?.includes('Đang chuyển camera') && !container.querySelector('video'),
    'Switching phải ẩn frame cũ',
  );
  await act(() => {
    media.acceptEvent(
      'media.source.ended',
      event(
        {
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 5,
          reason: 'SOURCE_ENDED',
        },
        4,
      ),
    );
  });
  check(
    !container.querySelector('video') && container.textContent?.includes('Chưa có camera khả dụng'),
    'Ended phải bỏ tile',
  );
  check(container.textContent?.includes('2 người'), 'Camera ended không đổi participant list');
  await act(() => {
    media.updateContext(null);
  });
  await act(() => {
    media.updateContext({ ...context, projectionSequence: 2 });
  });
  const local = { ...camera, ownerParticipantId: context.participantId };
  await act(async () => {
    await applySnapshot(media, [local], true);
    media.bindCameraPreview(local, track);
  });
  for (
    let attempt = 0;
    attempt < 60 && !container.textContent?.includes('Camera đang phát');
    attempt++
  )
    await act(delay);
  check(
    container.textContent?.includes('Camera đang phát'),
    'Local preview chờ frame rồi mới phát',
  );
  await act(() => {
    media.acceptEvent(
      'media.producer.stateChanged',
      event(
        {
          producerId: camera.producerId,
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 2,
          state: 'PAUSED',
        },
        1,
      ),
    );
  });
  check(track.enabled && track.readyState === 'live', 'Track local còn bật trong ca pause');
  check(
    container.textContent?.includes('Camera tạm dừng') && !container.querySelector('video'),
    'Server pause phải ưu tiên local preview',
  );
  await act(() => root.unmount());
  root = createRoot(container);
  await act(render);
  check(
    container.textContent?.includes('Camera tạm dừng') && !container.querySelector('video'),
    'Remount không phục hồi publishing',
  );
  check(initializations === 1, 'Chỉ một controller');
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      track.stop();
      root.unmount();
      owner.shutdown();
    },
    { once: true },
  );
  return 'PASS · ready → frame → pause → resume → remount → switching → ended; local enabled + server PAUSED; StrictMode; participant độc lập';
}

void verify().then(
  (result) => {
    document.getElementById('result')!.textContent = result;
  },
  (error) => {
    document.getElementById('result')!.textContent = `FAIL · ${String(error)}`;
  },
);
