import {
  isSessionProjectionCurrent,
  sameSessionScope,
  screenPickerLeaseMs,
} from '@colearnia/contracts';
import type {
  ScreenPickerLease,
  SessionProjection,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { CallIdentity } from './callController';

type Snapshot = Readonly<{
  status: 'hidden' | 'unavailable' | 'idle' | 'acquiring' | 'reserved' | 'choosing' | 'selected';
  error?: string;
}>;
type ShareProjection = SessionProjectionCursor & { projection: SessionProjection };
type PickerPorts = {
  acquire(context: SessionProjectionCursor): Promise<ScreenPickerLease>;
  release(context: SessionProjectionCursor, lease: ScreenPickerLease): Promise<void>;
  capture(): Promise<MediaStream>;
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

// One instance per call generation. The call adapter feeds accepted M4 projections.
export class ScreenSharePicker {
  #context: SessionProjectionCursor | null = null;
  #latest: SessionProjectionCursor | undefined;
  #attempt: Attempt | undefined;
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
    let inDiscussion = this.#snapshot.status === 'hidden';
    this.#context = null;
    if (next) {
      const { projection, ...cursor } = next;
      const scope = projection.viewer.scope;
      inDiscussion = scope.type === 'GROUP' && scope.mode === 'DISCUSSION';
      this.#latest = { ...cursor, scope: { ...cursor.scope } };
      if (!inDiscussion && projection.permissions.publishScreen) this.#context = this.#latest;
    }
    const status = inDiscussion ? 'hidden' : this.#context ? 'idle' : 'unavailable';
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
    } else if (!this.#attempt && this.#snapshot.status !== status) {
      this.#publish({ status });
    }
  }

  async reserve() {
    if (this.#disposed || this.#attempt || !this.#context) return;
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
    const ended = () => this.#finish(attempt, 'Màn hình đã chọn không còn khả dụng. Hãy thử lại.');
    video.addEventListener('ended', ended, { once: true });
    attempt.detachEnded = () => video.removeEventListener('ended', ended);
    this.#publish({ status: 'selected' });
    return this.getSelection();
  }

  // The stream is borrowed. The picker still owns cleanup until publication is integrated.
  getSelection() {
    const attempt = this.#attempt;
    if (!attempt?.lease || !attempt.stream || this.now() >= attempt.deadline) return;
    return { lease: attempt.lease, stream: attempt.stream, signal: attempt.abort.signal };
  }

  cancel() {
    if (this.#attempt) this.#finish(this.#attempt);
  }

  dispose() {
    this.#disposed = true;
    this.cancel();
    this.#listeners.clear();
  }

  #finish(
    attempt: Attempt,
    error?: string,
    status: Snapshot['status'] = this.#context && !this.#disposed ? 'idle' : 'unavailable',
  ) {
    if (this.#attempt !== attempt) return;
    this.#attempt = undefined;
    clearTimeout(attempt.timer);
    attempt.detachEnded?.();
    attempt.abort.abort();
    for (const track of attempt.stream?.getTracks() ?? []) track.stop();
    if (attempt.lease) this.#release(attempt.context, attempt.lease);
    this.#publish({
      status,
      ...(error && { error }),
    });
  }

  #release(context: SessionProjectionCursor, lease: ScreenPickerLease) {
    // If the socket is gone or the ACK is lost, M4's reservation expires by TTL.
    void this.ports.release(context, lease).catch(() => {});
  }

  #publish(snapshot: Snapshot) {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}
