import { sameSessionScope } from '@colearnia/contracts';
import type { SessionProjectionCursor } from '@colearnia/contracts';
import type { DeviceKind } from '../lobby/lobbyPreview';

export type DeviceMediaContext = Pick<
  SessionProjectionCursor,
  'sessionId' | 'epoch' | 'callGeneration' | 'audienceEpoch' | 'policyRevision' | 'scope'
>;

export function sameDeviceBinding(left: DeviceMediaContext, right: DeviceMediaContext) {
  return (
    left.sessionId === right.sessionId &&
    left.epoch === right.epoch &&
    left.callGeneration === right.callGeneration &&
    left.audienceEpoch === right.audienceEpoch &&
    sameSessionScope(left.scope, right.scope)
  );
}

type DevicePhase = 'off' | 'starting' | 'on' | 'stopping';
type DeviceState = { phase: DevicePhase; error?: string; cleanupUnconfirmed?: true };
type Snapshot = Record<DeviceKind, DeviceState> & { available: boolean };
type Publication = { close(): Promise<void> };
type Attempt = {
  abort: AbortController;
  track?: MediaStreamTrack;
  publication?: Publication;
};

const kinds = ['microphone', 'camera'] as const;
const unconfirmedClose = 'Thiết bị đã tắt. Chưa xác nhận được việc đóng nguồn trên máy chủ.';
const cleanupUnconfirmed = { error: unconfirmedClose, cleanupUnconfirmed: true } as const;

export class DeviceCleanupUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super(unconfirmedClose, { cause });
  }
}

