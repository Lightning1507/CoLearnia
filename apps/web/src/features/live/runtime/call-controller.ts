import type { LiveContext } from '@colearnia/contracts';

export type CallIdentity = Readonly<
  Pick<LiveContext, 'sessionId' | 'epoch' | 'participantId' | 'callGeneration'>
>;

export type CallSnapshot =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'starting' | 'active'; identity: CallIdentity }>;

type DisposeRuntime = () => void;

// The media adapter owns partial resources until it returns their disposer. On failure or
// cancellation it must clean up partial work and observe the signal before publishing media.
type InitializeRuntime = (
  identity: CallIdentity,
  signal: AbortSignal,
) => DisposeRuntime | Promise<DisposeRuntime>;

class CallController {
  readonly identity: CallIdentity;
  #abort = new AbortController();
  #disposeRuntime: DisposeRuntime | undefined;

  constructor({ sessionId, epoch, participantId, callGeneration }: CallIdentity) {
    this.identity = Object.freeze({ sessionId, epoch, participantId, callGeneration });
  }

  async initialize(initialize: InitializeRuntime) {
    const { signal } = this.#abort;
    signal.throwIfAborted();
    const dispose = await initialize(this.identity, signal);
    if (signal.aborted) {
      dispose();
      signal.throwIfAborted();
    }
    this.#disposeRuntime = dispose;
  }

  dispose() {
    const dispose = this.#disposeRuntime;
    this.#disposeRuntime = undefined;
    this.#abort.abort();
    dispose?.();
  }
}

function sameCall(left: CallIdentity, right: CallIdentity) {
  return (
    left.sessionId === right.sessionId &&
    left.epoch === right.epoch &&
    left.participantId === right.participantId &&
    left.callGeneration === right.callGeneration
  );
}

type OwnedCall = {
  controller: CallController;
  ready: Promise<CallHandle>;
  reject: (reason: unknown) => void;
};

export type CallHandle = Readonly<Pick<CallController, 'identity'>>;

const idle: CallSnapshot = Object.freeze({ status: 'idle' });

// Create one owner per app/auth lifetime above the routes. Only the join/session flow
// acquires or ends ownership. Panels observe the snapshot and may freely unsubscribe.
export class CallControllerOwner {
  #current: OwnedCall | undefined;
  #closed = false;
  #snapshot: CallSnapshot = idle;
  #listeners = new Set<() => void>();

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  // Use only after a current, successful join ack. The caller still owns join, access
  // and takeover decisions. UI navigation never invokes this method.
  acquire(identity: CallIdentity, initialize: InitializeRuntime): Promise<CallHandle> {
    if (this.#closed) return Promise.reject(new Error('Call controller owner is closed'));
    if (this.#current) {
      if (sameCall(this.#current.controller.identity, identity)) return this.#current.ready;
      return Promise.reject(new Error('End the current call before acquiring a different call'));
    }

    const controller = new CallController(identity);
    let resolve!: (controller: CallHandle) => void;
    let reject!: (reason: unknown) => void;
    const ready = new Promise<CallHandle>((resolveReady, rejectReady) => {
      resolve = resolveReady;
      reject = rejectReady;
    });
    const call = { controller, ready, reject };
    this.#current = call;
    this.#snapshot = Object.freeze({ status: 'starting', identity: controller.identity });

    void Promise.resolve()
      .then(() => controller.initialize(initialize))
      .then(
        () => {
          if (this.#current !== call) return;
          this.#snapshot = Object.freeze({ status: 'active', identity: controller.identity });
          resolve(controller);
          this.#notify();
        },
        (error: unknown) => {
          if (this.#current === call) this.#release(call, error);
        },
      );
    this.#notify();
    return ready;
  }

  end(identity: CallIdentity) {
    const call = this.#current;
    if (call && sameCall(call.controller.identity, identity)) {
      this.#release(call, new DOMException('Call ended', 'AbortError'));
    }
  }

  shutdown() {
    this.#closed = true;
    const call = this.#current;
    if (call) this.#release(call, new DOMException('Call owner shut down', 'AbortError'));
  }

  #release(call: OwnedCall, reason: unknown) {
    this.#current = undefined;
    this.#snapshot = idle;
    call.reject(reason);
    try {
      call.controller.dispose();
    } finally {
      this.#notify();
    }
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }
}
