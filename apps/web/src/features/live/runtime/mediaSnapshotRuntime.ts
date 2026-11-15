import {
  isSessionProjectionCurrent,
  mediaSourcesResyncAckSchema,
  mediaSourcesSnapshotSchema,
  requestIdSchema,
  sessionControlBudget,
} from '@colearnia/contracts';
import type {
  MediaSourcesResyncInput,
  MediaSourcesSnapshot,
  MediaSourceEventName,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { CallIdentity } from './callController';
import type { AudioGraph } from '../../audio';
import { joinMediaSnapshot, sameSourceBinding } from './mediaSnapshot';
import type { ConsumerBinding, MediaSnapshot, MediaSnapshotPayload } from './mediaSnapshot';
import { OwnMediaResources } from './ownMediaResources';
import { applyMediaDelta, parseMediaDelta } from './mediaDelta';
import type { MediaDelta } from './mediaDelta';

type Descriptor = Pick<
  MediaSourcesSnapshot,
  | 'snapshotId'
  | 'mediaStreamId'
  | 'mediaSequence'
  | 'audienceEpoch'
  | 'policyRevision'
  | 'partCount'
>;
type SnapshotResult =
  | { status: 'applied'; snapshot: MediaSnapshot }
  | { status: 'cancelled' | 'timeout' | 'invalid' }
  | { status: 'denied'; code: string };
type ConsumerHandle = {
  attach: () => void;
  // Borrowed remote track. The adapter keeps audio out of its visual attachment.
  audioTrack?: MediaStreamTrack;
  // Idempotently detaches audio/video and closes exactly this local Consumer without throwing.
  close: () => void;
};
type LocalConsumer = {
  binding: ConsumerBinding;
  handle: ConsumerHandle;
  detachAudio?: () => void;
};
type OwnProducer = MediaSnapshotPayload['ownProducers'][number];
type OwnTransport = MediaSnapshotPayload['ownTransports'][number];

function matchesCall(value: Omit<CallIdentity, 'participantId'>, identity: CallIdentity) {
  return (
    value.sessionId === identity.sessionId &&
    value.epoch === identity.epoch &&
    value.callGeneration === identity.callGeneration
  );
}

function sameDescriptor(left: Descriptor, right: Descriptor) {
  return (
    left.snapshotId === right.snapshotId &&
    left.mediaStreamId === right.mediaStreamId &&
    left.mediaSequence === right.mediaSequence &&
    left.audienceEpoch === right.audienceEpoch &&
    left.policyRevision === right.policyRevision &&
    left.partCount === right.partCount
  );
}

const encoder = new TextEncoder();
const terminalErrors = new Set(['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_ENDED']);
const retryDelays = [500, 1000, 2000] as const;
type BufferedDelta = { delta: MediaDelta; fingerprint: string; bytes: number };
type PlannedDelta = { snapshot: MediaSnapshot; entry: BufferedDelta; recvClosed: boolean };
type ResyncPort = (
  input: MediaSourcesResyncInput,
  receive: { acceptAck: (packet: unknown) => void; acceptPart: (packet: unknown) => void },
) => void | Promise<void>;

// One instance per CallController. The session flow supplies accepted M4 cursors and
// routes the socket ack/parts to the matching resync. This runtime never grants access.
export class MediaSnapshotRuntime {
  #context: SessionProjectionCursor | null = null;
  #latestContext: SessionProjectionCursor | undefined;
  #snapshot: MediaSnapshot | undefined;
  #appliedSnapshots = new WeakSet<MediaSnapshot>();
  #cancel: (() => void) | undefined;
  #consumers = new Map<string, LocalConsumer>();
  #own = new OwnMediaResources();
  #buffer = new Map<number, BufferedDelta>();
  #bufferBytes = 0;
  #history = new Map<number, BufferedDelta>();
  #historyBytes = 0;
  #resyncPort: ResyncPort | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #retryCount = 0;
  #resyncExhausted = false;
  #needsResync = false;
  #closedSources = new Map<string, number>();
  #consumerCallbackFloor = 0;
  #recvClosedAt = 0;

  constructor(
    private readonly identity: CallIdentity,
    private readonly signal: AbortSignal,
    private readonly audio?: Pick<AudioGraph, 'attach'>,
  ) {
    signal.addEventListener('abort', () => this.updateContext(null), { once: true });
  }

  getSnapshot = () => this.#snapshot;

  // The socket adapter routes only responses for this request to receive.
  // Incoming media events go through acceptEvent for this same call.
  bindResync(port: ResyncPort) {
    this.#cancel?.();
    this.#resyncPort = port;
    this.resync();
    return () => {
      if (this.#resyncPort !== port) return;
      this.#resyncPort = undefined;
      this.#resetRetry();
      this.#cancel?.();
    };
  }

  resync() {
    this.#resetRetry();
    this.#needsResync = true;
    this.#startResync();
  }

  acceptEvent(name: MediaSourceEventName, packet: unknown) {
    const context = this.#context;
    if (!context) return;
    let bytes: number;
    try {
      bytes = encoder.encode(JSON.stringify([name, packet])).byteLength;
    } catch {
      return this.#requestResync();
    }
    if (bytes > sessionControlBudget.maxControlBytes) return this.#requestResync();
    const delta = parseMediaDelta(name, packet);
    if (!delta) return this.#requestResync();
    const event = delta.packet;
    if (!matchesCall(event, this.identity) || event.audienceEpoch !== context.audienceEpoch) return;
    const snapshot = this.#snapshot;
    if (snapshot && event.mediaStreamId !== snapshot.mediaStreamId) return this.#requestResync();

    const fingerprint = JSON.stringify([name, event]);
    const entry = { delta, fingerprint, bytes };
    const sequence = event.mediaSequence;
    if (snapshot && sequence <= snapshot.mediaSequence) {
      const previous = this.#history.get(sequence);
      if (previous && previous.fingerprint !== fingerprint) this.#requestResync();
      return;
    }
    if (
      snapshot &&
      delta.name === 'media.transport.closed' &&
      !snapshot.payload.ownTransports.some(
        ({ transportId }) => transportId === delta.packet.payload.transportId,
      )
    ) {
      // Fence in-flight Consumer completions while resync determines what survived.
      this.#consumerCallbackFloor = Math.max(this.#consumerCallbackFloor, sequence);
    }
    if (this.#cancel) {
      const previous = this.#buffer.get(sequence);
      if (previous?.fingerprint === fingerprint) return;
      if (
        previous ||
        this.#buffer.size >= sessionControlBudget.maxBufferedEvents ||
        this.#bufferBytes + bytes > sessionControlBudget.maxBufferedEventBytes
      )
        return this.#requestResync();
      this.#buffer.set(sequence, entry);
      this.#bufferBytes += bytes;
      return;
    }
    if (!snapshot || this.#needsResync || !this.#applyDelta(entry)) this.#requestResync();
  }

  updateContext(next: SessionProjectionCursor | null) {
    const previous = this.#context;
    const latest = this.#latestContext;
    if (
      next &&
      (this.signal.aborted ||
        !matchesCall(next, this.identity) ||
        next.participantId !== this.identity.participantId ||
        (latest &&
          (!isSessionProjectionCurrent(next, latest) ||
            (!previous && next.projectionSequence <= latest.projectionSequence))))
    )
      return false;

    const scopeChanged = !next || previous?.audienceEpoch !== next.audienceEpoch;
    const contextChanged = scopeChanged || previous?.policyRevision !== next?.policyRevision;
    if (contextChanged) {
      this.#resetRetry();
      this.#cancel?.();
      this.#needsResync = true;
    }
    this.#context = next ? { ...next, scope: { ...next.scope } } : null;
    if (this.#context) this.#latestContext = this.#context;
    if (scopeChanged) {
      this.#snapshot = undefined;
      this.#history.clear();
      this.#historyBytes = 0;
      this.#closedSources.clear();
      this.#consumerCallbackFloor = 0;
      this.#recvClosedAt = 0;
      this.#reconcileConsumers([]);
    }
    if (!next) this.#own.reconcile();
    else if (scopeChanged || previous?.policyRevision !== next.policyRevision) {
      this.#own.cancelReplacements();
    }
    if (next && contextChanged) this.#startResync();
    return true;
  }

  begin(requestId: string) {
    const context = this.#context;
    if (!context || !requestIdSchema.safeParse(requestId).success) return;
    this.#cancel?.();
    const { sessionId, epoch, callGeneration, audienceEpoch, policyRevision } = context;
    const previous = this.#snapshot;
    const input: MediaSourcesResyncInput = {
      requestId,
      sessionId,
      epoch,
      callGeneration,
      payload: previous
        ? { lastMediaStreamId: previous.mediaStreamId, lastMediaSequence: previous.mediaSequence }
        : {},
    };
    const parts = new Map<number, { part: MediaSourcesSnapshot; json: string }>();
    let descriptor: Descriptor | undefined;
    let first: MediaSourcesSnapshot | undefined;
    let totalBytes = 0;
    let settle!: (result: SnapshotResult) => void;
    const result = new Promise<SnapshotResult>((resolve) => {
      settle = resolve;
    });
    const cancel = () => finish({ status: 'cancelled' });
    const deadline = performance.now() + sessionControlBudget.snapshotTimeoutMs;
    const timer = setTimeout(
      () => finish({ status: 'timeout' }),
      sessionControlBudget.snapshotTimeoutMs,
    );
    this.#cancel = cancel;

    const finish = (outcome: SnapshotResult) => {
      if (this.#cancel !== cancel) return;
      this.#cancel = undefined;
      clearTimeout(timer);
      parts.clear();
      first = undefined;
      descriptor = undefined;
      this.#clearBuffer();
      settle(outcome);
    };
    const invalid = () => finish({ status: 'invalid' });
    const current = () => {
      if (this.#cancel !== cancel) return false;
      if (performance.now() < deadline) return true;
      finish({ status: 'timeout' });
      return false;
    };
    const validContext = (value: Descriptor) =>
      value.audienceEpoch === audienceEpoch &&
      value.policyRevision === policyRevision &&
      (!previous ||
        (value.mediaStreamId === previous.mediaStreamId &&
          value.mediaSequence >= previous.mediaSequence));
    const apply = () => {
      if (!descriptor || parts.size !== descriptor.partCount || !current()) return;
      const ordered = [...parts.values()]
        .map(({ part }) => part)
        .sort((a, b) => a.partIndex - b.partIndex);
      const snapshot = joinMediaSnapshot(ordered, context.participantId);
      if (!snapshot || snapshot.mediaSequence < this.#consumerCallbackFloor) return invalid();
      const buffered = [...this.#buffer.values()]
        .filter(({ delta }) => delta.packet.mediaSequence > snapshot.mediaSequence)
        .sort((left, right) => left.delta.packet.mediaSequence - right.delta.packet.mediaSequence);
      if (
        buffered.some(
          ({ delta }, index) =>
            delta.packet.mediaStreamId !== snapshot.mediaStreamId ||
            delta.packet.mediaSequence !== snapshot.mediaSequence + index + 1,
        )
      )
        return invalid();
      const closedSources = new Map(this.#closedSources);
      const planned: PlannedDelta[] = [];
      let final = snapshot;
      for (const entry of buffered) {
        const next = this.#planDelta(final, entry, closedSources);
        if (!next) {
          this.#needsResync = true;
          return invalid();
        }
        final = next.snapshot;
        planned.push(next);
      }
      this.#closedSources = closedSources;
      this.#snapshot = final;
      this.#appliedSnapshots.add(snapshot);
      this.#appliedSnapshots.add(final);
      this.#needsResync = false;
      this.#reconcileConsumers(snapshot.payload.ownConsumers);
      this.#own.reconcile(snapshot.payload);
      for (const next of planned) this.#reconcileDelta(next);
      finish({ status: 'applied', snapshot: final });
    };

    return {
      input,
      result,
      cancel,
      acceptAck: (packet: unknown) => {
        if (!current()) return;
        const ack = mediaSourcesResyncAckSchema.safeParse(packet);
        if (!ack.success) return invalid();
        if (ack.data.requestId !== requestId) return;
        if ('error' in ack.data) {
          const { code } = ack.data.error;
          finish({ status: 'denied', code });
          if (terminalErrors.has(code)) this.updateContext(null);
          return;
        }
        const value = ack.data.data.result;
        if (
          !validContext(value) ||
          (descriptor && !sameDescriptor(descriptor, value)) ||
          (first && !sameDescriptor(first, value))
        )
          return invalid();
        descriptor = value;
        apply();
      },
      acceptPart: (packet: unknown) => {
        if (!current()) return;
        // Socket packets are JSON. Count bytes before parsing/retaining a part.
        let bytes: number;
        try {
          bytes = encoder.encode(JSON.stringify(packet)).byteLength;
        } catch {
          return invalid();
        }
        if (bytes > sessionControlBudget.maxSnapshotPartBytes) return invalid();
        const parsed = mediaSourcesSnapshotSchema.safeParse(packet);
        if (!parsed.success) return invalid();
        const part = parsed.data;
        if (part.requestId !== requestId) return;
        if (
          !matchesCall(part, this.identity) ||
          !validContext(part) ||
          (first && !sameDescriptor(first, part)) ||
          (descriptor && !sameDescriptor(descriptor, part))
        ) {
          return invalid();
        }
        const json = JSON.stringify(part);
        const duplicate = parts.get(part.partIndex);
        if (duplicate) {
          if (duplicate.json !== json) invalid();
          return;
        }
        totalBytes += bytes;
        if (totalBytes > sessionControlBudget.maxSnapshotBytes) return invalid();
        first ??= part;
        parts.set(part.partIndex, { part, json });
        apply();
      },
    };
  }

  attachConsumer(snapshot: MediaSnapshot, binding: ConsumerBinding, handle: ConsumerHandle) {
    const existing = this.#consumers.get(binding.sourceId);
    const current = this.#currentFor(snapshot);
    const original = snapshot.payload.sources.find(({ sourceId }) => sourceId === binding.sourceId);
    const source = current?.payload.sources.find(({ sourceId }) => sourceId === binding.sourceId);
    const originalOwn = snapshot.payload.ownConsumers.find(
      ({ sourceId }) => sourceId === binding.sourceId,
    );
    const own = current?.payload.ownConsumers.find(({ sourceId }) => sourceId === binding.sourceId);
    const originalRecv = snapshot.payload.ownTransports.find(
      ({ direction }) => direction === 'RECV',
    );
    const closedSinceSnapshot = [...this.#history.values()].some(
      ({ delta }) =>
        delta.name === 'media.consumer.closed' &&
        delta.packet.mediaSequence > snapshot.mediaSequence &&
        delta.packet.payload.consumerId === binding.consumerId &&
        delta.packet.payload.sourceId === binding.sourceId &&
        delta.packet.payload.sourceGeneration === binding.sourceGeneration,
    );
    // A new binding comes from the authorized create/ready flow. A snapshot can
    // fence that completion or confirm an existing binding, but cannot create it.
    const confirmed =
      original &&
      sameSourceBinding(original, binding) &&
      original.sourceRevision === binding.sourceRevision &&
      source &&
      sameSourceBinding(source, binding) &&
      source.sourceRevision === binding.sourceRevision &&
      snapshot.mediaSequence >= this.#consumerCallbackFloor &&
      snapshot.mediaSequence >= this.#recvClosedAt &&
      (!originalRecv ||
        current?.payload.ownTransports.some(
          ({ transportId }) => transportId === originalRecv.transportId,
        )) &&
      !closedSinceSnapshot &&
      (!originalOwn || own?.consumerId === originalOwn.consumerId) &&
      (!own || own.consumerId === binding.consumerId);
    if (existing?.handle === handle) return Boolean(confirmed);
    if (!confirmed || existing) {
      handle.close();
      return false;
    }

    const local: LocalConsumer = { binding: own ?? { ...binding }, handle };
    this.#consumers.set(binding.sourceId, local);
    try {
      handle.attach();
      if (this.#consumers.get(binding.sourceId) !== local) return false;
      if (
        handle.audioTrack &&
        this.audio &&
        this.#context?.scope.type === 'MAIN' &&
        source.scope.type === 'MAIN' &&
        source.ownerParticipantId !== this.identity.participantId &&
        (source.sourceKind === 'MIC' || source.sourceKind === 'SCREEN_AUDIO')
      ) {
        const detach = this.audio.attach(handle.audioTrack);
        if (this.#consumers.get(binding.sourceId) !== local) {
          detach();
          return false;
        }
        local.detachAudio = detach;
      }
      return true;
    } catch (error) {
      if (this.#consumers.get(binding.sourceId) === local) {
        this.#consumers.delete(binding.sourceId);
        this.#closeConsumer(local);
      }
      throw error;
    }
  }

  detachConsumer(binding: ConsumerBinding, handle: ConsumerHandle) {
    const local = this.#consumers.get(binding.sourceId);
    if (local?.handle !== handle) return;
    this.#consumers.delete(binding.sourceId);
    this.#closeConsumer(local);
  }

  confirmConsumerReady(snapshot: MediaSnapshot, binding: ConsumerBinding, handle: ConsumerHandle) {
    const local = this.#consumers.get(binding.sourceId);
    if (local?.handle !== handle || !this.attachConsumer(snapshot, binding, handle)) return false;
    local.binding = { ...local.binding, ready: true, paused: false };
    return true;
  }

  trackOwnProducer(
    snapshot: MediaSnapshot,
    source: OwnProducer['source'],
    handle: { close: () => void },
  ) {
    const producer = this.#currentFor(snapshot)?.payload.ownProducers.find(
      (candidate) => candidate.source.producerId === source.producerId,
    );
    return this.#own.trackProducer(producer, source, handle);
  }

  trackOwnTransport(
    snapshot: MediaSnapshot,
    transport: OwnTransport,
    handle: { close: () => void },
  ) {
    const current = this.#currentFor(snapshot)?.payload.ownTransports.find(
      ({ transportId }) => transportId === transport.transportId,
    );
    return this.#own.trackTransport(current, transport, handle);
  }

  trackReplacement(
    snapshot: MediaSnapshot,
    producerId: string,
    replacement: NonNullable<OwnProducer['replacement']>,
    cancel: () => void,
  ) {
    const producer = this.#currentFor(snapshot)?.payload.ownProducers.find(
      ({ source }) => source.producerId === producerId,
    );
    return this.#own.trackReplacement(producer, replacement, cancel);
  }

  #currentFor(snapshot: MediaSnapshot) {
    const current = this.#snapshot;
    if (
      current &&
      !this.#needsResync &&
      this.#appliedSnapshots.has(snapshot) &&
      current.audienceEpoch === snapshot.audienceEpoch &&
      current.mediaStreamId === snapshot.mediaStreamId &&
      current.policyRevision === snapshot.policyRevision &&
      this.#context?.policyRevision === current.policyRevision
    )
      return current;
  }

  #clearBuffer() {
    this.#buffer.clear();
    this.#bufferBytes = 0;
  }

  #resetRetry() {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#retryCount = 0;
    this.#resyncExhausted = false;
  }

  #requestResync() {
    this.#needsResync = true;
    const active = Boolean(this.#cancel);
    this.#cancel?.();
    if (!active) this.#startResync();
  }

  #startResync() {
    const port = this.#resyncPort;
    const context = this.#context;
    if (!port || !context || this.#retry || this.#cancel || this.#resyncExhausted) return;
    const request = this.begin(crypto.randomUUID());
    if (!request) return;
    void request.result.then((outcome) => {
      if (
        this.#context?.audienceEpoch !== context.audienceEpoch ||
        this.#context.policyRevision !== context.policyRevision ||
        this.#resyncPort !== port
      )
        return;
      if (outcome.status === 'applied') {
        this.#resetRetry();
        return;
      }
      if (outcome.status === 'cancelled' && !this.#needsResync) return;
      const delay = retryDelays[this.#retryCount];
      if (delay === undefined) {
        this.#resyncExhausted = true;
        return;
      }
      this.#retryCount++;
      this.#retry = setTimeout(
        () => {
          this.#retry = undefined;
          this.#startResync();
        },
        delay * (0.9 + Math.random() * 0.2),
      );
    });
    void Promise.resolve()
      .then(() => {
        if (this.#cancel === request.cancel && this.#resyncPort === port)
          return port(request.input, request);
      })
      .catch(() => request.cancel());
  }

  #applyDelta(entry: BufferedDelta) {
    const current = this.#snapshot;
    if (!current || entry.delta.packet.mediaSequence !== current.mediaSequence + 1) return false;
    const next = this.#planDelta(current, entry, this.#closedSources);
    if (!next) return false;
    this.#snapshot = next.snapshot;
    this.#appliedSnapshots.add(next.snapshot);
    this.#reconcileDelta(next);
    return true;
  }

  #planDelta(current: MediaSnapshot, entry: BufferedDelta, closedSources: Map<string, number>) {
    const { delta } = entry;
    let payload = current.payload;
    if (
      delta.name !== 'media.source.changed' ||
      (closedSources.get(delta.packet.payload.source.sourceId) ?? 0) <
        delta.packet.payload.source.sourceGeneration
    ) {
      const next = applyMediaDelta(payload, delta, this.identity.participantId);
      if (!next) {
        if (delta.name === 'media.transport.closed')
          this.#consumerCallbackFloor = Math.max(
            this.#consumerCallbackFloor,
            delta.packet.mediaSequence,
          );
        return;
      }
      payload = next;
    }
    if (delta.name === 'media.source.ended') {
      const { sourceId, sourceGeneration, sourceRevision } = delta.packet.payload;
      const retained = payload.sources.find((source) => source.sourceId === sourceId);
      const previous = closedSources.get(sourceId) ?? 0;
      if (
        retained?.sourceGeneration !== sourceGeneration ||
        retained.sourceRevision <= sourceRevision
      ) {
        if (!previous && closedSources.size >= sessionControlBudget.maxBufferedEvents) {
          const oldest = closedSources.keys().next();
          if (!oldest.done) closedSources.delete(oldest.value);
        }
        closedSources.set(sourceId, Math.max(previous, sourceGeneration));
      }
    }
    const snapshot = { ...current, mediaSequence: delta.packet.mediaSequence, payload };
    const recvClosed =
      delta.name === 'media.transport.closed' &&
      current.payload.ownTransports.some(
        (value) =>
          value.direction === 'RECV' && value.transportId === delta.packet.payload.transportId,
      );
    return { snapshot, entry, recvClosed };
  }

  #reconcileDelta({ snapshot, entry, recvClosed }: PlannedDelta) {
    const { payload } = snapshot;
    const { delta, bytes } = entry;
    if (recvClosed) this.#recvClosedAt = snapshot.mediaSequence;
    for (const [sourceId, local] of this.#consumers) {
      const source = payload.sources.find((value) => value.sourceId === sourceId);
      const closed =
        delta.name === 'media.consumer.closed' &&
        delta.packet.payload.consumerId === local.binding.consumerId &&
        delta.packet.payload.sourceId === sourceId &&
        delta.packet.payload.sourceGeneration === local.binding.sourceGeneration;
      if (
        recvClosed ||
        closed ||
        !source ||
        !sameSourceBinding(source, local.binding) ||
        (!local.binding.ready && source.sourceRevision !== local.binding.sourceRevision)
      ) {
        this.#consumers.delete(sourceId);
        this.#closeConsumer(local);
      } else {
        local.binding = { ...local.binding, sourceRevision: source.sourceRevision };
      }
    }
    this.#own.reconcile(payload);
    this.#history.set(snapshot.mediaSequence, entry);
    this.#historyBytes += bytes;
    for (const [sequence, oldest] of this.#history) {
      if (
        this.#history.size <= sessionControlBudget.maxBufferedEvents &&
        this.#historyBytes <= sessionControlBudget.maxBufferedEventBytes
      )
        break;
      this.#history.delete(sequence);
      this.#historyBytes -= oldest.bytes;
      if (oldest.delta.name === 'media.consumer.closed') this.#consumerCallbackFloor = sequence;
    }
  }

  #reconcileConsumers(bindings: readonly ConsumerBinding[]) {
    const bySource = new Map(bindings.map((binding) => [binding.sourceId, binding]));
    for (const [sourceId, local] of this.#consumers) {
      const next = bySource.get(sourceId);
      if (
        next &&
        next.consumerId === local.binding.consumerId &&
        sameSourceBinding(next, local.binding) &&
        (next.sourceRevision === local.binding.sourceRevision ||
          (local.binding.ready && next.ready))
      ) {
        local.binding = next;
      } else {
        this.#consumers.delete(sourceId);
        this.#closeConsumer(local);
      }
    }
  }

  #closeConsumer(local: LocalConsumer) {
    local.detachAudio?.();
    local.handle.close();
  }
}
