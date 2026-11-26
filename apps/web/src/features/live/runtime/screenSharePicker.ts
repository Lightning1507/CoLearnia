import {
  isSessionProjectionCurrent,
  sameSessionScope,
  screenPickerLeaseMs,
  sessionControlBudget,
} from '@colearnia/contracts';
import type {
  ScreenPickerLease,
  SessionProjection,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { CallIdentity } from './callController';

type Snapshot = Readonly<{
  status:
    | 'hidden'
    | 'unavailable'
    | 'idle'
    | 'acquiring'
    | 'choosing'
    | 'publishing'
    | 'sharing'
    | 'stopping'
    | 'stopFailed';
  error?: string;
}>;
type ShareProjection = SessionProjectionCursor & { projection: SessionProjection };
type PickerPorts = {
  acquire(context: SessionProjectionCursor): Promise<ScreenPickerLease>;
  release(context: SessionProjectionCursor, lease: ScreenPickerLease): Promise<void>;
  capture(): Promise<MediaStream>;
  publish(
    context: SessionProjectionCursor,
    lease: ScreenPickerLease,
    stream: MediaStream,
    signal: AbortSignal,
  ): Promise<void>;
};
type Attempt = {
  context: SessionProjectionCursor;
  abort: AbortController;
  lease?: ScreenPickerLease;
  timer?: ReturnType<typeof setTimeout>;
  stream?: MediaStream;
  detachEnded?: () => void;
};

type Availability = 'hidden' | 'unavailable' | 'idle';
type PendingStop = {
  context: SessionProjectionCursor;
  lease: ScreenPickerLease;
  error: string | undefined;
  running: boolean;
};

// One instance per call generation. The call adapter feeds accepted M4 projections.
export class ScreenSharePicker {
  #context: SessionProjectionCursor | null = null;
  #latest: SessionProjectionCursor | undefined;
  #attempt: Attempt | undefined;
  #pendingStop: PendingStop | undefined;
  #availability: Availability = 'unavailable';
  #snapshot: Snapshot = { status: 'unavailable' };
  #listeners = new Set<() => void>();
  #disposed = false;

  constructor(
    private readonly identity: CallIdentity,
    private readonly ports: PickerPorts,
    private readonly now = () => performance.now(),
  ) {}

  getSnapshot = () => this.#snapshot;
  // The stage borrows this stream; the picker remains its only resource owner.
  getStream = () => (this.#snapshot.status === 'sharing' ? this.#attempt?.stream : undefined);
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  updateContext(next: ShareProjection | null) {
    if (this.#disposed) return;
    if (
      next &&
      (next.sessionId !== this.identity.sessionId ||
        next.epoch !== this.identity.epoch ||
        next.participantId !== this.identity.participantId ||
        next.callGeneration !== this.identity.callGeneration ||
        (this.#latest &&
          (!isSessionProjectionCurrent(next, this.#latest) ||
            (!this.#context && next.projectionSequence <= this.#latest.projectionSequence))))
    )
      return;
    const previous = this.#context;
    let inDiscussion = this.#availability === 'hidden';
    this.#context = null;
    if (next) {
      const { projection, ...cursor } = next;
      const scope = projection.viewer.scope;
      inDiscussion = scope.type === 'GROUP' && scope.mode === 'DISCUSSION';
      this.#latest = { ...cursor, scope: { ...cursor.scope } };
      if (!inDiscussion && projection.permissions.publishScreen) this.#context = this.#latest;
    }
    const status = inDiscussion ? 'hidden' : this.#context ? 'idle' : 'unavailable';
    this.#availability = status;
    const changed =
      previous &&
      (!this.#context ||
        previous.audienceEpoch !== this.#context.audienceEpoch ||
        !sameSessionScope(previous.scope, this.#context.scope));
    if (changed && this.#attempt) {
      this.#finish(
        this.#attempt,
        'Lượt chia sẻ đã hủy vì phòng hoặc quyền chia sẻ thay đổi.',
        status,
      );
    } else if (!this.#attempt) {
      if (this.#pendingStop) this.#showStop(this.#pendingStop);
      else if (this.#snapshot.status !== status) this.#publish({ status });
    }
  }

  // The browser requires capture to start in the button's user activation.
  async start() {
    if (this.#disposed || this.#attempt || this.#pendingStop || !this.#context) return;
    const attempt: Attempt = {
      context: this.#context,
      abort: new AbortController(),
    };
    this.#attempt = attempt;
    let stream: MediaStream;
    try {
      const selection = this.ports.capture();
      this.#publish({ status: 'choosing' });
      stream = await selection;
    } catch {
      this.#finish(attempt, 'Bạn chưa chọn nội dung chia sẻ.');
      return;
    }
    if (this.#attempt !== attempt) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    attempt.stream = stream;
    const video = stream.getVideoTracks()[0];
    if (video?.readyState !== 'live') {
      this.#finish(attempt, 'Màn hình đã chọn không còn khả dụng. Hãy thử lại.');
      return;
    }
    const ended = () => this.#finish(attempt, 'Đã dừng chia sẻ màn hình.');
    video.addEventListener('ended', ended, { once: true });
    attempt.detachEnded = () => video.removeEventListener('ended', ended);

    // Reserve with the latest accepted cursor after the user selects a source.
    // The server is still the authority for exclusivity and SCREEN publication.
    const context = this.#context;
    if (!context) {
      this.#finish(attempt, 'Bạn không còn quyền chia sẻ màn hình.');
      return;
    }
    attempt.context = context;
    const deadline = this.now() + screenPickerLeaseMs;
    this.#publish({ status: 'acquiring' });
    let lease: ScreenPickerLease;
    try {
      lease = await this.ports.acquire(context);
    } catch (error) {
      this.#finish(
        attempt,
        error instanceof Error && error.message === 'SHARE_BUSY'
          ? 'Đang có người chia sẻ. Hãy thử lại khi chỗ trống.'
          : 'Không thể bắt đầu chia sẻ. Hãy thử lại.',
      );
      return;
    }
    if (this.#attempt !== attempt) {
      this.#release(context, lease);
      return;
    }
    attempt.lease = lease;
    if (this.now() >= deadline) {
      this.#finish(attempt, 'Đã hết thời gian bắt đầu chia sẻ. Hãy thử lại.');
      return;
    }
    // SCREEN commit checks the lease. Finishing after the commit, such as
    // publishing screen audio, has its own deadline.
    attempt.timer = setTimeout(() => {
      this.#finish(attempt, 'Không thể xác nhận nội dung chia sẻ. Hãy thử lại.');
    }, sessionControlBudget.foregroundTransitionTimeoutMs);
    this.#publish({ status: 'publishing' });
    try {
      await this.ports.publish(context, lease, stream, attempt.abort.signal);
      if (this.#attempt !== attempt) return;
      clearTimeout(attempt.timer);
      this.#publish({ status: 'sharing' });
    } catch {
      this.#finish(attempt, 'Không thể phát nội dung chia sẻ. Hãy thử lại.');
    }
  }

  cancel() {
    if (this.#attempt) this.#finish(this.#attempt);
    else if (this.#pendingStop) void this.#confirmStop(this.#pendingStop);
  }

  dispose() {
    this.#disposed = true;
    if (this.#attempt) this.#finish(this.#attempt);
    this.#listeners.clear();
  }

  #finish(
    attempt: Attempt,
    error?: string,
    status: Availability = this.#disposed ? 'unavailable' : this.#availability,
  ) {
    if (this.#attempt !== attempt) return;
    const needsConfirmation =
      this.#snapshot.status === 'sharing' || this.#snapshot.status === 'publishing';
    this.#attempt = undefined;
    clearTimeout(attempt.timer);
    attempt.detachEnded?.();
    attempt.abort.abort();
    for (const track of attempt.stream?.getTracks() ?? []) track.stop();
    if (attempt.lease && needsConfirmation) {
      const stop = { context: attempt.context, lease: attempt.lease, error, running: false };
      this.#pendingStop = stop;
      void this.#confirmStop(stop);
      return;
    }
    if (attempt.lease) this.#release(attempt.context, attempt.lease);
    this.#publish({
      status,
      ...(error && { error }),
    });
  }

  #showStop(stop: PendingStop) {
    if (this.#disposed) return;
    if (this.#availability !== 'idle') {
      this.#publish({
        status: this.#availability,
        error: stop.running
          ? 'Đang xác nhận dừng chia sẻ…'
          : 'Chưa xác nhận được việc dừng chia sẻ.',
      });
      return;
    }
    this.#publish(
      stop.running
        ? { status: 'stopping' }
        : { status: 'stopFailed', error: 'Chưa xác nhận được việc dừng chia sẻ. Hãy thử lại.' },
    );
  }

  async #confirmStop(stop: PendingStop) {
    if (this.#pendingStop !== stop || stop.running) return;
    stop.running = true;
    this.#showStop(stop);
    try {
      await this.ports.release(stop.context, stop.lease);
    } catch {
      stop.running = false;
      this.#showStop(stop);
      return;
    }
    this.#pendingStop = undefined;
    if (!this.#disposed)
      this.#publish({
        status: this.#availability,
        error: stop.error ?? 'Đã dừng chia sẻ màn hình.',
      });
  }

  #release(context: SessionProjectionCursor, lease: ScreenPickerLease) {
    // Server-side connection cleanup also retires an active publication.
    void this.ports.release(context, lease).catch(() => {});
  }

  #publish(snapshot: Snapshot) {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}
