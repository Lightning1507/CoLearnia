import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { MediaSnapshotRuntime } from '../../../src/features/live/runtime/mediaSnapshotRuntime';
import { WorkspaceShell } from '../../../src/features/workspaces/WorkspaceShell';
import {
  sidebarFixture,
  workspaceFixture,
} from '../../../src/features/workspaces/workspace-fixture';
import { applySnapshot, binding, camera, context } from '../camera-tiles/fixtures';
import '../../../src/styles/global.css';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function start() {
  const owner = new CallControllerOwner();
  let media!: MediaSnapshotRuntime;
  let initializations = 0;
  const call = await owner.acquire(context, (_identity, _signal, runtime) => {
    initializations++;
    media = runtime;
    media.updateContext(context);
    return () => {};
  });
  const slide = document.createElement('canvas');
  slide.width = 1280;
  slide.height = 720;
  const pen = slide.getContext('2d')!;
  const portrait = document.createElement('canvas');
  portrait.width = 320;
  portrait.height = 180;
  const paint = portrait.getContext('2d')!;
  let frame = 0;
  const draw = () => {
    pen.fillStyle = '#eff7f3';
    pen.fillRect(0, 0, 1280, 720);
    pen.fillStyle = '#0d7c62';
    pen.font = '24px Segoe UI';
    pen.fillText('CoLearnia · Phòng học cuối tuần', 70, 90);
    pen.font = 'bold 58px Segoe UI';
    pen.fillText('Đồ thị và kết nối', 70, 190);
    pen.font = '28px Segoe UI';
    pen.fillText('Mỗi đỉnh là một điểm. Mỗi cạnh nối hai điểm.', 70, 250);
    const nodes = [
      [260, 440],
      [640, 365],
      [1010, 480],
    ];
    pen.strokeStyle = '#8ba39b';
    pen.lineWidth = 5;
    pen.beginPath();
    pen.moveTo(260, 440);
    pen.lineTo(640, 365);
    pen.lineTo(1010, 480);
    pen.stroke();
    for (const [index, [x, y]] of nodes.entries()) {
      pen.fillStyle = '#0d7c62';
      pen.beginPath();
      pen.arc(x!, y!, 42, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = 'white';
      pen.fillText(String.fromCharCode(65 + index), x! - 9, y! + 10);
    }
    pen.fillStyle = '#5f7067';
    pen.font = '20px Segoe UI';
    pen.fillText(`Bài giảng · khung hình ${frame++}`, 70, 650);
    paint.fillStyle = '#347562';
    paint.fillRect(0, 0, 320, 180);
    paint.fillStyle = '#dcefe8';
    paint.beginPath();
    paint.arc(160, 67, 25, 0, Math.PI * 2);
    paint.fill();
    paint.beginPath();
    paint.ellipse(160, 163, 65, 56, 0, 0, Math.PI * 2);
    paint.fill();
  };
  draw();
  const timer = setInterval(draw, 100);
  const stream = slide.captureStream(10);
  const cameraStream = portrait.captureStream(10);
  const sources = Array.from({ length: 5 }, (_, index) => ({
    ...camera,
    sourceId: `camera-${index}`,
    producerId: `producer-${index}`,
    ownerParticipantId: String(index + 3).repeat(24),
    publicationState:
      index === 1
        ? ('PAUSED' as const)
        : index === 2
          ? ('SWITCHING' as const)
          : ('PUBLISHING' as const),
  }));
  const bindings = sources.map((source, index) => ({
    ...binding,
    sourceId: source.sourceId,
    producerId: source.producerId,
    consumerId: `consumer-${index}`,
  }));
  const snapshot = await applySnapshot(media, sources);
  let closes = 0;
  const tracks = sources.map(() => cameraStream.getVideoTracks()[0]!.clone());
  for (const [index, entry] of bindings.entries())
    media.attachConsumer(snapshot, entry, {
      attach: () => {},
      close: () => {
        closes++;
      },
      videoTrack: tracks[index]!,
    });
  await applySnapshot(
    media,
    sources,
    false,
    0,
    bindings.map((entry, index) => ({
      ...entry,
      ready: index !== 3,
      paused: index === 1 || index === 2 || index === 3,
    })),
  );
  const channel = sidebarFixture.find((entry) => entry.channel.type === 'LIVE')!;

  function Fixture() {
    const [mode, setMode] = useState<'video' | 'custom' | 'grid'>('video');
    const [panel, setPanel] = useState(false);
    const [draft, setDraft] = useState('Nhờ giải thích thêm cạnh AB.');
    const panelButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      const verify = () => {
        const result = document.getElementById('result')!;
        try {
          check(
            initializations === 1 && closes === 0,
            'Layout làm khởi tạo lại call hoặc đóng Consumer',
          );
          check(
            tracks.every((track) => track.readyState === 'live'),
            'Layout dừng track mượn',
          );
          check(document.documentElement.scrollWidth <= innerWidth, 'Trang bị tràn ngang');
          const stage = document.querySelector<HTMLElement>(
            'section[aria-label="Sân khấu cuộc gọi"]',
          )!;
          const cameras = document.querySelector<HTMLElement>(
            'section[aria-label="Camera cuộc gọi"]',
          )!;
          const hidden = panel && innerWidth < 1280;
          check(
            hidden === (stage.getClientRects().length === 0),
            'Panel thay stage sai breakpoint',
          );
          let sizes = '';
          if (!hidden && mode !== 'grid') {
            check(
              cameras.classList.contains('live-camera-rail'),
              'Có share nhưng thiếu camera rail',
            );
            check(!stage.contains(cameras), 'Camera vẫn nằm trong vùng stage');
            const main = stage.getBoundingClientRect();
            const rail = cameras.getBoundingClientRect();
            if (stage.parentElement!.clientWidth >= 560) {
              check(
                main.right <= rail.left && Math.abs(main.top - rail.top) < 1,
                'Rail chưa nằm cạnh stage',
              );
              check(main.width > rail.width * 1.5, 'Stage chưa lớn hơn rail');
              const tile = cameras.querySelector('article')!.getBoundingClientRect();
              check(
                Math.abs(tile.height - (tile.width * 9) / 16) < 1,
                'Rail không được ép méo tile để vừa chiều cao',
              );
              check(
                getComputedStyle(cameras).overflowY === 'auto',
                'Rail cần cuộn cục bộ khi thiếu chiều cao',
              );
            }
            sizes = `; stage=${Math.round(main.width)}×${Math.round(main.height)}, rail=${Math.round(rail.width)}×${Math.round(rail.height)}`;
          }
          if (!hidden && mode === 'grid')
            check(
              !cameras.classList.contains('live-camera-rail') && stage.contains(cameras),
              'Không share phải trở về camera grid',
            );
          const toolbar = document.querySelector<HTMLElement>(
            'footer[aria-label="Điều khiển cuộc gọi"]',
          )!;
          check(
            toolbar.getBoundingClientRect().width <= innerWidth && toolbar.getClientRects().length,
            'Toolbar không tới được',
          );
          result.textContent = `PASS · viewport=${innerWidth}×${innerHeight}; mode=${mode}; panel=${panel ? 'mở' : 'đóng'}${sizes}; 1 call, 0 Consumer đóng`;
        } catch (error) {
          result.textContent = `FAIL · ${String(error)}`;
        }
      };
      const observer = new ResizeObserver(verify);
      observer.observe(document.getElementById('root')!);
      const frame = requestAnimationFrame(verify);
      window.addEventListener('resize', verify);
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', verify);
      };
    }, [mode, panel]);
    const controlClass = 'live-toolbar-control rounded-lg px-3 py-2 text-sm';
    return (
      <WorkspaceShell
        workspace={workspaceFixture}
        channels={sidebarFixture}
        panel={{ kind: 'live', channelId: channel.channel.id }}
        onSelectChannel={() => {}}
        onOpenWorkspaceList={() => {}}
        chatPanel={null}
        persistentCallControls={<span className="text-xs">Cuộc gọi đang hoạt động</span>}
        callPanel={
          <RoomShell
            channelName={channel.channel.name}
            sessionId={context.sessionId}
            useWorkspaceWidth
            stageMedia={mode === 'video' ? { call, stream } : undefined}
            stage={
              mode === 'custom' ? (
                <div className="p-8">
                  <h3>Nguồn sân khấu tùy chỉnh</h3>
                  <p>Nội dung chia sẻ vẫn ở cột lớn.</p>
                </div>
              ) : undefined
            }
            sidePanel={
              panel
                ? {
                    label: 'Chat cuộc họp',
                    onBackToStage: () => {
                      setPanel(false);
                      panelButton.current?.focus();
                    },
                    content: (
                      <label className="grid gap-2">
                        Bản nháp chat
                        <textarea
                          className="min-w-0 rounded border p-2"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                      </label>
                    ),
                  }
                : undefined
            }
            controls={
              <>
                <button className={controlClass} onClick={() => setMode('video')}>
                  Nguồn video
                </button>
                <button className={controlClass} onClick={() => setMode('custom')}>
                  Nguồn tùy chỉnh
                </button>
                <button className={controlClass} onClick={() => setMode('grid')}>
                  Không share
                </button>
                <button ref={panelButton} className={controlClass} onClick={() => setPanel(!panel)}>
                  Đóng/mở chat
                </button>
              </>
            }
          />
        }
      />
    );
  }
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <CallControllerProvider owner={owner}>
        <Fixture />
      </CallControllerProvider>
    </StrictMode>,
  );
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      root.unmount();
      owner.shutdown();
      for (const track of [...stream.getTracks(), ...cameraStream.getTracks(), ...tracks])
        track.stop();
    },
    { once: true },
  );
}

if (import.meta.env.DEV)
  void start().catch((error) => {
    document.getElementById('result')!.textContent = `FAIL · ${String(error)}`;
  });
