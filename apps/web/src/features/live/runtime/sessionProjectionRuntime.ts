import { createStore } from 'zustand/vanilla';
import {
  assembleSessionSnapshot,
  classifySessionProjectionEvent,
  isSessionEndedNoticeCurrent,
  isSessionProjectionCurrent,
  sameSessionScope,
  sessionControlBudget,
  sessionEndedEventSchema,
  sessionProjectionEventSchema,
  sessionResyncAckSchema,
  sessionSnapshotPartSchema,
} from '@colearnia/contracts';
import type {
  SessionProjection,
  SessionProjectionCursor,
  SessionProjectionEvent,
  SessionResyncInput,
  SessionSnapshotDescriptor,
  SessionSnapshotPart,
} from '@colearnia/contracts';
import type { CallIdentity } from './callController';
import type { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import { AudienceCache } from './audienceCache';

export type SessionProjectionState = Readonly<{
  status: 'syncing' | 'ready' | 'error' | 'closed';
  projection: SessionProjection | null;
  cursor: SessionProjectionCursor | null;
}>;
export type SessionResyncPort = (
  input: SessionResyncInput,
  receive: { acceptAck: (packet: unknown) => void; acceptPart: (packet: unknown) => void },
) => void | Promise<void>;
type Attempt = {
  input: SessionResyncInput;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
  parts: Map<number, SessionSnapshotPart>;
  bytes: number;
  descriptor?: SessionSnapshotDescriptor;
};

const encoder = new TextEncoder();
const delays = [500, 1000, 2000];
const terminal = new Set(['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_ENDED']);
function packetBytes(packet: unknown) {
  try {
    return encoder.encode(JSON.stringify(packet)).byteLength;
  } catch {
    return Infinity;
  }
}
function sameCall(packet: unknown, identity: CallIdentity) {
  if (!packet || typeof packet !== 'object') return false;
  return (
    'sessionId' in packet &&
    packet.sessionId === identity.sessionId &&
    'epoch' in packet &&
    packet.epoch === identity.epoch &&
    'participantId' in packet &&
    packet.participantId === identity.participantId &&
    'callGeneration' in packet &&
    packet.callGeneration === identity.callGeneration
  );
}
function cursorOf(value: SessionProjectionCursor): SessionProjectionCursor {
  const {
    sessionId,
    epoch,
    participantId,
    callGeneration,
    audienceEpoch,
    projectionSequence,
    policyRevision,
    scope,
  } = value;
  return {
    sessionId,
    epoch,
    participantId,
    callGeneration,
    audienceEpoch,
    projectionSequence,
    policyRevision,
    scope: { ...scope },
  };
}

// One instance per call ownership, above panels/routes. No resume ticket, media
// handle or private content is persisted in the Zustand render projection.
export class SessionProjectionRuntime {
  readonly cache: AudienceCache;
  readonly #state = createStore<SessionProjectionState>(() => ({
    status: 'syncing',
    projection: null,
    cursor: null,
  }));
  #minimum: SessionProjectionCursor;
  #requiredSequence = 0;
  #requiredRevision = 0;
  #attempt: Attempt | undefined;
  #port: SessionResyncPort | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #failures = 0;
  #closed = false;
  #buffer = new Map<number, SessionProjectionEvent>();
  #bufferBytes = 0;
  #bufferStarted: number | undefined;
  readonly #abort = () => this.close();

  constructor(
    private readonly identity: CallIdentity,
    private readonly signal: AbortSignal,
    private readonly media: Pick<MediaSnapshotRuntime, 'updateContext'>,
    private readonly onEnded: () => void,
  ) {
    this.#minimum = {
      ...identity,
      audienceEpoch: 0,
      projectionSequence: 0,
      policyRevision: 0,
      scope: { type: 'MAIN' },
    };
    this.cache = new AudienceCache(identity);
    signal.addEventListener('abort', this.#abort, { once: true });
    if (signal.aborted) this.close();
  }

  getSnapshot = () => this.#state.getState();
  subscribe = (listener: () => void) => this.#state.subscribe(listener);

  bindResync(port: SessionResyncPort) {
    if (this.#closed) return () => {};
    this.#port = port;
    this.resync();
    return () => {
      if (this.#port !== port) return;
      this.#port = undefined;
      this.#deny();
    };
  }

  resync() {
    if (this.#closed) return;
    this.#failures = 0;
    this.#deny();
    this.#start();
  }

  acceptEvent(packet: unknown) {
    if (this.#closed || !sameCall(packet, this.identity)) return;
    if (packetBytes(packet) > sessionControlBudget.maxControlBytes) return this.#fail();
    const parsed = sessionProjectionEventSchema.safeParse(packet);
    if (!parsed.success) return this.#fail();
    const event = parsed.data;
    if (event.audienceEpoch < this.#minimum.audienceEpoch) return;
    if (event.audienceEpoch > this.#minimum.audienceEpoch) {
      if (!this.#observe(event)) return this.#fail();
      this.resync();
    }
    if (event.projectionSequence <= this.#minimum.projectionSequence) return;
    this.#requiredSequence = Math.max(this.#requiredSequence, event.projectionSequence);
    this.#requiredRevision = Math.max(this.#requiredRevision, event.policyRevision);
    if (this.getSnapshot().status === 'ready') {
      const classification = classifySessionProjectionEvent(event, this.#minimum);
      if (classification === 'IGNORE') return;
      if (classification === 'APPLY') return this.#publish(event, event.projection);
      this.resync();
    }
    if (!this.#attempt) return;
    const previous = this.#buffer.get(event.projectionSequence);
    if (previous && JSON.stringify(previous) === JSON.stringify(event)) return;
    const bytes = packetBytes(event);
    if (
      previous ||
      this.#buffer.size >= sessionControlBudget.maxBufferedEvents ||
      this.#bufferBytes + bytes > sessionControlBudget.maxBufferedEventBytes ||
      (this.#bufferStarted !== undefined &&
        performance.now() - this.#bufferStarted >= sessionControlBudget.bufferedEventTimeoutMs)
    )
      return this.#fail();
    this.#bufferStarted ??= performance.now();
    this.#bufferBytes += bytes;
    this.#buffer.set(event.projectionSequence, event);
  }

  acceptEnded(packet: unknown) {
    if (this.#closed || packetBytes(packet) > sessionControlBudget.maxControlBytes) return;
    const parsed = sessionEndedEventSchema.safeParse(packet);
    if (!parsed.success || !isSessionEndedNoticeCurrent(parsed.data, this.#minimum)) return;
    this.close();
    this.onEnded();
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.signal.removeEventListener('abort', this.#abort);
    this.#port = undefined;
    this.#deny('closed');
  }

  #observe(value: SessionProjectionCursor) {
    const current = isSessionProjectionCurrent(value, this.#minimum);
    if (value.audienceEpoch > this.#minimum.audienceEpoch) {
      // Fence A immediately, including incomplete snapshots. Do not advance the
      // applied sequence until a complete snapshot + contiguous events commit.
      // Even an inconsistent new header must fence the previous audience.
      this.#minimum = {
        ...cursorOf(value),
        projectionSequence: this.#minimum.projectionSequence,
        policyRevision: Math.max(value.policyRevision, this.#minimum.policyRevision),
      };
      this.cache.invalidate();
      this.media.updateContext(null);
      this.#clearBuffer();
      this.#state.setState({ status: 'syncing', projection: null, cursor: null }, true);
    }
    return current;
  }

  #start() {
    const port = this.#port;
    if (this.#closed || !port || this.#attempt || this.#retry) return;
    const { sessionId, epoch, callGeneration, projectionSequence, policyRevision } = this.#minimum;
    const input: SessionResyncInput = {
      requestId: crypto.randomUUID(),
      sessionId,
      epoch,
      callGeneration,
      payload: { lastProjectionSequence: projectionSequence, lastPolicyRevision: policyRevision },
    };
    const attempt: Attempt = {
      input,
      deadline: performance.now() + sessionControlBudget.snapshotTimeoutMs,
      timer: setTimeout(() => this.#fail(attempt), sessionControlBudget.snapshotTimeoutMs),
      parts: new Map(),
      bytes: 0,
    };
    this.#attempt = attempt;
    try {
      void Promise.resolve(
        port(input, {
          acceptAck: (packet) => this.#acceptAck(attempt, packet),
          acceptPart: (packet) => this.#acceptPart(attempt, packet),
        }),
      ).catch(() => this.#fail(attempt));
    } catch {
      this.#fail(attempt);
    }
  }

  #current(attempt: Attempt) {
    if (this.#closed || this.#attempt !== attempt) return false;
    if (performance.now() < attempt.deadline) return true;
    this.#fail(attempt);
    return false;
  }

  #acceptAck(attempt: Attempt, packet: unknown) {
    if (!this.#current(attempt)) return;
    if (packetBytes(packet) > sessionControlBudget.maxControlBytes) return this.#fail(attempt);
    const parsed = sessionResyncAckSchema.safeParse(packet);
    if (!parsed.success) return this.#fail(attempt);
    if (parsed.data.requestId !== attempt.input.requestId) return;
    if ('error' in parsed.data) {
      if (!terminal.has(parsed.data.error.code)) return this.#fail(attempt);
      this.close();
      this.onEnded();
      return;
    }
    const descriptor = parsed.data.data.result;
    if (attempt.descriptor && JSON.stringify(attempt.descriptor) !== JSON.stringify(descriptor))
      return this.#fail(attempt);
    attempt.descriptor = descriptor;
    this.#assemble(attempt);
  }

  #acceptPart(attempt: Attempt, packet: unknown) {
    if (!this.#current(attempt) || !sameCall(packet, this.identity)) return;
    const bytes = packetBytes(packet);
    if (bytes > sessionControlBudget.maxSnapshotPartBytes) return this.#fail(attempt);
    const parsed = sessionSnapshotPartSchema.safeParse(packet);
    if (!parsed.success) return this.#fail(attempt);
    const part = parsed.data;
    if (
      part.requestId !== attempt.input.requestId ||
      part.audienceEpoch < this.#minimum.audienceEpoch
    )
      return;
    if (!this.#observe(part)) return this.#fail(attempt);
    this.#requiredSequence = Math.max(this.#requiredSequence, part.projectionSequence);
    this.#requiredRevision = Math.max(this.#requiredRevision, part.policyRevision);
    const previous = attempt.parts.get(part.partIndex);
    if (previous && JSON.stringify(previous) === JSON.stringify(part)) return;
    if (
      previous ||
      attempt.parts.size >= sessionControlBudget.maxSnapshotParts ||
      attempt.bytes + bytes > sessionControlBudget.maxSnapshotBytes
    )
      return this.#fail(attempt);
    attempt.parts.set(part.partIndex, part);
    attempt.bytes += bytes;
    this.#assemble(attempt);
  }

  #assemble(attempt: Attempt) {
    const descriptor = attempt.descriptor;
    if (!descriptor || !this.#current(attempt)) return;
    const parts = [...attempt.parts.values()];
    if (
      parts.some(
        (part) =>
          part.snapshotId !== descriptor.snapshotId || part.partCount !== descriptor.partCount,
      )
    )
      return this.#fail(attempt);
    if (parts.length !== descriptor.partCount) return;
    const assembled = assembleSessionSnapshot(parts, {
      requestId: attempt.input.requestId,
      cursor: this.#minimum,
      snapshot: descriptor,
    });
    if (!assembled.ok) return this.#fail(attempt);
    let cursor = cursorOf(assembled.snapshot);
    let projection = assembled.snapshot.projection;
    const events = [...this.#buffer.values()].sort(
      (a, b) => a.projectionSequence - b.projectionSequence,
    );
    for (const event of events) {
      if (event.projectionSequence <= cursor.projectionSequence) continue;
      if (classifySessionProjectionEvent(event, cursor) !== 'APPLY') return this.#fail(attempt);
      cursor = cursorOf(event);
      projection = event.projection;
    }
    if (
      cursor.projectionSequence < this.#requiredSequence ||
      cursor.policyRevision < this.#requiredRevision
    )
      return this.#fail(attempt);
    this.#cancelAttempt();
    this.#failures = 0;
    this.#publish(cursor, projection);
  }

  #publish(cursor: SessionProjectionCursor, projection: SessionProjection) {
    const previous = this.getSnapshot().cursor;
    this.#minimum = cursorOf(cursor);
    if (
      !previous ||
      previous.audienceEpoch !== cursor.audienceEpoch ||
      previous.policyRevision !== cursor.policyRevision ||
      !sameSessionScope(previous.scope, cursor.scope)
    )
      this.cache.activate(cursor);
    this.media.updateContext(cursorOf(cursor));
    this.#state.setState({ status: 'ready', projection, cursor: cursorOf(cursor) }, true);
  }

  #fail(attempt?: Attempt) {
    if (this.#closed || (attempt && this.#attempt !== attempt)) return;
    // Invalid traffic cannot reset the retry budget or accelerate a scheduled retry.
    if (this.#retry || this.getSnapshot().status === 'error') return;
    this.#deny();
    const delay = delays[this.#failures++];
    if (delay === undefined) {
      this.#state.setState({ status: 'error', projection: null, cursor: null }, true);
      return;
    }
    this.#retry = setTimeout(
      () => {
        this.#retry = undefined;
        this.#start();
      },
      delay + Math.random() * 100,
    );
  }

  #clearBuffer() {
    this.#buffer.clear();
    this.#bufferBytes = 0;
    this.#bufferStarted = undefined;
  }

  #cancelAttempt() {
    if (this.#attempt) clearTimeout(this.#attempt.timer);
    this.#attempt = undefined;
    this.#clearBuffer();
  }

  #deny(status: 'syncing' | 'closed' = 'syncing') {
    this.#cancelAttempt();
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.cache.invalidate();
    // MediaSnapshotRuntime fences and reconciles its own sequence. Ordinary
    // metadata resync must not revoke/regrant an unchanged accepted media cursor.
    // Audience changes revoke immediately in #observe; teardown always revokes.
    if (status === 'closed') this.media.updateContext(null);
    this.#state.setState({ status, projection: null, cursor: null }, true);
  }
}
