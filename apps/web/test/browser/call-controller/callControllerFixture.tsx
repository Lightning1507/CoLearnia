import { StrictMode, act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import type { CallHandle, CallIdentity } from '../../../src/features/live/runtime/callController';
import { useCallSnapshot } from '../../../src/features/live/runtime/callControllerContext';

const identity: CallIdentity = {
  sessionId: '111111111111111111111111',
  epoch: '10000000-0000-4000-8000-000000000003',
  participantId: '222222222222222222222222',
  callGeneration: 2,
};

function CallStatus({ id }: { id: string }) {
  const call = useCallSnapshot();
  return <output id={id}>{call.status}</output>;
}

export function RoomFixture() {
  const [panel, setPanel] = useState<'call' | 'chat' | 'board' | null>('call');
  return (
    <>
      <button id="open" onClick={() => setPanel('call')}>
        Cuộc gọi
      </button>
      <button id="chat" onClick={() => setPanel('chat')}>
        Chat
      </button>
      <button id="board" onClick={() => setPanel('board')}>
        Bảng
      </button>
      <button id="close" onClick={() => setPanel(null)}>
        Đóng panel
      </button>
      <Link id="workspace" to="/workspace">
        Workspace
      </Link>
      {panel === 'call' && (
        <>
          <CallStatus id="stage" />
          <CallStatus id="controls" />
        </>
      )}
      {panel === 'chat' && <section>Panel chat</section>}
      {panel === 'board' && <section>Panel bảng</section>}
    </>
  );
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function click(id: string) {
  const target = document.getElementById(id);
  check(target, `Thiếu điều khiển ${id}`);
  await act(() => target.click());
}

async function verifyLifecycle(container: HTMLElement) {
  const owner = new CallControllerOwner();
  const root = createRoot(container);
  let activeListeners = 0;
  let totalSubscriptions = 0;
  let initializations = 0;
  let disposals = 0;
  const subscribe = owner.subscribe;
  owner.subscribe = (listener) => {
    activeListeners += 1;
    totalSubscriptions += 1;
    const unsubscribe = subscribe(listener);
    return () => {
      activeListeners -= 1;
      unsubscribe();
    };
  };
  const initialize = () => {
    initializations += 1;
    return () => {
      disposals += 1;
    };
  };

  const verifyListeners = (expected: number) => {
    check(activeListeners === expected, `Số listener đang hoạt động phải là ${expected}`);
  };
  const verifyStatus = (expected: string) => {
    for (const id of ['stage', 'controls']) {
      check(document.getElementById(id)?.textContent === expected, `${id} phải nhận ${expected}`);
    }
  };
  const verifyCounts = (expectedDisposals: number) => {
    check(initializations === 1, 'Runtime phải khởi tạo đúng một lần');
    check(disposals === expectedDisposals, `Số lần dọn runtime phải là ${expectedDisposals}`);
  };

  try {
    await act(() => {
      root.render(
        <StrictMode>
          <CallControllerProvider owner={owner}>
            <MemoryRouter initialEntries={['/room']}>
              <Routes>
                <Route path="/room" element={<RoomFixture />} />
                <Route
                  path="/workspace"
                  element={
                    <Link id="room" to="/room">
                      Về phòng
                    </Link>
                  }
                />
              </Routes>
            </MemoryRouter>
          </CallControllerProvider>
        </StrictMode>,
      );
    });
    verifyStatus('idle');
    verifyListeners(2);
    check(totalSubscriptions > 2, 'StrictMode phải chạy lại effect subscription');

    let handle: CallHandle | undefined;
    await act(async () => {
      handle = await owner.acquire(identity, initialize);
    });
    verifyStatus('active');

    for (const panel of ['chat', 'board', 'close', 'close']) {
      await click(panel);
      verifyListeners(0);
      verifyCounts(0);
      check(owner.getSnapshot().status === 'active', 'Ẩn panel phải giữ cuộc gọi active');
      await click('open');
      verifyListeners(2);
      verifyStatus('active');
    }

    await click('workspace');
    verifyListeners(0);
    await click('room');
    verifyListeners(2);
    verifyStatus('active');
    check((await owner.acquire(identity, initialize)) === handle, 'Handle phải giữ nguyên');
    verifyCounts(0);

    await act(() => owner.end(identity));
    verifyStatus('idle');
    verifyCounts(1);
  } finally {
    await act(() => root.unmount());
    owner.shutdown();
  }
  verifyListeners(0);
  verifyCounts(1);
}

if (import.meta.env.DEV) {
  const container = document.getElementById('root');
  const result = document.getElementById('result');
  check(container && result, 'Thiếu khung hiển thị kiểm thử');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  void verifyLifecycle(container).then(
    () => {
      result.textContent = 'PASS · Panel, route, StrictMode, listener và cleanup';
    },
    (error: unknown) => {
      result.textContent = `FAIL · ${String(error)}`;
      console.error(error);
    },
  );
}
