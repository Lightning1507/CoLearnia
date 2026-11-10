import { StrictMode, act, useState } from 'react';
import { channelSummarySchema } from '@colearnia/contracts';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { CallHandle } from '../../../src/features/live/runtime/callController';
import { useCallSnapshot } from '../../../src/features/live/runtime/callControllerContext';
import { WorkspaceShell } from '../../../src/features/workspaces/WorkspaceShell';
import type { WorkspacePanel } from '../../../src/features/workspaces/shell-contract';
import {
  liveContextFixture,
  sidebarFixture,
  workspaceFixture,
} from '../../../src/features/workspaces/workspace-fixture';
import '../../../src/styles/global.css';

const roomName = 'Phòng học cuối tuần';
const otherRoomName = 'Phòng ôn tập';
const chatName = 'thảo-luận-chung';
const otherSessionId = '100000000000000000000012';
const otherRoom = channelSummarySchema.parse({
  id: '100000000000000000000011',
  workspaceId: workspaceFixture.id,
  name: otherRoomName,
  type: 'LIVE',
  accessMode: 'WORKSPACE',
  revision: 1,
});
const channels = [
  ...sidebarFixture,
  { channel: otherRoom, canReadContent: true, canManageChannel: false },
];
type StageMedia = { call: CallHandle; stream: MediaStream };

function CallBadge() {
  return <output id="call-status">{useCallSnapshot().status}</output>;
}

