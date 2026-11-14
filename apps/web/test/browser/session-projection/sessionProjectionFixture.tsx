import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  SessionProjectionCursor,
  SessionProjection,
  SessionResyncInput,
} from '@colearnia/contracts';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { RoomShell } from '../../../src/features/live/room/RoomShell';
import { createSessionProjectionInitializer } from '../../../src/features/live/runtime/sessionProjectionSocket';
import type { SessionProjectionSocket } from '../../../src/features/live/runtime/sessionProjectionSocket';
import type { SessionProjectionRuntime } from '../../../src/features/live/runtime/sessionProjectionRuntime';
import {
  useAudienceValue,
  useSessionProjection,
} from '../../../src/features/live/runtime/useSessionProjection';
import '../../../src/styles/global.css';

// Protocol fixture only: no auth, server, camera, mic or group provider.
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const identity = {
  sessionId: '1'.repeat(24),
  epoch: uuid(1),
  participantId: '2'.repeat(24),
  callGeneration: 1,
};
type Listener = (packet: unknown) => void;
const listeners = new Map<string, Listener>();
const requests: { input: SessionResyncInput; ack: Listener }[] = [];
const socket: SessionProjectionSocket = {
  connected: true,
  on: (name, listener) => {
    listeners.set(name, listener);
  },
  off: (name) => {
    listeners.delete(name);
  },
  emit: (_name, input, ack) => {
    requests.push({ input, ack });
  },
};
const owner = new CallControllerOwner();
let runtime: SessionProjectionRuntime;
let current = cursor(1, 1, 10);
function cursor(sequence: number, audience: number, group?: number): SessionProjectionCursor {
  return {
    ...identity,
    projectionSequence: sequence,
    audienceEpoch: audience,
    policyRevision: sequence,
    scope: group ? { type: 'GROUP', groupId: uuid(group) } : { type: 'MAIN' },
  };
}
function projection(value: SessionProjectionCursor): SessionProjection {
  return {
    sessionId: value.sessionId,
    epoch: value.epoch,
    policyRevision: value.policyRevision,
    phase: 'GUIDANCE',
    hostParticipantId: identity.participantId,
    viewer: {
      participantId: identity.participantId,
      role: 'HOST',
      callGeneration: 1,
      audienceEpoch: value.audienceEpoch,
      scope: value.scope.type === 'MAIN' ? value.scope : { ...value.scope, mode: 'DISCUSSION' },
    },
    participants: [
      { participantId: identity.participantId, role: 'HOST', displayName: 'Người dùng fixture' },
    ],
    groups: [],
    permissions: {
      publishMic: true,
      publishCamera: true,
      publishScreen: value.scope.type === 'MAIN',
      readBoard: true,
      drawBoard: true,
      freezeBoard: false,
    },
  };
}
function sendEvent(value: SessionProjectionCursor) {
  listeners.get('participant.scopeChanged')?.({
    event: 'participant.scopeChanged',
    ...value,
    projection: projection(value),
  });
}
function snapshot(value: SessionProjectionCursor, request = requests.at(-1)!) {
  const snapshotId = uuid(100 + value.projectionSequence);
  // Parts precede ACK to exercise the actual socket adapter descriptor gate.
  listeners.get('session.snapshot')?.({
    event: 'session.snapshot',
    ...value,
    requestId: request.input.requestId,
    snapshotId,
    partIndex: 0,
    partCount: 1,
    fragment: JSON.stringify(projection(value)),
  });
  request.ack({
    requestId: request.input.requestId,
    data: { status: 'completed', result: { snapshotId, partCount: 1 } },
  });
}

