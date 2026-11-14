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
    | 'reserved'
    | 'choosing'
    | 'selected'
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
  publish?(
    context: SessionProjectionCursor,
    lease: ScreenPickerLease,
    stream: MediaStream,
    signal: AbortSignal,
  ): Promise<void>;
};
type Attempt = {
  context: SessionProjectionCursor;
  deadline: number;
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

  async reserve() {
    if (this.#disposed || this.#attempt || this.#pendingStop || !this.#context) return;
    const attempt: Attempt = {
      context: this.#context,
      // The server cannot reserve before this request. Using its fixed TTL from
      // dispatch is conservative and does not depend on synchronized wall clocks.
      deadline: this.now() + screenPickerLeaseMs,
      abort: new AbortController(),
    };
    this.#attempt = attempt;
    this.#publish({ status: 'acquiring' });
    let lease: ScreenPickerLease;
    try {
      lease = await this.ports.acquire(attempt.context);
    } catch (error) {
      if (this.#attempt === attempt)
        this.#finish(
          attempt,
          error instanceof Error && error.message === 'SHARE_BUSY'
            ? 'Đang có người chia sẻ. Hãy thử lại khi chỗ trống.'
            : 'Không giữ được chỗ chia sẻ. Hãy thử lại.',
        );
      return;
    }
    if (this.#attempt !== attempt) {
      this.#release(attempt.context, lease);
      return;
    }
    attempt.lease = lease;
    const remaining = attempt.deadline - this.now();
    if (remaining <= 0) {
      this.#finish(attempt, 'Đã hết thời gian chọn màn hình. Hãy thử lại.');
      return;
    }
    attempt.timer = setTimeout(() => {
      this.#finish(attempt, 'Đã hết thời gian chọn màn hình. Hãy thử lại.');
    }, remaining);
    this.#publish({ status: 'reserved' });
  }

  // Call directly from a click. There is no network request or await before capture().
  async choose() {
    const attempt = this.#attempt;
    if (!attempt?.lease || this.#snapshot.status !== 'reserved') return;
    if (this.now() >= attempt.deadline) {
      this.#finish(attempt, 'Đã hết thời gian chọn màn hình. Hãy thử lại.');
      return;
    }
    let stream: MediaStream;
    try {
      const selection = this.ports.capture();
      this.#publish({ status: 'choosing' });
      stream = await selection;
    } catch {
      this.#finish(attempt, 'Chưa chọn được màn hình. Hãy thử lại.');
      return;
    }
    if (this.#attempt !== attempt || this.now() >= attempt.deadline) {
      for (const track of stream.getTracks()) track.stop();
      this.#finish(attempt, 'Đã hết thời gian chọn màn hình. Hãy thử lại.');
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
    this.#publish({ status: 'selected' });
    if (!this.ports.publish) return this.getSelection();
    // After capture the server checks the reservation at SCREEN commit. A local
    // picker timeout could otherwise stop an already committed SCREEN before its ACK.
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => {
      this.#finish(attempt, 'Không thể xác nhận nội dung chia sẻ. Hãy thử lại.');
    }, sessionControlBudget.foregroundTransitionTimeoutMs);
    this.#publish({ status: 'publishing' });
    try {
      await this.ports.publish(attempt.context, attempt.lease, stream, attempt.abort.signal);
      if (this.#attempt !== attempt) return;
      clearTimeout(attempt.timer);
      this.#publish({ status: 'sharing' });
    } catch {
      this.#finish(attempt, 'Không thể phát nội dung chia sẻ. Hãy thử lại.');
    }
  }

  // The stream is borrowed. The picker still owns cleanup until publication is integrated.
  getSelection() {
    const attempt = this.#attempt;
    if (!attempt?.lease || !attempt.stream || this.now() >= attempt.deadline) return;
    return { lease: attempt.lease, stream: attempt.stream, signal: attempt.abort.signal };
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
