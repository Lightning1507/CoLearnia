import { StrictMode, act, useRef, useState } from 'react';
import { channelSummarySchema } from '@colearnia/contracts';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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
const privateChannelName = 'Chuẩn bị thuyết trình';
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
  {
    channel: channelSummarySchema.parse({
      ...otherRoom,
      id: '100000000000000000000013',
      name: privateChannelName,
      type: 'TEXT',
      accessMode: 'PRIVATE',
    }),
    canReadContent: true,
    canManageChannel: false,
  },
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
  const navigate = useNavigate();
  const [panel, setPanel] = useState<WorkspacePanel>({ kind: 'empty' });
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const panelButton = useRef<HTMLButtonElement>(null);
  const isOtherRoom = panel.kind === 'live' && panel.channelId === otherRoom.id;
  return (
    <WorkspaceShell
      workspace={workspaceFixture}
      channels={channels}
      panel={panel}
      onOpenWorkspaceList={() => navigate('/overview')}
      onSelectChannel={(channel) =>
        setPanel({ kind: channel.type === 'LIVE' ? 'live' : 'text', channelId: channel.id })
      }
      chatPanel={<section aria-label="Chat kiểm thử">Trò chuyện</section>}
      callPanel={
        <RoomShell
          channelName={isOtherRoom ? otherRoomName : roomName}
          useWorkspaceWidth
          sessionId={isOtherRoom ? otherSessionId : liveContextFixture.sessionId}
          stageMedia={media}
          stage={media ? undefined : <button type="button">Điều khiển sân khấu kiểm thử</button>}
          error={error}
          sidePanel={
            sidePanelOpen
              ? {
                  label: isOtherRoom ? 'Bảng' : 'Người tham gia',
                  content: <p>{isOtherRoom ? 'Nội dung bảng kiểm thử' : 'Danh sách kiểm thử'}</p>,
                  onBackToStage: () => {
                    setSidePanelOpen(false);
                    panelButton.current?.focus();
                  },
                }
              : undefined
          }
          controls={
            <button ref={panelButton} type="button" onClick={() => setSidePanelOpen(true)}>
              Mở panel kiểm thử
            </button>
          }
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

function afterLayout() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
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
  const resizeFocus: boolean[] = [];
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
  const NativeResizeObserver = ResizeObserver;
  const observers = new Set<ResizeObserver>();
  class TrackedResizeObserver extends NativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      observers.add(this);
    }
    override disconnect() {
      super.disconnect();
      observers.delete(this);
    }
  }
  window.ResizeObserver = TrackedResizeObserver;
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
  const isDisplayed = (element: Element) => getComputedStyle(element).display !== 'none';
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
    for (const [name, icon] of [
      [privateChannelName, 'lock'],
      [chatName, 'hash'],
      [roomName, 'phone'],
    ] as const) {
      await click(name);
      const rowIcon = container.querySelector('.workspace-channel[aria-current="page"] svg');
      const headerIcon = container.querySelector('.workspace-topbar svg');
      check(
        rowIcon?.getAttribute('data-channel-icon') === icon &&
          headerIcon?.getAttribute('data-channel-icon') === icon,
        'Sidebar và header phải dùng cùng icon cho kênh đang chọn',
      );
    }
    await click(chatName);
    const subscriptionsBeforeRoom = subscriptions;
    await click(roomName);
    check(status() === 'Chưa tham gia cuộc gọi', 'RoomShell phải hiển thị idle');
    check(
      room()?.querySelectorAll('section, footer').length === 3,
      'Thiếu vùng stage/panel/controls',
    );
    const sidebar = container.querySelector('.workspace-sidebar');
    check(sidebar, 'Thiếu sidebar Workspace');
    const borderColor = getComputedStyle(sidebar).borderBottomColor;
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
    await click(roomName);
    const focusRoom = room();
    const focusWorkspace = focusRoom?.closest<HTMLElement>('.workspace-shell');
    const stageButton = focusRoom?.querySelector<HTMLButtonElement>('section[aria-label] button');
    const panelHeading = focusRoom?.querySelector('section[aria-labelledby] h3');
    const toolbarButton = focusRoom?.querySelector<HTMLButtonElement>('footer button');
    check(
      focusWorkspace && stageButton && panelHeading && toolbarButton,
      'Thiếu nút để kiểm focus khi thu hẹp',
    );
    for (const suppressBlur of [false, true]) {
      const blockBlur = (event: Event) => event.stopImmediatePropagation();
      if (suppressBlur) {
        document.addEventListener('blur', blockBlur, true);
        document.addEventListener('focusout', blockBlur, true);
      }
      try {
        focusWorkspace.style.inlineSize = '1280px';
        stageButton.focus();
        check(document.activeElement === stageButton, 'Nút trên sân khấu phải nhận focus ở 1280px');
        await afterLayout();
        resizeFocus.push(document.hasFocus());
        focusWorkspace.style.inlineSize = '1279px';
        await afterLayout();
        check(
          stageButton.getClientRects().length === 0 && document.activeElement === panelHeading,
          `Focus phải tới heading khi sân khấu ẩn, suppressBlur=${suppressBlur}`,
        );
      } finally {
        document.removeEventListener('blur', blockBlur, true);
        document.removeEventListener('focusout', blockBlur, true);
      }
    }

    focusWorkspace.style.inlineSize = '1280px';
    toolbarButton.focus();
    check(document.activeElement === toolbarButton, 'Toolbar phải nhận focus trước khi thu hẹp');
    focusWorkspace.style.inlineSize = '1279px';
    await afterLayout();
    check(
      document.activeElement === toolbarButton,
      'Resize phải giữ focus trên toolbar đang hiển thị',
    );
    verifyCallPreserved();
    focusWorkspace.style.removeProperty('inline-size');
    await click(chatName);
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
    const activeRoom = room();
    const activeStage = roomAVideo.parentElement;
    const activePanel = activeRoom?.querySelector('section[aria-labelledby]');
    const stageLayout = activeStage?.parentElement;
    const backButton = activePanel?.querySelector('button');
    const toolbar = activeRoom?.querySelector('footer');
    const workspace = activeRoom?.closest<HTMLElement>('.workspace-shell');
    check(
      activeRoom && activeStage && activePanel && stageLayout && backButton && toolbar && workspace,
      'Thiếu sân khấu, panel hoặc toolbar',
    );
    const beforeResize = { attached, detached, subscriptions };
    workspace.style.inlineSize = '1279px';
    backButton.focus();
    check(
      document.activeElement === backButton,
      'Nút Về sân khấu phải nhận focus trước khi resize',
    );
    await afterLayout();
    for (const width of [1280, 1279]) {
      workspace.style.inlineSize = `${width}px`;
      check(workspace.getBoundingClientRect().width === width, `Workspace phải rộng ${width}px`);
      const wide = width === 1280;
      check(
        isDisplayed(activeStage) === wide && isDisplayed(activePanel),
        `Sai bố cục ở ${width}px`,
      );
      check(
        isDisplayed(backButton) === !wide && isDisplayed(toolbar),
        `Sai điều khiển ở ${width}px`,
      );
      const columns = getComputedStyle(stageLayout).gridTemplateColumns.split(' ');
      check(
        wide ? columns.length === 2 && columns[1] === '320px' : columns.length === 1,
        `Sai số cột ở ${width}px`,
      );
      check(verifyActive() === roomAVideo, 'Đổi layout phải giữ video đang gắn');
      if (wide) {
        await afterLayout();
        check(
          document.activeElement === activePanel.querySelector('h3'),
          'Focus phải chuyển từ nút bị ẩn sang tiêu đề panel',
        );
      }
    }
    await click('Về sân khấu');
    check(
      isDisplayed(activeStage) && !activePanel.isConnected,
      'Về sân khấu phải đóng panel và hiện sân khấu',
    );
    check(document.activeElement === toolbar.querySelector('button'), 'Focus phải về nút mở panel');
    await click('Mở panel kiểm thử');
    const reopenedPanel = activeRoom.querySelector('section[aria-labelledby]');
    check(reopenedPanel && !isDisplayed(activeStage), 'Mở lại panel phải thay sân khấu ở 1279px');
    check(
      document.activeElement === reopenedPanel.querySelector('h3'),
      'Focus phải đến tiêu đề panel',
    );
    check(verifyActive() === roomAVideo, 'Về sân khấu và mở lại panel phải giữ video đang gắn');
    check(
      attached === beforeResize.attached &&
        detached === beforeResize.detached &&
        subscriptions === beforeResize.subscriptions,
      'Đổi layout không được thay binding hoặc subscription',
    );
    verifyCallPreserved();
    workspace.style.removeProperty('inline-size');

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
    const standaloneCard = standaloneRoom.firstElementChild;
    check(standaloneCard, 'Thiếu khung phòng độc lập');
    const standaloneStyle = getComputedStyle(standaloneCard);
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
    window.ResizeObserver = NativeResizeObserver;
  }

  check(
    listeners === 0 &&
      bindings.size === 0 &&
      attached === detached &&
      peak === 1 &&
      observers.size === 0,
    'Tài nguyên UI phải về baseline',
  );
  return `PASS · subscriptions=${subscriptions}, remaining=${listeners}, video attach/detach=${attached}/${detached}, peak=${peak}, call A init/dispose=${initializations}/${disposals}, observers=${observers.size}, resizeFocus=${resizeFocus.join('/')}`;
}