export function Workspace({
  media,
  error,
}: {
  media?: StageMedia | undefined;
  error?: string | undefined;
}) {
  const [panel, setPanel] = useState<WorkspacePanel>({ kind: 'empty' });
  const isOtherRoom = panel.kind === 'live' && panel.channelId === otherRoom.id;
  return (
    <WorkspaceShell
      workspace={workspaceFixture}
      channels={channels}
      panel={panel}
      onSelectChannel={(channel) =>
        setPanel({ kind: channel.type === 'LIVE' ? 'live' : 'text', channelId: channel.id })
      }
      chatPanel={<section aria-label="Chat kiểm thử">Trò chuyện</section>}
      callPanel={
        <RoomShell
          channelName={isOtherRoom ? otherRoomName : roomName}
          sessionId={isOtherRoom ? otherSessionId : liveContextFixture.sessionId}
          stageMedia={media}
          error={error}
          sidePanel={
            isOtherRoom
              ? { label: 'Bảng', content: <p>Nội dung bảng kiểm thử</p> }
              : { label: 'Người tham gia', content: <p>Danh sách kiểm thử</p> }
          }
          controls={<button type="button">Điều khiển kiểm thử</button>}
        />
      }
      persistentCallControls={<Link to="/overview">Tổng quan Workspace</Link>}
    />
  );
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function click(label: string) {
  const element = [...document.querySelectorAll<HTMLElement>('button, a')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  check(element, `Thiếu điều khiển ${label}`);
  await act(() => element.click());
}

async function verifyLifecycle(container: HTMLElement) {
  const owner = new CallControllerOwner();
  const root = createRoot(container);
  const audio = new AudioContext();
  const destination = audio.createMediaStreamDestination();
  const stream = document.createElement('canvas').captureStream();
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const tracks = stream.getTracks();
  check(tracks.length === 2, 'Fixture cần một video track và một audio track thật');

  let listeners = 0;
  let subscriptions = 0;
  let initializations = 0;
  let disposals = 0;
  const subscribe = owner.subscribe;
  owner.subscribe = (listener) => {
    const unsubscribe = subscribe(listener);
    listeners += 1;
    subscriptions += 1;
    return () => {
      unsubscribe();
      listeners -= 1;
    };
  };

  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  const nativeSet = descriptor?.set;
  check(descriptor && nativeSet, 'Trình duyệt phải hỗ trợ srcObject');
  const bindings = new Set<HTMLMediaElement>();
  let attached = 0;
  let detached = 0;
  let peak = 0;
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    ...descriptor,
    set(this: HTMLMediaElement, source: MediaStream | null) {
      nativeSet.call(this, source);
      if (source) {
        attached += 1;
        bindings.add(this);
        peak = Math.max(peak, bindings.size);
      } else {
        detached += 1;
        bindings.delete(this);
      }
    },
  });

  const render = (media?: StageMedia, error?: string) =>
    act(() => {
      root.render(
        <StrictMode>
          <CallControllerProvider owner={owner}>
            <CallBadge />
            <MemoryRouter>
              <Routes>
                <Route path="/" element={<Workspace media={media} error={error} />} />
                <Route
                  path="/overview"
                  element={
                    <>
                      <Link to="/">Về danh sách kênh</Link>
                      <Link to="/standalone">Mở phòng độc lập</Link>
                    </>
                  }
                />
                <Route
                  path="/standalone"
                  element={
                    <>
                      <Link to="/">Về danh sách kênh</Link>
                      <RoomShell
                        channelName={roomName}
                        sessionId={liveContextFixture.sessionId}
                        stageMedia={media}
                      />
                    </>
                  }
                />
              </Routes>
            </MemoryRouter>
          </CallControllerProvider>
        </StrictMode>,
      );
    });

  const room = () => container.querySelector('article');
  const status = () => room()?.querySelector('[role="status"]')?.textContent;
  const video = () => room()?.querySelector('video');
  const verifyListeners = (expected: number) => {
    check(listeners === expected, `Số subscription đang hoạt động phải là ${expected}`);
  };
  const verifyCallPreserved = () => {
    check(
      tracks.every((track) => track.readyState === 'live'),
      'Track của call vẫn phải live',
    );
    check(disposals === 0 && audio.state !== 'closed', 'Runtime và audio fixture vẫn phải sống');
    check(container.querySelector('#call-status')?.textContent === 'active', 'Badge vẫn active');
  };
  const verifyHidden = (previousVideo: HTMLVideoElement | undefined | null) => {
    check(!room() && listeners === 1 && bindings.size === 0, 'Chỉ còn subscription badge');
    check(previousVideo?.srcObject === null, 'Video đã tháo phải nhả stream');
    verifyCallPreserved();
  };

  try {
    await render();
    verifyListeners(1);
    const subscriptionsBeforeRoom = subscriptions;
    await click(roomName);
    check(status() === 'Chưa tham gia cuộc gọi', 'RoomShell phải hiển thị idle');
    check(
      room()?.querySelectorAll('section, footer').length === 3,
      'Thiếu vùng stage/panel/controls',
    );
    const workspaceRoom = room();
    const body = workspaceRoom?.querySelector('section')?.parentElement;
    check(workspaceRoom && body, 'Thiếu bố cục phòng trong Workspace');
    const columns = getComputedStyle(body).gridTemplateColumns.trim().split(/\s+/).length;
    check(
      columns === (window.innerWidth >= 861 ? 2 : 1),
      'Panel bên phải theo breakpoint Tailwind',
    );
    const borderColor = getComputedStyle(workspaceRoom).borderTopColor;
    verifyListeners(2);
    check(
      subscriptions - subscriptionsBeforeRoom === 2,
      'StrictMode phải đăng ký lại subscription phòng đúng một lần',
    );

    // Complete the call-owned async setup while RoomShell is unmounted.
    let finish!: (dispose: () => void) => void;
    const pending = new Promise<() => void>((resolve) => {
      finish = resolve;
    });
    const initialize = () => {
      initializations += 1;
      return pending;
    };
    let ready!: Promise<CallHandle>;
    await act(() => {
      ready = owner.acquire(liveContextFixture, initialize);
    });
    check(status() === 'Đang chuẩn bị cuộc gọi…', 'RoomShell phải hiển thị starting');
    await click(chatName);
    const media = await act(async () => {
      finish(() => {
        disposals += 1;
        for (const track of tracks) track.stop();
      });
      return { call: await ready, stream };
    });
    await render(media);
    check(!video() && bindings.size === 0, 'Runtime hoàn tất muộn khi chat không gắn media');

    const verifyActive = () => {
      const currentVideo = video();
      check(
        status() === 'Phiên gọi đang hoạt động' && listeners === 2,
        'RoomShell phải nhận snapshot mới nhất',
      );
      check(currentVideo?.srcObject === stream && bindings.size === 1, 'Chỉ được gắn một video');
      check(
        currentVideo.muted && !container.querySelector('audio'),
        'RoomShell không được phát audio',
      );
      return currentVideo;
    };

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const before = { attached, detached };
      await click(roomName);
      const currentVideo = verifyActive();
      check(
        attached - before.attached === 2 && detached - before.detached === 1,
        'StrictMode phải gắn/tháo/gắn lại video',
      );
      await click(chatName);
      verifyHidden(currentVideo);
    }

    await click(roomName);
    const roomAVideo = verifyActive();
    const beforeOtherRoom = attached;
    await click(otherRoomName);
    check(room()?.querySelector('h2')?.textContent === otherRoomName, 'Phải mở đúng phòng B');
    check(status() === 'Chưa tham gia cuộc gọi', 'Phòng B không hiển thị trạng thái cuộc gọi A');
    check(
      !video() && bindings.size === 0 && attached === beforeOtherRoom,
      'Phòng B không được gắn stream cũ của A',
    );
    check(roomAVideo.srcObject === null, 'Video của phòng A phải nhả stream');
    const boardPanel = room()?.querySelector('section[aria-labelledby]');
    check(
      boardPanel?.querySelector('h3')?.textContent === 'Bảng' &&
        boardPanel.textContent.includes('Nội dung bảng kiểm thử'),
      'Panel bên phải lấy nhãn và nội dung từ bên gọi',
    );
    verifyListeners(2);
    verifyCallPreserved();
    await click(roomName);
    const routeVideo = verifyActive();
    await click('Tổng quan Workspace');
    verifyHidden(routeVideo);
    await click('Mở phòng độc lập');
    const standaloneVideo = verifyActive();
    const standaloneRoom = room();
    check(
      standaloneRoom && !standaloneRoom.closest('.workspace-shell'),
      'Phòng độc lập phải nằm ngoài Workspace',
    );
    check(
      !standaloneRoom.querySelector('section[aria-labelledby]'),
      'Panel bên phải được bỏ khi không truyền slot',
    );
    const standaloneStyle = getComputedStyle(standaloneRoom);
    check(
      standaloneStyle.display === 'grid' &&
        parseFloat(standaloneStyle.borderTopWidth) > 0 &&
        standaloneStyle.borderTopColor === borderColor &&
        standaloneStyle.borderTopColor !== 'rgba(0, 0, 0, 0)',
      `Tailwind layout và token viền phải có hiệu lực ngoài Workspace (${standaloneStyle.display}, ${standaloneStyle.borderTopWidth}, ${standaloneStyle.borderTopColor}, Workspace ${borderColor})`,
    );
    const stage = standaloneVideo.parentElement;
    check(
      stage && getComputedStyle(stage).backgroundColor !== 'rgba(0, 0, 0, 0)',
      'Token nền stage phải có hiệu lực ngoài Workspace',
    );
    await click('Về danh sách kênh');
    verifyHidden(standaloneVideo);
    await click(roomName);
    const previousVideo = verifyActive();
    check(
      (await owner.acquire(liveContextFixture, initialize)) === media.call && initializations === 1,
      'Điều hướng phải giữ cùng call handle và runtime',
    );

    await render(media, 'Lỗi hình ảnh kiểm thử');
    check(
      room()?.querySelector('[role="alert"]')?.textContent === 'Lỗi hình ảnh kiểm thử',
      'Phải hiển thị lỗi stage',
    );
    check(previousVideo.srcObject === null && bindings.size === 0, 'Lỗi stage phải tháo video');
    await render(media);
    const lastVideo = verifyActive();

    await act(() => owner.end(liveContextFixture));
    check(lastVideo.srcObject === null && disposals === 1, 'End phải dọn đúng call và view');
    check(
      tracks.every((track) => track.readyState === 'ended'),
      'Chỉ runtime mới được dừng tracks',
    );
    const next = { ...liveContextFixture, callGeneration: liveContextFixture.callGeneration + 1 };
    await act(async () => {
      await owner.acquire(next, () => () => {});
    });
    check(!video() && bindings.size === 0, 'Call mới không được gắn stream của call cũ');
  } finally {
    await act(() => root.unmount());
    owner.shutdown();
    for (const track of tracks) track.stop();
    await audio.close();
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', descriptor);
  }

  check(
    listeners === 0 && bindings.size === 0 && attached === detached && peak === 1,
    'Tài nguyên UI phải về baseline',
  );
  return `PASS · subscriptions=${subscriptions}, remaining=${listeners}, video attach/detach=${attached}/${detached}, peak=${peak}, call A init/dispose=${initializations}/${disposals}`;
}

if (import.meta.env.DEV) {
  const container = document.getElementById('root');
  const result = document.getElementById('result');
  check(container && result, 'Thiếu khung hiển thị kiểm thử');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  void verifyLifecycle(container).then(
    (message) => {
      result.textContent = message;
    },
    (error: unknown) => {
      result.textContent = `FAIL · ${String(error)}`;
      console.error(error);
    },
  );
}
