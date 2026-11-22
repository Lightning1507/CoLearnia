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
  const playbacks: {
    muted: boolean;
    srcObject: MediaStream | null;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  }[] = [];
  const graph = new AudioGraph(
    notify,
    () => context as unknown as AudioContext,
    () => {
      const playback = {
        muted: false,
        srcObject: null as MediaStream | null,
        play: vi.fn(async () => {}),
        pause: vi.fn(),
      };
      playbacks.push(playback);
      return playback as unknown as HTMLAudioElement;
    },
  );
  const attach = () => graph.attach(track as unknown as MediaStreamTrack);
  return { track, node, mix, context, graph, attach, notify, playbacks };
}

describe('MAIN AudioGraph', () => {
  it('ignores playback rejection after its borrowed track is detached', async () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { graph, attach, playbacks } = audioFixture();
      const detach = attach();
      let reject!: (error: Error) => void;
      playbacks[0]!.play.mockReturnValueOnce(
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
      );
      graph.resume();
      detach();
      reject(new DOMException('late playback', 'AbortError'));
      await Promise.resolve();
      expect(graph.getDiagnostics()).toMatchObject({
        remoteAudioTracks: 0,
        blocked: false,
        resumeError: null,
      });
      graph.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('primes remote decoding silently and releases the media element on last detach', () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { attach, graph, playbacks, node, mix } = audioFixture();
      const detach = attach();
      const second = attach();
      expect(playbacks).toHaveLength(1);
      expect(playbacks[0]!.muted).toBe(true);
      expect(playbacks[0]!.play).toHaveBeenCalledOnce();
      expect(playbacks[0]!.srcObject).not.toBeNull();
      expect(node.connect).toHaveBeenCalledExactlyOnceWith(mix);
      detach();
      expect(playbacks[0]!.pause).not.toHaveBeenCalled();
      second();
      expect(playbacks[0]!.pause).toHaveBeenCalledOnce();
      expect(playbacks[0]!.srcObject).toBeNull();
      graph.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('retains a safe error name when the browser rejects playback recovery', async () => {
    vi.stubGlobal('MediaStream', class {});
    try {
      const { graph, context, attach } = audioFixture();
      attach();
      context.resume.mockRejectedValueOnce(new DOMException('private details', 'NotAllowedError'));
      graph.resume();
      await vi.waitFor(() =>
        expect(graph.getDiagnostics()).toMatchObject({
          contextState: 'suspended',
          blocked: true,
          remoteAudioTracks: 1,
          resumeError: 'NotAllowedError',
        }),
      );
      graph.resume();
      expect(graph.getDiagnostics()).toMatchObject({
        contextState: 'running',
        blocked: false,
        remoteAudioTracks: 1,
        resumeError: null,
      });
      graph.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
