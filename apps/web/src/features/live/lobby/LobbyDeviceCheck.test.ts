import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyDeviceCheck } from './LobbyDeviceCheck';
import { LobbyPreview } from './lobbyPreview';
import type { DeviceKind, LobbyPreviewState } from './lobbyPreview';
import { useLobbyPreview } from './useLobbyPreview';

vi.mock('./useLobbyPreview', () => ({ useLobbyPreview: vi.fn() }));
afterEach(() => vi.mocked(useLobbyPreview).mockReset());

function renderPendingDevice(kind: DeviceKind, isActive: boolean) {
  const preview = new LobbyPreview({ secure: true });
  const initial = preview.getSnapshot();
  const state: LobbyPreviewState = {
    ...initial,
    [kind]: {
      ...initial[kind],
      status: 'requesting',
      selectedId: 'device-B',
      openedId: isActive ? 'device-A' : null,
      isActive,
      message: isActive ? 'Đang đổi thiết bị…' : 'Đang mở thiết bị…',
    },
  };
  vi.mocked(useLobbyPreview).mockReturnValue({ preview, state });
  return renderToStaticMarkup(
    createElement(LobbyDeviceCheck, {
      channelName: 'Phòng học',
      onBack: vi.fn(),
    }),
  );
}

function deviceButton(markup: string, label: string) {
  const button = markup.match(
    new RegExp(`<button[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?</button>`),
  );
  expect(button).not.toBeNull();
  return button?.[0] ?? '';
}

describe('lobby device state during acquisition', () => {
  it.each(['camera', 'microphone'] as const)(
    'shows %s as on while replacing its live track',
    (kind) => {
      const markup = renderPendingDevice(kind, true);
      const button = deviceButton(markup, `Tắt ${kind}`);
      expect(button).toContain('aria-pressed="true"');
      expect(button).not.toContain('M3 3l18 18');
      expect(markup).toContain('Đang đổi thiết bị');
    },
  );

  it.each(['camera', 'microphone'] as const)(
    'keeps %s off until the initial request actually succeeds',
    (kind) => {
      const markup = renderPendingDevice(kind, false);
      const button = deviceButton(markup, `Hủy mở ${kind}`);
      expect(button).toContain('aria-pressed="false"');
      expect(button).toContain('M3 3l18 18');
      expect(markup).not.toContain('Đang đổi thiết bị');
    },
  );
});
