import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCallTabPresence } from './callTabPresence';

class TestChannel {
  static all = new Set<TestChannel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    TestChannel.all.add(this);
  }
  postMessage(data: unknown) {
    for (const other of TestChannel.all) {
      if (other !== this && other.name === this.name)
        queueMicrotask(() => {
          if (TestChannel.all.has(other)) other.onmessage?.({ data });
        });
    }
  }
  close() {
    TestChannel.all.delete(this);
  }
}
const cleanups: (() => void)[] = [];
function tab(user = 'user-a') {
  const changed = vi.fn();
  const focus = vi.fn();
  const presence = createCallTabPresence(user, changed, focus);
  cleanups.push(() => presence.dispose());
  return { ...presence, changed, focus };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.stubGlobal('window', { BroadcastChannel: TestChannel });
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  TestChannel.all.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('discovers an already active tab, requests focus without credentials, and releases on leave', async () => {
  const a = tab();
  a.setActive(true);
  const b = tab();
  await vi.waitFor(() => expect(b.changed).toHaveBeenLastCalledWith(true));
  b.focusOther();
  await vi.waitFor(() => expect(a.focus).toHaveBeenCalledOnce());
  a.setActive(false);
  await vi.waitFor(() => expect(b.changed).toHaveBeenLastCalledWith(false));
});
it('does not expose hints or focus across account channels', async () => {
  const a = tab();
  a.setActive(true);
  const b = tab('user-b');
  await vi.advanceTimersByTimeAsync(4000);
  expect(b.changed).not.toHaveBeenCalledWith(true);
  b.focusOther();
  expect(a.focus).not.toHaveBeenCalled();
});
it('expires crashed/suspended peers and rediscovers them when heartbeats resume', async () => {
  const b = tab();
  const raw = new TestChannel('colearnia-call-presence:user-a');
  raw.postMessage({ type: 'active', id: 'crashed-tab' });
  await vi.waitFor(() => expect(b.changed).toHaveBeenLastCalledWith(true));
  await vi.advanceTimersByTimeAsync(12000);
  expect(b.changed).toHaveBeenLastCalledWith(false);
  raw.postMessage({ type: 'active', id: 'crashed-tab' });
  await vi.waitFor(() => expect(b.changed).toHaveBeenLastCalledWith(true));
});
it('disposes the channel and heartbeat and emits only allowlisted metadata', async () => {
  const send = vi.spyOn(TestChannel.prototype, 'postMessage');
  const a = tab();
  a.setActive(true);
  a.dispose();
  const count = send.mock.calls.length;
  await vi.advanceTimersByTimeAsync(12000);
  expect(send).toHaveBeenCalledTimes(count);
  expect(TestChannel.all.size).toBe(0);
  for (const [packet] of send.mock.calls)
    expect(Object.keys(packet as object).sort()).toEqual(['id', 'type']);
});
it('does not block when BroadcastChannel is unavailable or throws', () => {
  vi.stubGlobal('window', {});
  const a = tab();
  expect(() => {
    a.probe();
    a.setActive(true);
    a.focusOther();
  }).not.toThrow();
  expect(a.changed).toHaveBeenLastCalledWith(false);
  vi.stubGlobal('window', {
    BroadcastChannel: class {
      constructor() {
        throw new Error('Denied');
      }
    },
  });
  expect(() => tab().setActive(true)).not.toThrow();
});
