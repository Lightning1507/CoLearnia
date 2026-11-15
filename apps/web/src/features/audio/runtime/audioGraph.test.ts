import { describe, expect, it, vi } from 'vitest';
import { AudioGraph } from './audioGraph';

function audioFixture() {
  const track = Object.assign(new EventTarget(), {
    id: 'remote',
    kind: 'audio',
    readyState: 'live',
  });
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  const mix = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = Object.assign(new EventTarget(), {
    state: 'suspended',
    destination: {},
    createMediaStreamSource: vi.fn(() => node),
    createGain: vi.fn(() => mix),
    resume: vi.fn(async () => {
      context.state = 'running';
      context.dispatchEvent(new Event('statechange'));
    }),
    close: vi.fn(async () => {}),
  });
  const notify = vi.fn();
  const graph = new AudioGraph(notify, () => context as unknown as AudioContext);
  const attach = () => graph.attach(track as unknown as MediaStreamTrack);
  return { track, node, mix, context, graph, attach, notify };
}

describe('MAIN AudioGraph', () => {
  it('shares one audible route and disconnects after the last detach', () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { node, mix, context, graph, attach } = audioFixture();
      const first = attach();
      const second = attach();
      expect(graph.blocked).toBe(true);
      expect(node.connect).toHaveBeenCalledExactlyOnceWith(mix);
      expect(mix.connect).toHaveBeenCalledExactlyOnceWith(context.destination);
      expect(mix.gain.value).toBe(1);
      first();
      first();
      expect(node.disconnect).not.toHaveBeenCalled();
      second();
      expect(node.disconnect).toHaveBeenCalledOnce();
      expect(graph.blocked).toBe(false);
      graph.dispose();
      expect(context.close).toHaveBeenCalledOnce();
      expect(mix.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reserves headroom for each distinct track and restores it on removal', () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { mix, graph, attach } = audioFixture();
      attach();
      const other = Object.assign(new EventTarget(), {
        id: 'screen-audio',
        kind: 'audio',
        readyState: 'live',
      });
      const detach = graph.attach(other as unknown as MediaStreamTrack);
      expect(mix.gain.value).toBe(0.5);
      detach();
      expect(mix.gain.value).toBe(1);
      graph.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resumes from the user action and drops ended tracks', () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { track, node, context, graph, attach, notify } = audioFixture();
      const detach = attach();
      expect(context.resume).not.toHaveBeenCalled();
      graph.resume();
      expect(context.resume).toHaveBeenCalledOnce();
      expect(graph.blocked).toBe(false);
      expect(notify).toHaveBeenCalledTimes(2);
      track.dispatchEvent(new Event('ended'));
      detach();
      expect(node.disconnect).toHaveBeenCalledOnce();
      graph.dispose();
      attach();
      expect(node.connect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
