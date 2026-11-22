type AudioOutput = {
  track: MediaStreamTrack;
  node: MediaStreamAudioSourceNode;
  onEnded: () => void;
  references: number;
  playback: HTMLAudioElement;
};

// The call owns this graph. Consumers own their tracks and the graph borrows them.
export class AudioGraph {
  #context: AudioContext | undefined;
  #mix: GainNode | undefined;
  #outputs = new Map<string, AudioOutput>();
  #blocked = false;
  #closed = false;
  #resumeError: string | null = null;

  constructor(
    private readonly notify: () => void,
    private readonly createContext = () => new AudioContext(),
    private readonly createPlayback = () => new Audio(),
  ) {}

  get blocked() {
    return this.#blocked;
  }

  getDiagnostics() {
    return {
      contextState: this.#context?.state ?? 'not-created',
      blocked: this.#blocked,
      remoteAudioTracks: this.#outputs.size,
      resumeError: this.#resumeError,
      gain: this.#mix?.gain.value ?? null,
      tracks: [...this.#outputs.values()].map(({ track }) => ({
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      })),
    };
  }

  attach(track: MediaStreamTrack): () => void {
    if (this.#closed || track.kind !== 'audio' || track.readyState === 'ended') return () => {};

    let output = this.#outputs.get(track.id);
    if (!output) {
      const context = this.#getContext();
      const stream = new MediaStream([track]);
      // Chromium remote WebRTC audio can receive RTP without pulling decoded
      // samples into WebAudio until a media element consumes the stream.
      // This element stays muted: the graph remains the sole audible route.
      const playback = this.createPlayback();
      playback.muted = true;
      playback.srcObject = stream;
      let node: MediaStreamAudioSourceNode;
      try {
        node = context.createMediaStreamSource(stream);
      } catch (error) {
        playback.srcObject = null;
        throw error;
      }
      const mix = this.#mix!;
      const onEnded = () => this.#remove(track.id);
      track.addEventListener('ended', onEnded, { once: true });
      output = { track, node, playback, onEnded, references: 0 };
      this.#outputs.set(track.id, output);
      // Reserve headroom before adding another signal to the sum.
      mix.gain.value = 1 / this.#outputs.size;
      node.connect(mix);
      this.#startPlayback(output);
    }

    output.references++;
    const attached = output;
    this.#updateBlocked();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.#outputs.get(track.id) !== attached) return;
      if (--attached.references === 0) this.#remove(track.id);
    };
  }

  // Call directly from the user's click so the browser sees the activation.
  resume() {
    if (!this.#blocked || !this.#context) return;
    this.#resumeError = null;
    for (const output of this.#outputs.values()) this.#startPlayback(output);
    try {
      void this.#context.resume().then(this.#updateBlocked, (error: unknown) => {
        if (this.#closed) return;
        this.#resumeError = error instanceof Error ? error.name : 'UnknownError';
        this.#updateBlocked();
        this.notify();
      });
    } catch (error) {
      this.#resumeError = error instanceof Error ? error.name : 'UnknownError';
      this.notify();
    }
  }

  dispose() {
    this.#closed = true;
    const context = this.#context;
    this.#context = undefined;
    for (const id of this.#outputs.keys()) this.#remove(id);
    this.#mix?.disconnect();
    this.#mix = undefined;
    if (context) {
      context.removeEventListener('statechange', this.#updateBlocked);
      if (context.state !== 'closed') void context.close().catch(() => {});
    }
  }

  #getContext() {
    if (!this.#context) {
      this.#context = this.createContext();
      this.#mix = this.#context.createGain();
      this.#mix.connect(this.#context.destination);
      this.#context.addEventListener('statechange', this.#updateBlocked);
    }
    return this.#context;
  }

  #remove(id: string) {
    const output = this.#outputs.get(id);
    if (!output) return;
    this.#outputs.delete(id);
    output.track.removeEventListener('ended', output.onEnded);
    output.node.disconnect();
    output.playback.pause();
    output.playback.srcObject = null;
    if (this.#outputs.size === 0) this.#resumeError = null;
    if (this.#mix) this.#mix.gain.value = 1 / Math.max(1, this.#outputs.size);
    this.#updateBlocked();
  }

  #updateBlocked = () => {
    const blocked =
      !this.#closed &&
      this.#outputs.size > 0 &&
      (this.#context?.state !== 'running' || this.#resumeError !== null);
    if (blocked === this.#blocked) return;
    this.#blocked = blocked;
    this.notify();
  };

  #startPlayback(output: AudioOutput) {
    void output.playback.play().catch((error: unknown) => {
      if (this.#closed || this.#outputs.get(output.track.id) !== output) return;
      this.#resumeError = error instanceof Error ? error.name : 'UnknownError';
      this.#updateBlocked();
    });
  }
}