export class DeviceMedia {
  #context: DeviceMediaContext | null = null;
  #disposed = false;
  #listeners = new Set<() => void>();
  #attempts: Partial<Record<DeviceKind, Attempt>> = {};
  #deviceIds: Partial<Record<DeviceKind, string>>;
  #allowed = { microphone: true, camera: true };
  #snapshot: Snapshot = {
    available: false,
    microphone: { phase: 'off' },
    camera: { phase: 'off' },
  };

  constructor(
    private readonly capture: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
    private readonly publish: (
      track: MediaStreamTrack,
      context: DeviceMediaContext,
      signal: AbortSignal,
    ) => Promise<Publication>,
    deviceIds: Partial<Record<DeviceKind, string>> = {},
    private readonly retryClose?: (kind: DeviceKind, context: DeviceMediaContext) => Promise<void>,
  ) {
    this.#deviceIds = { ...deviceIds };
  }

  getSnapshot = () => this.#snapshot;
  isAllowed = (kind: DeviceKind) => this.#allowed[kind];
  setPermissions(allowed: Record<DeviceKind, boolean>) {
    if (kinds.every((kind) => allowed[kind] === this.#allowed[kind])) return;
    this.#allowed = { ...allowed };
    for (const kind of kinds) if (!allowed[kind]) void this.stop(kind);
    this.#snapshot = { ...this.#snapshot };
    this.#notify();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  updateContext(context: DeviceMediaContext | null) {
    if (this.#disposed) return;
    const previous = this.#context;
    this.#context = context;
    if (previous && (!context || !sameDeviceBinding(previous, context))) {
      for (const kind of kinds) void this.stop(kind);
    }
    if (this.#snapshot.available !== Boolean(context)) {
      this.#snapshot = { ...this.#snapshot, available: Boolean(context) };
      this.#notify();
    }
  }

  async start(kind: DeviceKind) {
    const context = this.#context;
    if (
      !context ||
      this.#disposed ||
      this.#attempts[kind] ||
      this.#snapshot[kind].phase !== 'off' ||
      !this.#allowed[kind]
    )
      return;
    const unresolved = this.#snapshot[kind].cleanupUnconfirmed ? cleanupUnconfirmed : {};
    const attempt: Attempt = { abort: new AbortController() };
    this.#attempts[kind] = attempt;
    this.#set(kind, { phase: 'starting', ...unresolved });
    let stopped: DeviceState = { phase: 'off', ...unresolved };
    try {
      const deviceId = this.#deviceIds[kind];
      const constraints = deviceId ? { deviceId: { exact: deviceId } } : true;
      const stream = await this.capture(
        kind === 'microphone'
          ? { audio: constraints, video: false }
          : { audio: false, video: constraints },
      );
      const track = stream
        .getTracks()
        .find((candidate) => candidate.kind === (kind === 'microphone' ? 'audio' : 'video'));
      for (const candidate of stream.getTracks()) {
        if (candidate !== track) candidate.stop();
      }
      if (!track) throw new DOMException('Device track unavailable', 'NotFoundError');
      attempt.track = track;
      track.enabled = false;
      attempt.abort.signal.throwIfAborted();
      if (track.readyState !== 'live')
        throw new DOMException('Device track ended', 'NotReadableError');
      track.addEventListener(
        'ended',
        () => {
          if (this.#attempts[kind] === attempt) void this.stop(kind);
        },
        { once: true },
      );
      const current = this.#context;
      if (!current) throw new DOMException('Call unavailable', 'AbortError');
      const publication = await this.publish(track, current, attempt.abort.signal);
      if (attempt.abort.signal.aborted) {
        try {
          await publication.close();
        } catch (error) {
          throw new DeviceCleanupUnconfirmedError(error);
        }
        return;
      }
      attempt.publication = publication;
      track.enabled = true;
      this.#set(kind, { phase: 'on' });
    } catch (error) {
      if (error instanceof DeviceCleanupUnconfirmedError) {
        stopped = { phase: 'off', ...cleanupUnconfirmed };
      } else if (!attempt.abort.signal.aborted && !stopped.cleanupUnconfirmed) {
        const message =
          error instanceof Error &&
          (error.name === 'NotAllowedError' || error.name === 'SecurityError')
            ? 'Trình duyệt chưa cấp quyền cho thiết bị.'
            : error instanceof Error &&
                (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
              ? 'Không tìm thấy thiết bị đã chọn.'
              : 'Không thể bật thiết bị. Hãy thử lại.';
        stopped = { phase: 'off', error: message };
      }
    } finally {
      if (!attempt.publication) {
        attempt.track?.stop();
        if (this.#attempts[kind] === attempt) {
          delete this.#attempts[kind];
          this.#set(kind, stopped);
        }
      }
    }
  }

  async stop(kind: DeviceKind) {
    const attempt = this.#attempts[kind];
    if (!attempt || attempt.abort.signal.aborted) return;
    attempt.abort.abort();
    if (attempt.track) {
      attempt.track.enabled = false;
      attempt.track.stop();
    }
    if (!attempt.track) {
      delete this.#attempts[kind];
      this.#set(kind, { ...this.#snapshot[kind], phase: 'off' });
      return;
    }
    this.#set(kind, { ...this.#snapshot[kind], phase: 'stopping' });
    if (!attempt.publication) return; // start() disposes any late result.
    try {
      await attempt.publication.close();
      this.#set(kind, { phase: 'off' });
    } catch {
      this.#set(kind, {
        phase: 'off',
        ...cleanupUnconfirmed,
      });
    } finally {
      delete this.#attempts[kind];
    }
  }

  async retryCleanup(kind: DeviceKind) {
    const context = this.#context;
    const state = this.#snapshot[kind];
    if (
      !context ||
      this.#disposed ||
      !this.retryClose ||
      state.phase !== 'off' ||
      !state.cleanupUnconfirmed
    )
      return;
    this.#set(kind, { phase: 'stopping', ...cleanupUnconfirmed });
    let confirmed = false;
    try {
      await this.retryClose(kind, context);
      confirmed = true;
    } catch {
      // Keep the unresolved server state visible until a close is confirmed.
    }
    if (!this.#disposed)
      this.#set(kind, confirmed ? { phase: 'off' } : { phase: 'off', ...cleanupUnconfirmed });
  }

  dispose() {
    this.updateContext(null);
    this.#disposed = true;
    this.#listeners.clear();
  }

  #set(kind: DeviceKind, state: DeviceState) {
    this.#snapshot = { ...this.#snapshot, [kind]: state };
    this.#notify();
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }
}
