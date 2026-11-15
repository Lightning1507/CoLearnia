type AudioOutput = {
  track: MediaStreamTrack;
  node: MediaStreamAudioSourceNode;
  onEnded: () => void;
  references: number;
};

// The call owns this graph. Consumers own their tracks and the graph borrows them.
export class AudioGraph {
  #context: AudioContext | undefined;
  #mix: GainNode | undefined;
  #outputs = new Map<string, AudioOutput>();
  #blocked = false;
  #closed = false;

  constructor(
    private readonly notify: () => void,
    private readonly createContext = () => new AudioContext(),
  ) {}

  get blocked() {
    return this.#blocked;
  }

  attach(track: MediaStreamTrack): () => void {
    if (this.#closed || track.kind !== 'audio' || track.readyState === 'ended') return () => {};

    let output = this.#outputs.get(track.id);
    if (!output) {
      const context = this.#getContext();
      const node = context.createMediaStreamSource(new MediaStream([track]));
      const mix = this.#mix!;
      const onEnded = () => this.#remove(track.id);
      track.addEventListener('ended', onEnded, { once: true });
      output = { track, node, onEnded, references: 0 };
      this.#outputs.set(track.id, output);
      // Reserve headroom before adding another signal to the sum.
      mix.gain.value = 1 / this.#outputs.size;
      node.connect(mix);
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
    void this.#context.resume().then(this.#updateBlocked, this.#updateBlocked);
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
    if (this.#mix) this.#mix.gain.value = 1 / Math.max(1, this.#outputs.size);
    this.#updateBlocked();
  }

  #updateBlocked = () => {
    const blocked = !this.#closed && this.#outputs.size > 0 && this.#context?.state !== 'running';
    if (blocked === this.#blocked) return;
    this.#blocked = blocked;
    this.notify();
  };
}