export function Fixture() {
  const state = useSessionProjection(runtime);
  const [panel, setPanel] = useState(false);
  const [result, setResult] = useState('Audience A đã đồng bộ.');
  const chat = useAudienceValue<string>(runtime, 'chat');
  function switchAudiences() {
    const a = runtime.cache.capture();
    if (!a) return;
    runtime.resync();
    const oldA = requests.at(-1)!;
    sendEvent(cursor(2, 2));
    const oldMain = requests.at(-1)!;
    current = cursor(3, 3, 11);
    sendEvent(current);
    snapshot(current);
    const b = runtime.cache.capture();
    if (!b) {
      setResult('FAIL: snapshot B chưa đồng bộ.');
      return;
    }
    runtime.cache.write(b, 'chat', 'Nội dung riêng B');
    snapshot(cursor(2, 2), oldMain);
    snapshot(cursor(1, 1, 10), oldA);
    sendEvent(cursor(99, 1, 10));
    const url = URL.createObjectURL(new Blob(['late A image']));
    const acceptedImage = runtime.cache.retain(a, () => URL.revokeObjectURL(url));
    const acceptedCache = runtime.cache.write(a, 'chat', 'Nội dung cũ A');
    setResult(
      !acceptedImage && !acceptedCache
        ? 'PASS: đã chặn snapshot, event, cache và ảnh cũ A.'
        : 'FAIL: dữ liệu cũ lọt qua.',
    );
  }
  return (
    <CallControllerProvider owner={owner}>
      <main className="mx-auto grid max-w-5xl gap-4 p-6 text-stone-800">
        <h1 className="text-xl font-bold">SCRUM-85 — kiểm thử đồng bộ audience</h1>
        <p>Fixture giao thức; không phải cuộc gọi thật.</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded border p-2"
            onClick={switchAudiences}
            disabled={state.status !== 'ready' || state.cursor?.audienceEpoch !== 1}
          >
            A → MAIN → B đảo thứ tự
          </button>
          <button
            className="rounded border p-2"
            disabled={state.status !== 'ready'}
            onClick={() => {
              current = {
                ...current,
                projectionSequence: current.projectionSequence + 2,
                policyRevision: current.policyRevision + 2,
              };
              sendEvent(current);
              setResult('Đã tạo gap; dữ liệu riêng bị khóa trong khi đồng bộ.');
            }}
          >
            Tạo gap
          </button>
          <button
            className="rounded border p-2"
            disabled={state.status === 'closed' || state.status === 'ready'}
            onClick={() => {
              if (state.status === 'error') runtime.resync();
              snapshot(current);
              setResult('Snapshot mới đã khôi phục state.');
            }}
          >
            Khôi phục snapshot
          </button>
          <button className="rounded border p-2" onClick={() => setPanel(!panel)}>
            Đổi panel
          </button>
          <button className="rounded border p-2" onClick={() => owner.end(identity)}>
            Kết thúc fixture
          </button>
        </div>
        <p role="status">{result}</p>
        <p>
          State: {state.status} · sequence {state.cursor?.projectionSequence ?? '—'} · audience{' '}
          {state.cursor?.audienceEpoch ?? '—'}
        </p>
        <RoomShell
          channelName="Phòng fixture SCRUM-85"
          sessionId={identity.sessionId}
          stage={
            state.status === 'ready' ? (
              <p>
                {chat ?? 'Chưa có nội dung riêng'} · {state.cursor?.scope.type}
              </p>
            ) : (
              <p>Đang đồng bộ — thao tác riêng bị khóa.</p>
            )
          }
          sidePanel={
            panel
              ? {
                  label: 'Chat fixture',
                  content: <p>{chat ?? 'Nội dung riêng đã được dọn.'}</p>,
                  onBackToStage: () => setPanel(false),
                }
              : undefined
          }
          controls={<p>Trạng thái nguồn chỉ lấy từ projection đã đồng bộ.</p>}
        />
      </main>
    </CallControllerProvider>
  );
}

const root = createRoot(document.getElementById('root')!);
let disposed = false;
void owner
  .acquire(
    identity,
    createSessionProjectionInitializer({
      owner,
      socket,
      onRuntime: (value) => {
        runtime = value;
      },
    }),
  )
  .then(
    () => {
      if (disposed) return;
      snapshot(current);
      runtime.cache.write(runtime.cache.capture()!, 'chat', 'Nội dung riêng A');
      root.render(
        <StrictMode>
          <Fixture />
        </StrictMode>,
      );
    },
    () => {
      if (!disposed) root.render(<p role="alert">Không khởi tạo được fixture.</p>);
    },
  );
const pagehide = () => owner.shutdown();
window.addEventListener('pagehide', pagehide, { once: true });
import.meta.hot?.dispose(() => {
  disposed = true;
  window.removeEventListener('pagehide', pagehide);
  owner.shutdown();
  root.unmount();
});
