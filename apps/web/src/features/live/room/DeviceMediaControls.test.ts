// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DeviceMedia } from '../runtime/deviceMedia';
import { DeviceMediaControls } from './DeviceMediaControls';

it('keeps an unconfirmed server close visible until a retry confirms it', async () => {
  const track = Object.assign(new EventTarget(), {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;
  const capture = vi.fn(async () => ({ getTracks: () => [track] }) as MediaStream);
  const close = vi.fn(async () => {
    throw new Error('Close ACK lost');
  });
  const retry = vi.fn(async () => {}).mockRejectedValueOnce(new Error('Still no ACK'));
  const devices = new DeviceMedia(capture, async () => ({ close }), {}, retry);
  devices.updateContext({
    sessionId: '1'.repeat(24),
    epoch: crypto.randomUUID(),
    callGeneration: 1,
    audienceEpoch: 0,
    policyRevision: 0,
    scope: { type: 'MAIN' },
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  try {
    await devices.start('microphone');
    await devices.stop('microphone');
    act(() => root.render(createElement(DeviceMediaControls, { devices, compact: true })));
    const warning = 'Chưa xác nhận được việc đóng nguồn';
    expect(container.textContent).toContain(warning);
    act(() => void vi.advanceTimersByTime(3001));
    expect(container.textContent).toContain(warning);
    const retryClose = () =>
      act(async () => {
        container
          .querySelector<HTMLButtonElement>('[aria-label="Thử đóng nguồn mic lại"]')!
          .click();
      });
    await retryClose();
    expect(container.textContent).toContain(warning);
    await retryClose();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain(warning);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