function waitForElement<T extends Element>(document: Document, selector: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(find);
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Không tìm thấy ${selector} trong /workspace`));
    }, 5000);

    function find() {
      const element = document.querySelector<T>(selector);
      if (element) {
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve(element);
      }
    }

    observer.observe(document, { childList: true, subtree: true });
    find();
  });
}

async function verifyWorkspaceRoute() {
  const frame = document.createElement('iframe');
  frame.title = 'Kiểm tra Workspace ở 1440 × 900';
  frame.style.cssText = 'display:block;width:1440px;height:900px;border:0';
  const loaded = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('/workspace chưa tải xong')), 10000);
    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
  frame.src = '/workspace';
  document.body.append(frame);
  try {
    await loaded;
    const page = frame.contentDocument;
    const view = frame.contentWindow;
    check(
      page && view && view.innerWidth === 1440 && view.innerHeight === 900,
      'Viewport /workspace phải là 1440 × 900',
    );
    await waitForElement(page, '.workspace-channel');
    const channels = [...page.querySelectorAll<HTMLButtonElement>('.workspace-channel')];
    const channel = channels.find((button) => button.textContent?.includes(roomName));
    check(channel, 'Không tìm thấy kênh LIVE trên /workspace');
    channel.click();
    const stage = await waitForElement(page, 'section[aria-label="Sân khấu cuộc gọi"]');
    const room = stage.closest('article');
    const panel = room?.querySelector('section[aria-labelledby]');
    const back = panel?.querySelector('button');
    check(room && panel && back, '/workspace phải mở panel Người tham gia');
    const workspaceWidth = room.closest('.workspace-shell')?.getBoundingClientRect().width;
    const roomWidth = room.getBoundingClientRect().width;
    check(
      workspaceWidth === 1440 && roomWidth < 1280,
      'Ca kiểm cần Workspace rộng và RoomShell hẹp hơn ngưỡng',
    );
    check(
      view.getComputedStyle(stage).display !== 'none' &&
        view.getComputedStyle(back).display === 'none',
      'Workspace 1440px phải hiện sân khấu và ẩn nút quay lại',
    );
    const stageRect = stage.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    check(
      panelRect.width === 320 &&
        panelRect.left >= stageRect.right &&
        panelRect.top === stageRect.top,
      'Panel phải rộng 320px và nằm cạnh sân khấu',
    );
    const header = page.querySelector('.workspace-topbar');
    const liveHost = page.querySelector('.workspace-panel-host');
    const sidebar = page.querySelector('.workspace-sidebar');
    check(header && liveHost && sidebar, 'Thiếu khung nội dung chung');
    const headerRect = header.getBoundingClientRect();
    const hostRect = liveHost.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    check(headerRect.height === 64, 'Header Workspace phải cao 64px theo Figma');
    check(
      headerRect.left === sidebarRect.right &&
        hostRect.left === headerRect.left &&
        hostRect.right === headerRect.right &&
        roomWidth === hostRect.width,
      'LIVE phải lấp đầy cột nội dung chung cạnh sidebar',
    );

    const textChannel = channels.find((button) => button.textContent?.includes(chatName));
    check(textChannel, 'Không tìm thấy kênh TEXT trên /workspace');
    textChannel.click();
    const chatCard = await waitForElement(page, 'article[aria-label^="Chat "]');
    const host = chatCard.closest('.workspace-panel-host');
    const main = host?.closest('.workspace-main');
    check(host && main && sidebar, 'Thiếu sidebar hoặc vùng nền quanh Chat');
    const background = (element: Element) => view.getComputedStyle(element).backgroundColor;
    check(background(sidebar) === 'rgb(241, 243, 242)', 'Sidebar phải có nền #F1F3F2');
    check(
      textChannel.getAttribute('aria-current') === 'page' &&
        background(textChannel) === 'rgb(220, 239, 232)',
      'Kênh TEXT đang chọn phải có nền #DCEFE8',
    );
    check(
      host.getBoundingClientRect().width === chatCard.getBoundingClientRect().width &&
        background(host) === 'rgba(0, 0, 0, 0)' &&
        background(main) === 'rgb(255, 255, 255)',
      'TEXT phải lấp đầy cột nội dung có nền #FFFFFF',
    );
    const textHeaderRect = header.getBoundingClientRect();
    const textRect = chatCard.getBoundingClientRect();
    const timeline = chatCard.querySelector('section');
    check(timeline, 'Thiếu timeline TEXT');
    check(
      textHeaderRect.left === headerRect.left &&
        textHeaderRect.top === headerRect.top &&
        textHeaderRect.height === headerRect.height &&
        textRect.left === hostRect.left &&
        textRect.right === hostRect.right,
      'Chuyển LIVE sang TEXT phải giữ nguyên header và mép cột nội dung',
    );
    check(
      view.getComputedStyle(header).paddingLeft === '20px' &&
        view.getComputedStyle(timeline).paddingLeft === '20px',
      'Header và timeline TEXT phải dùng khoảng đệm 20px',
    );
    const brand = sidebar.querySelector('span[aria-hidden="true"]');
    check(
      brand &&
        background(brand) === 'rgb(13, 124, 98)' &&
        view.getComputedStyle(brand).color === 'rgb(255, 255, 255)',
      'Ô biểu tượng Workspace phải có nền #0D7C62 và chữ trắng',
    );
    channel.click();
    await waitForElement(page, 'section[aria-label="Sân khấu cuộc gọi"]');
    check(
      header.getBoundingClientRect().left === textHeaderRect.left &&
        header.getBoundingClientRect().height === textHeaderRect.height,
      'Chuyển TEXT trở lại LIVE phải giữ khung header',
    );
    const menuTrigger = sidebar.querySelector<HTMLButtonElement>(
      'button[aria-label^="Mở menu Workspace"]',
    );
    check(menuTrigger, 'Tên Workspace phải là nút mở menu');
    menuTrigger.click();
    const workspaceMenu = await waitForElement(page, 'nav[aria-label="Menu Workspace"]');
    check(
      workspaceMenu.textContent?.includes(workspaceFixture.name),
      'Menu phải hiển thị Workspace hiện tại',
    );
    const listAction = workspaceMenu.querySelector('button');
    check(
      listAction?.textContent === 'Danh sách Workspace',
      'Menu phải có mục Danh sách Workspace',
    );
    await afterLayout();
    check(page.activeElement === listAction, 'Mở menu phải focus mục danh sách');
    textChannel.focus();
    await afterLayout();
    check(
      !workspaceMenu.isConnected &&
        menuTrigger.getAttribute('aria-expanded') === 'false' &&
        page.activeElement === textChannel,
      'Focus rời menu phải đóng menu và giữ đích Tab ở kênh',
    );
    textChannel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await afterLayout();
    check(page.activeElement === textChannel, 'Escape ngoài menu không được kéo focus về trigger');
    menuTrigger.click();
    const escapeMenu = await waitForElement(page, 'nav[aria-label="Menu Workspace"]');
    await afterLayout();
    escapeMenu
      .querySelector('button')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await afterLayout();
    check(
      !escapeMenu.isConnected && page.activeElement === menuTrigger,
      'Escape phải đóng menu và trả focus về nút mở',
    );
    menuTrigger.click();
    const reopenedMenu = await waitForElement(page, 'nav[aria-label="Menu Workspace"]');
    reopenedMenu.querySelector('button')?.click();
    const listScreen = await waitForElement(page, 'main[aria-label="Danh sách Workspace fixture"]');
    check(
      listScreen.querySelector('h1')?.textContent === 'Danh sách Workspace',
      'Mục menu phải gọi callback điều hướng của bên nhúng',
    );
    check(
      page.activeElement === listScreen.querySelector('h1'),
      'Màn danh sách mới phải nhận focus tại heading thay vì body',
    );
    const chooseWorkspace = listScreen.querySelector('button');
    check(chooseWorkspace, 'Màn danh sách phải có nút chọn Workspace');
    chooseWorkspace.focus();
    check(
      page.activeElement === chooseWorkspace,
      'Nút chọn Workspace phải nhận focus trước khi chọn',
    );
    chooseWorkspace.click();
    const returnedTrigger = await waitForElement<HTMLButtonElement>(
      page,
      'button[aria-label^="Mở menu Workspace"]',
    );
    await afterLayout();
    check(
      !listScreen.isConnected &&
        page.activeElement === returnedTrigger &&
        returnedTrigger.getAttribute('aria-expanded') === 'false',
      'Chọn Workspace phải trả focus về nút mở menu thay vì body',
    );
    check(
      page
        .querySelector('.workspace-channel[aria-current="page"]')
        ?.textContent?.includes(roomName),
      'Quay lại Workspace phải giữ kênh LIVE đã chọn',
    );
    return `workspace=${workspaceWidth}×${view.innerHeight}, room=${roomWidth}`;
  } finally {
    frame.remove();
  }
}

if (import.meta.env.DEV) {
  const container = document.getElementById('root');
  const result = document.getElementById('result');
  check(container && result, 'Thiếu khung hiển thị kiểm thử');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  void verifyLifecycle(container)
    .then(async (message) => `${message} · ${await verifyWorkspaceRoute()}`)
    .then(
      (message) => {
        result.textContent = message;
      },
      (error: unknown) => {
        result.textContent = `FAIL · ${String(error)}`;
        console.error(error);
      },
    );
}
