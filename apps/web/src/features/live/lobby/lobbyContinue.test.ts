import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyDeviceCheck } from './LobbyDeviceCheck';
import { LobbyPreview } from './lobbyPreview';
import type { DeviceKind } from './lobbyPreview';
import { useLobbyPreview } from './useLobbyPreview';

// Inspect the component's actual button props/handler without a DOM or running effects.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useId: () => 'continue-test',
  useRef: () => ({ current: null }),
}));
vi.mock('./useLobbyPreview', () => ({ useLobbyPreview: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

type ButtonProps = { children?: ReactNode; disabled?: boolean; onClick?: () => void };
function continueButton(node: ReactNode): ButtonProps | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = continueButton(child);
      if (found) return found;
    }
  } else if (isValidElement<ButtonProps>(node)) {
    if (
      node.type === 'button' &&
      (node.props.children === 'Tiếp tục vào phiên' || node.props.children === 'Đang tiếp tục…')
    )
      return node.props;
    return continueButton(node.props.children);
  }
}

function fixture() {
  const preview = new LobbyPreview({ secure: true });
  let state = preview.getSnapshot();
  vi.spyOn(preview, 'getSnapshot').mockImplementation(() => state);
  const stop = vi.spyOn(preview, 'stop');
  const onContinue = vi.fn();
  const render = (continuePending = false) => {
    vi.mocked(useLobbyPreview).mockReturnValue({ state, preview });
    const button = continueButton(
      LobbyDeviceCheck({
        channelName: 'Phòng học',
        onBack: vi.fn(),
        onContinue,
        continuePending,
      }),
    );
    expect(button).toBeDefined();
    return button!;
  };
  const device = (kind: DeviceKind, patch: Partial<typeof state.camera>) => {
    state = { ...state, [kind]: { ...state[kind], ...patch } };
  };
  return { render, device, stop, onContinue };
}

describe('lobby continue preferences', () => {
  it.each(['camera', 'microphone'] as const)(
    'blocks while %s switches A to B and hands off B after success',
    (kind) => {
      const f = fixture();
      f.device(kind, { status: 'requesting', isActive: true, openedId: 'A', selectedId: 'B' });
      const pending = f.render();
      expect(pending.disabled).toBe(true);
      pending.onClick?.();
      expect(f.onContinue).not.toHaveBeenCalled();
      expect(f.stop).not.toHaveBeenCalled();

      f.device(kind, { status: 'ready', openedId: 'B' });
      const ready = f.render();
      expect(ready.disabled).toBe(false);
      ready.onClick?.();
      expect(f.onContinue).toHaveBeenCalledExactlyOnceWith({
        camera: { enabled: kind === 'camera', deviceId: kind === 'camera' ? 'B' : '' },
        microphone: { enabled: kind === 'microphone', deviceId: kind === 'microphone' ? 'B' : '' },
      });
      expect(f.stop.mock.calls).toEqual([['camera'], ['microphone']]);
    },
  );

  it.each(['camera', 'microphone'] as const)(
    'blocks the initial %s request and allows continuing with it off after cancellation',
    (kind) => {
      const f = fixture();
      f.device(kind, { status: 'requesting', isActive: false, selectedId: 'B' });
      expect(f.render().disabled).toBe(true);
      f.render().onClick?.();
      expect(f.onContinue).not.toHaveBeenCalled();
      f.device(kind, { status: 'off' });
      expect(f.render().disabled).toBe(false);
      f.render().onClick?.();
      expect(f.onContinue).toHaveBeenCalledExactlyOnceWith({
        camera: { enabled: false, deviceId: kind === 'camera' ? 'B' : '' },
        microphone: { enabled: false, deviceId: kind === 'microphone' ? 'B' : '' },
      });
    },
  );

  it.each(['camera', 'microphone'] as const)(
    'guards a stale continue handler when %s starts switching before rerender',
    (kind) => {
      const f = fixture();
      f.device(kind, { status: 'ready', isActive: true, openedId: 'A', selectedId: 'A' });
      const beforeSwitch = f.render();
      f.device(kind, { status: 'requesting', selectedId: 'B' });
      beforeSwitch.onClick?.();
      expect(f.onContinue).not.toHaveBeenCalled();
      expect(f.stop).not.toHaveBeenCalled();
    },
  );

  it('preserves the browser-default selection instead of substituting its opened device ID', () => {
    const f = fixture();
    for (const kind of ['camera', 'microphone'] as const) {
      f.device(kind, { status: 'ready', isActive: true, openedId: 'A', selectedId: '' });
    }
    f.render().onClick?.();
    expect(f.onContinue).toHaveBeenCalledExactlyOnceWith({
      camera: { enabled: true, deviceId: '' },
      microphone: { enabled: true, deviceId: '' },
    });
  });

  it('blocks duplicate submission while the consumer is pending', () => {
    const f = fixture();
    const button = f.render(true);
    expect(button.disabled).toBe(true);
    button.onClick?.();
    expect(f.onContinue).not.toHaveBeenCalled();
    expect(f.stop).not.toHaveBeenCalled();
  });
});
