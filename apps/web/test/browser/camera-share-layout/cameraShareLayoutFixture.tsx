import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { mediaSourcesSnapshotSchema } from '@colearnia/contracts';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { MediaSnapshotRuntime } from '../../../src/features/live/runtime/mediaSnapshotRuntime';
import { DeviceMedia } from '../../../src/features/live/runtime/deviceMedia';
import { WorkspaceShell } from '../../../src/features/workspaces/WorkspaceShell';
import {
  sidebarFixture,
  workspaceFixture,
} from '../../../src/features/workspaces/workspace-fixture';
import { binding, camera, context, provideSnapshot, event } from '../camera-tiles/fixtures';
import '../../../src/styles/global.css';
import './cameraShareLayoutFixture.css';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function FixtureIcon({ kind }: { kind: 'people' | 'group' | 'leave' | 'volume' | 'mic' }) {
  return (
    <svg
      className="size-4"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'volume' ? (
        <>
          <path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
        </>
      ) : kind === 'mic' ? (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
        </>
      ) : kind === 'leave' ? (
        <>
          <path d="M5 17H3v-7c5-5 13-5 18 0v7h-2l-3-5H8zM3 3l18 18" />
        </>
      ) : (
        <>
          <circle cx="9" cy="7" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a6 6 0 0 1 3 5v2" />
          {kind === 'group' && <path d="M2 11 1 9M21 8l1-2" />}
        </>
      )}
    </svg>
  );
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
  const sources = Array.from({ length: 4 }, (_, index) => ({
    ...camera,
    sourceId: `camera-${index}`,
    producerId: `producer-${index}`,
    ownerParticipantId: index === 0 ? context.participantId : String(index + 3).repeat(24),
    publicationState: index === 2 ? ('PAUSED' as const) : ('PUBLISHING' as const),
  }));
  const bindings = sources.map((source, index) => ({
    ...binding,
    sourceId: source.sourceId,
    producerId: source.producerId,
    consumerId: `consumer-${index}`,
  }));
  const apply = async (ready = false) => {
    const request = media.begin(crypto.randomUUID())!;
    provideSnapshot(
      request.input.requestId,
      {
        acceptAck: request.acceptAck,
        acceptPart: (packet) => {
          const part = mediaSourcesSnapshotSchema.parse(packet);
          request.acceptPart({
            ...part,
            payload: {
              ...part.payload,
              ownProducers: [{ source: sources[0]!, replacement: null }],
            },
          });
        },
      },
      sources,
      false,
      0,
      bindings.slice(1).map((entry, index) => ({ ...entry, ready, paused: !ready || index === 1 })),
    );
    const result = await request.result;
    check(result.status === 'applied', 'Snapshot fixture phải hợp lệ');
    return result.snapshot;
  };
  const snapshot = await apply();
  let closes = 0;
  const tracks = sources.map(() => cameraStream.getVideoTracks()[0]!.clone());
  for (const [index, entry] of bindings.entries())
    if (index !== 0)
      media.attachConsumer(snapshot, entry, {
        attach: () => {},
        close: () => {
          closes++;
        },
        videoTrack: tracks[index]!,
      });
  const participantNames = Object.fromEntries(
    sources.map((source, index) => [
      source.ownerParticipantId,
      ['Minh Anh', 'Gia Khoa', 'Thảo Vy', 'Hoàng Nam'][index]!,
    ]),
  );
  const channel = sidebarFixture.find((entry) => entry.channel.type === 'LIVE')!;
  const syntheticAudio = new AudioContext();
  const audioDestination = syntheticAudio.createMediaStreamDestination();
  const devices = new DeviceMedia(
    async ({ video }) => {
      return new MediaStream([
        video ? tracks[0]!.clone() : audioDestination.stream.getAudioTracks()[0]!.clone(),
      ]);
    },
    async () => ({ close: async () => {} }),
  );
  devices.updateContext(context);
  await devices.start('microphone');

  function Fixture() {
    const [mode, setMode] = useState<'slide' | 'video' | 'custom' | 'grid'>('slide');
    const [panel, setPanel] = useState<'Chat cuộc họp' | 'Người tham gia' | 'Nhóm' | null>(null);
    const [inWorkspace, setInWorkspace] = useState(false);
    const [left, setLeft] = useState(false);
    const [volume, setVolume] = useState(78);
    const [draft, setDraft] = useState('Nhờ giải thích thêm cạnh AB.');
    const panelButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (left) return;
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
          if (!inWorkspace && innerWidth >= 768) {
            check(
              !document.querySelector('.workspace-sidebar'),
              'Màn họp riêng không được có sidebar Workspace',
            );
            const title = document.querySelector('.live-room-heading h2')!.getBoundingClientRect();
            check(
              Math.abs(title.left + title.width / 2 - innerWidth / 2) < 2,
              'Tiêu đề không được lệch khi các slot hai bên khác độ dài',
            );
          }
          const stage = document.querySelector<HTMLElement>(
            'section[aria-label="Sân khấu cuộc gọi"]',
          )!;
          const cameras = document.querySelector<HTMLElement>(
            'section[aria-label="Camera cuộc gọi"]',
          )!;
          const hidden = Boolean(panel && innerWidth < 1280);
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
              const tiles = [...cameras.querySelectorAll('article')];
              const tile = tiles[0]!.getBoundingClientRect();
              check(
                tile.height >= 119 && tiles.length === media.getCameraSnapshot().cameras.length,
                'Rail phải giữ tile cao và không bỏ camera để vừa khung',
              );
              const name = tiles[0]!.querySelector('.live-camera-name')!.getBoundingClientRect();
              check(
                name.top > tile.top + tile.height / 2 && name.left < tile.left + 10,
                'Tên camera phải ở góc dưới trái',
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
            toolbar.getBoundingClientRect().width <= innerWidth + 1 &&
              toolbar.getClientRects().length,
            'Toolbar không tới được',
          );
          if (innerHeight >= 640 && innerWidth >= 768)
            check(
              toolbar.getBoundingClientRect().bottom <= innerHeight + 1,
              'Toolbar phải nằm trong viewport desktop',
            );
          check(
            getComputedStyle(toolbar).backgroundColor === 'rgb(22, 27, 26)',
            'Toolbar phải cùng nền media theo token chung',
          );
          if (innerWidth >= 768) {
            const primary = toolbar
              .querySelector('.live-room-controls-main')!
              .getBoundingClientRect();
            const secondary = toolbar
              .querySelector('.live-room-controls-side')!
              .getBoundingClientRect();
            const volumeRow = toolbar.querySelector('.live-room-volume')!.getBoundingClientRect();
            check(
              primary.right <= secondary.left && volumeRow.bottom <= primary.top,
              'Các nhóm điều khiển không được chồng lấn',
            );
          }
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
    }, [mode, panel, inWorkspace, left]);
    const controlClass =
      'live-toolbar-control inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm';
    const room = (
      <RoomShell
        channelName="Phòng học chung"
        sessionId={context.sessionId}
        useWorkspaceWidth={inWorkspace}
        header={{
          navigation: (
            <button onClick={() => setInWorkspace(!inWorkspace)}>
              <span aria-hidden="true">‹</span> Workspace
            </button>
          ),
          description: 'Phòng chung · Host: Lan Chi · Bạn là thành viên',
          position: (
            <span className="inline-flex items-center gap-2">
              <FixtureIcon kind="mic" />
              Mic của bạn phát trong Phòng chung
            </span>
          ),
        }}
        participantNames={participantNames}
        shareLabel="Lan Chi đang chia sẻ · Trực tiếp"
        devices={devices}
        stageMedia={mode === 'video' ? { call, stream } : undefined}
        stage={
          mode === 'slide' ? (
            <div className="camera-layout-slide">
              <span>COLEARNIA · NỘI DUNG CHIA SẺ MÔ PHỎNG</span>
              <h3>Cùng tìm hiểu cách web hoạt động</h3>
              <div className="camera-layout-flow">
                <b>Trình duyệt</b>
                <i />
                <b>Máy chủ</b>
                <i />
                <b>Cơ sở dữ liệu</b>
              </div>
              <p>Request → Router → Controller → Response</p>
            </div>
          ) : mode === 'custom' ? (
            <div className="p-8">
              <h3>Nguồn sân khấu tùy chỉnh</h3>
              <p>Nội dung chia sẻ vẫn ở cột lớn.</p>
            </div>
          ) : undefined
        }
        sidePanel={
          panel
            ? {
                label: panel,
                onBackToStage: () => {
                  setPanel(null);
                  panelButton.current?.focus();
                },
                content:
                  panel === 'Chat cuộc họp' ? (
                    <label className="camera-layout-chat-draft">
                      Bản nháp chat mô phỏng
                      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
                    </label>
                  ) : (
                    <p>
                      {panel === 'Người tham gia'
                        ? 'Lan Chi · Minh Anh · Gia Khoa · Thảo Vy · Hoàng Nam'
                        : 'Panel nhóm mô phỏng để kiểm bố cục.'}
                    </p>
                  ),
              }
            : undefined
        }
        controls={
          <>
            <button
              className={controlClass}
              data-state={mode !== 'grid' ? 'active' : undefined}
              onClick={() => setMode(mode === 'grid' ? 'slide' : 'grid')}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="4" width="18" height="13" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              {mode === 'grid' ? 'Chia sẻ' : 'Dừng share'}
            </button>
          </>
        }
        volumeControls={
          <div className="camera-layout-volume">
            <label>
              <FixtureIcon kind="volume" /> Âm lượng cuộc họp{' '}
              <input
                aria-label="Âm lượng mô phỏng"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
              <span>{volume}%</span>
            </label>
            <button onClick={() => setVolume(volume ? 0 : 78)}>
              {volume ? 'Tắt tiếng' : 'Bật tiếng'}
            </button>
            <small>Điều khiển mô phỏng trong preview</small>
          </div>
        }
        secondaryControls={
          <>
            <button className={controlClass} onClick={() => setPanel('Nhóm')}>
              <FixtureIcon kind="group" />
              Nhóm
            </button>
            <button className={controlClass} onClick={() => setPanel('Người tham gia')}>
              <FixtureIcon kind="people" /> Người tham gia
            </button>
            <button
              ref={panelButton}
              className={controlClass}
              aria-expanded={panel === 'Chat cuộc họp'}
              data-state={panel === 'Chat cuộc họp' ? 'active' : undefined}
              onClick={() => setPanel(panel === 'Chat cuộc họp' ? null : 'Chat cuộc họp')}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chat cuộc họp
            </button>
            <button
              className={controlClass}
              data-state="danger"
              onClick={() => {
                owner.end(context);
                setLeft(true);
              }}
            >
              <FixtureIcon kind="leave" />
              Rời cuộc gọi
            </button>
          </>
        }
      />
    );
    return (
      <>
        {left ? (
          <p role="status">Cuộc gọi mô phỏng đã kết thúc.</p>
        ) : inWorkspace ? (
          <WorkspaceShell
            workspace={workspaceFixture}
            channels={sidebarFixture}
            panel={{ kind: 'live', channelId: channel.channel.id }}
            onSelectChannel={() => {}}
            onOpenWorkspaceList={() => setInWorkspace(false)}
            chatPanel={null}
            callPanel={room}
            persistentCallControls={<span className="text-xs">Cuộc gọi đang hoạt động</span>}
          />
        ) : (
          room
        )}
        {createPortal(
          <>
            <button className={controlClass} onClick={() => setMode('slide')}>
              Slide mô phỏng
            </button>
            <button className={controlClass} onClick={() => setMode('video')}>
              Nguồn video
            </button>
            <button className={controlClass} onClick={() => setMode('custom')}>
              Nguồn tùy chỉnh
            </button>
            <button className={controlClass} onClick={() => setMode('grid')}>
              Không share
            </button>
            <button
              className={controlClass}
              onClick={async () => {
                await devices.start('camera');
                media.bindCameraPreview(sources[0]!, tracks[0]!);
                await apply(true);
              }}
            >
              Xác nhận camera ready
            </button>
            <button
              className={controlClass}
              onClick={() =>
                media.acceptEvent(
                  'media.source.changed',
                  event(
                    {
                      source: {
                        ...camera,
                        sourceId: 'camera-5',
                        producerId: 'producer-5',
                        ownerParticipantId: '7'.repeat(24),
                      },
                    },
                    1,
                  ),
                )
              }
            >
              Thêm camera thứ 5
            </button>
          </>,
          document.getElementById('fixture-controls')!,
        )}
      </>
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
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    root.unmount();
    owner.shutdown();
    devices.dispose();
    for (const track of audioDestination.stream.getTracks()) track.stop();
    void syntheticAudio.close();
    for (const track of [...stream.getTracks(), ...cameraStream.getTracks(), ...tracks])
      track.stop();
    window.removeEventListener('pagehide', cleanup);
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  import.meta.hot?.dispose(cleanup);
}

if (import.meta.env.DEV)
  void start().catch((error) => {
    document.getElementById('result')!.textContent = `FAIL · ${String(error)}`;
  });
