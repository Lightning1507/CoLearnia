// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTransientNotice } from './useTransientNotice';

function Notice({ message }: { message: string }) {
  return createElement('p', null, useTransientNotice(message));
}

it('expires after three seconds and gives a replacement notice a full interval', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const container = document.createElement('div');
  const root = createRoot(container);
  const show = (message: string) => act(() => root.render(createElement(Notice, { message })));
  const advance = (duration: number) => act(() => void vi.advanceTimersByTime(duration));
  try {
    show('Mất kết nối');
    advance(2999);
    expect(container.textContent).toBe('Mất kết nối');
    show('Hết thời gian chờ');
    advance(2999);
    expect(container.textContent).toBe('Hết thời gian chờ');
    advance(1);
    expect(container.textContent).toBe('');
    show('');
    show('Hết thời gian chờ');
    expect(container.textContent).toBe('Hết thời gian chờ');
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
