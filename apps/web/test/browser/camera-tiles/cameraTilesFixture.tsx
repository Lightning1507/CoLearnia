import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { MediaSnapshotRuntime } from '../../../src/features/live/runtime/mediaSnapshotRuntime';
import type {
  ConsumerBinding,
  MediaSnapshot,
} from '../../../src/features/live/runtime/mediaSnapshot';
import { applySnapshot, binding, camera, context, event, provideSnapshot } from './fixtures';
import '../../../src/styles/global.css';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
  let snapshot!: MediaSnapshot;
  await act(async () => {
    snapshot = await applySnapshot(media);
  });
  await act(() => {
    media.attachConsumer(snapshot, binding, handle);
  });
  check(container.textContent?.includes('Đang chờ hình ảnh'), 'Consumer chưa ready phải chờ');
  check(!container.querySelector('video'), 'Không attach video trước ready');
  await act(async () => {
    await applySnapshot(media, [camera], false, 0, [{ ...binding, ready: true, paused: true }]);
  });
  await act(() => {
    media.confirmConsumerReady(snapshot, binding, handle);
  });
  check(!container.querySelector('video'), 'Ready ACK cũ không ghi đè snapshot paused mới');
  const resyncResponses: ((consumers: ConsumerBinding[]) => void)[] = [];
  let resyncRequests = 0;
  const unbindResync = media.bindResync((input, receive) => {
    resyncRequests++;
    resyncResponses.push((consumers) =>
      provideSnapshot(input.requestId, receive, [camera], false, 0, consumers),
    );
  });
  const waitResync = async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (resyncResponses.length) return;
      await act(delay);
    }
    throw new Error('Thiếu yêu cầu resync Consumer');
  };
  await waitResync();
  await act(() => {
    resyncResponses.shift()!([{ ...binding, ready: false, paused: true }]);
  });
  await act(() => {
    media.confirmConsumerReady(snapshot, binding, handle);
  });
  check(
    !container.querySelector('video') && !media.getCameraSnapshot().synchronized,
    'ACK sau snapshot pending phải chờ resync',
  );
  await waitResync();
  await act(async () => {
    resyncResponses.shift()!([{ ...binding, ready: true, paused: false }]);
  });
  check(resyncRequests === 2, 'ACK sau pending snapshot phải yêu cầu snapshot mới');
  unbindResync();
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
  const localVideo = container.querySelector('video')!;
  await act(async () => {
    track.enabled = false;
    for (let attempt = 0; attempt < 10; attempt++) await delay();
  });
  check(
    container.textContent?.includes('Đang chờ hình ảnh'),
    'Local disabled phải bỏ nhãn đang phát',
  );
  check(getComputedStyle(localVideo).visibility === 'hidden', 'Local disabled phải ẩn hình');
  await act(async () => {
    track.enabled = true;
    for (let attempt = 0; attempt < 10; attempt++) await delay();
  });
  check(
    container.textContent?.includes('Camera đang phát'),
    'Local enabled lại phải cập nhật nhãn',
  );
  check(getComputedStyle(localVideo).visibility === 'visible', 'Local enabled lại phải hiện hình');
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
  const tile = container.querySelector<HTMLElement>('.live-camera-tile')!;
  const surface = tile.querySelector<HTMLElement>('.live-camera-surface')!;
  const status = tile.querySelector<HTMLElement>('[role="status"]')!;
  check(
    getComputedStyle(tile).backgroundColor === 'rgb(41, 48, 46)',
    'Tile dùng màu Figma #29302e',
  );
  check(
    getComputedStyle(surface).backgroundColor === 'rgb(41, 48, 46)',
    'Placeholder dùng cùng token nền',
  );
  check(
    getComputedStyle(status).backgroundColor === 'rgba(19, 24, 23, 0.75)',
    'Nền nhãn theo Figma',
  );
  check(getComputedStyle(status).color === 'rgb(213, 220, 218)', 'Chữ nhãn theo Figma #d5dcda');
  check(
    getComputedStyle(status).top === '7px' && getComputedStyle(status).right === '7px',
    'Nhãn ở góc trên phải',
  );
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
  return 'PASS · snapshot pending → ready ACK → resync → hình ảnh; snapshot paused → ACK cũ; local enabled → disabled → enabled; token Figma; ready → frame → pause → resume → remount → switching → ended; StrictMode; participant độc lập';
}

void verify().then(
  (result) => {
    document.getElementById('result')!.textContent = result;
  },
  (error) => {
    document.getElementById('result')!.textContent = `FAIL · ${String(error)}`;
  },
);
