import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { types as MediaTypes } from 'mediasoup';
import { loadConfig } from '../../config/env.js';
import { createMediaRuntime } from './runtime.js';

async function fixture() {
  const events = new EventEmitter();
  const observer = new EventEmitter();
  const routerObserver = new EventEmitter();
  const router = {
    id: 'owned-router',
    closed: false,
    observer: routerObserver,
    close: vi.fn(() => {
      router.closed = true;
      routerObserver.emit('close');
    }),
  };
  const worker = {
    closed: false,
    on: events.on.bind(events),
    observer,
    createWebRtcServer: vi.fn(async () => ({ closed: false })),
    createRouter: vi.fn(async () => {
      observer.emit('newrouter', router);
      return router;
    }),
    close: vi.fn(() => {
      worker.closed = true;
      router.close();
    }),
  };
  const runtime = await createMediaRuntime(loadConfig({ NODE_ENV: 'test' }), {
    createWorker: async () => worker as unknown as MediaTypes.Worker,
  });
  return {
    runtime,
    router,
    worker,
    die: () => {
      worker.closed = true;
      router.close();
      events.emit('died', new Error('fixture'));
    },
  };
}
describe('media worker failure notification', () => {
  it('captures Router IDs even though worker closes Routers before emitting died', async () => {
    const f = await fixture();
    await f.runtime.createSessionRouter();
    const listener = vi.fn();
    f.runtime.onFailure(listener);
    f.die();
    f.die();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ routerIds: ['owned-router'] }));
    expect(f.runtime.isReady()).toBe(false);
    await expect(f.runtime.createSessionRouter()).rejects.toThrow();
    expect(f.worker.createRouter).toHaveBeenCalledTimes(1);
    f.runtime.close();
  });
  it('does not attribute a Router closed normally to a later worker failure', async () => {
    const f = await fixture();
    const router = await f.runtime.createSessionRouter();
    router.close();
    const listener = vi.fn();
    f.runtime.onFailure(listener);
    f.die();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ routerIds: [] }));
    f.runtime.close();
  });
  it('does not treat intentional shutdown as worker death or notify unsubscribed listeners', async () => {
    const f = await fixture();
    const listener = vi.fn();
    f.runtime.onFailure(listener)();
    f.runtime.close();
    f.die();
    expect(listener).not.toHaveBeenCalled();
    expect(f.runtime.isReady()).toBe(false);
  });
  it('isolates listener errors and replays the immutable failure to late subscribers', async () => {
    const f = await fixture();
    await f.runtime.createSessionRouter();
    f.runtime.onFailure(() => {
      throw new Error('fixture');
    });
    const listener = vi.fn();
    f.runtime.onFailure(listener);
    f.die();
    const late = vi.fn();
    f.runtime.onFailure(late);
    expect(late.mock.calls[0]![0]).toBe(listener.mock.calls[0]![0]);
    expect(Object.isFrozen(late.mock.calls[0]![0].routerIds)).toBe(true);
    f.runtime.close();
  });
});
