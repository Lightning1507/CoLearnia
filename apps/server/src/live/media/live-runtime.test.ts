import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/env.js';
import { createMediaRuntime } from './runtime.js';
import type { MediaRuntimeFailure } from './runtime.js';
import { startLiveRuntime } from './live-runtime.js';

vi.mock('./runtime.js', () => ({ createMediaRuntime: vi.fn() }));
function fixture() {
  const listeners = new Set<(event: MediaRuntimeFailure) => void>();
  const close = vi.fn();
  const runtime = {
    onFailure: (listener: (event: MediaRuntimeFailure) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close,
  } as unknown as Awaited<ReturnType<typeof createMediaRuntime>>;
  vi.mocked(createMediaRuntime).mockResolvedValue(runtime);
  return {
    runtime,
    close,
    listeners,
    die: () => {
      for (const listener of listeners)
        listener({ runtimeId: 'fixture-runtime', routerIds: ['router-a'] });
    },
  };
}
beforeEach(() => vi.clearAllMocks());
describe('app LIVE startup composition', () => {
  it('wires admission and registry failure through the startup entrypoint used by main', async () => {
    const f = fixture();
    const closeAdmission = vi.fn();
    const report = vi.fn();
    const registry = { handleRouterFailure: vi.fn(async () => []) };
    const media = await startLiveRuntime(loadConfig(), {
      closeAdmission,
      report,
      mountRegistry: () => registry,
    });
    f.die();
    expect(closeAdmission).toHaveBeenCalledOnce();
    expect(registry.handleRouterFailure).toHaveBeenCalledWith(['router-a']);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('SETTLED'));
    media.close();
    expect(f.listeners.size).toBe(0);
    expect(f.close).toHaveBeenCalledOnce();
    f.die();
    expect(registry.handleRouterFailure).toHaveBeenCalledOnce();
  });
  it('keeps admission wired while MAIN providers have not been mounted', async () => {
    const f = fixture();
    const closeAdmission = vi.fn(),
      report = vi.fn();
    const media = await startLiveRuntime(loadConfig(), { closeAdmission, report });
    f.die();
    expect(closeAdmission).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
    media.close();
  });
  it('closes runtime and admission when registry composition fails', async () => {
    const f = fixture();
    const closeAdmission = vi.fn();
    await expect(
      startLiveRuntime(loadConfig(), {
        closeAdmission,
        report: vi.fn(),
        mountRegistry: async () => {
          throw new Error('Provider unavailable');
        },
      }),
    ).rejects.toThrow('Provider unavailable');
    expect(closeAdmission).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.listeners.size).toBe(0);
  });
  it('reports registry failure without exposing exception details', async () => {
    const f = fixture();
    const report = vi.fn();
    const media = await startLiveRuntime(loadConfig(), {
      closeAdmission: vi.fn(),
      report,
      mountRegistry: () => ({
        handleRouterFailure: async () => {
          throw new Error('private-provider-error');
        },
      }),
    });
    f.die();
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('FAILED'));
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-provider-error');
    media.close();
  });
});
