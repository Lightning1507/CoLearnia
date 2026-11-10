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
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { CallIdentity } from './callController';
import { joinMediaSnapshot, sameSourceBinding } from './mediaSnapshot';
import type { ConsumerBinding, MediaSnapshot, MediaSnapshotPayload } from './mediaSnapshot';
import { OwnMediaResources } from './ownMediaResources';

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
  // Idempotently detaches audio/video and closes exactly this local Consumer without throwing.
  close: () => void;
};
type LocalConsumer = { binding: ConsumerBinding; handle: ConsumerHandle };
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

  constructor(
    private readonly identity: CallIdentity,
    private readonly signal: AbortSignal,
  ) {
    signal.addEventListener('abort', () => this.updateContext(null), { once: true });
  }

  getSnapshot = () => this.#snapshot;

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
    if (scopeChanged || previous?.policyRevision !== next?.policyRevision) this.#cancel?.();
    this.#context = next ? { ...next, scope: { ...next.scope } } : null;
    if (this.#context) this.#latestContext = this.#context;
    if (scopeChanged) {
      this.#snapshot = undefined;
      this.#reconcileConsumers([]);
    }
    if (!next) this.#own.reconcile();
    else if (scopeChanged || previous?.policyRevision !== next.policyRevision) {
      this.#own.cancelReplacements();
    }
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
      this.#cancel = undefined;
      clearTimeout(timer);
      parts.clear();
      first = undefined;
      descriptor = undefined;
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
      if (!snapshot) return invalid();
      this.#snapshot = snapshot;
      this.#appliedSnapshots.add(snapshot);
      finish({ status: 'applied', snapshot });
      this.#reconcileConsumers(snapshot.payload.ownConsumers);
      this.#own.reconcile(snapshot.payload);
    };

    return {
      input,
      result,
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
    // A new binding comes from the authorized create/ready flow. A snapshot can
    // fence that completion or confirm an existing binding, but cannot create it.
    const confirmed =
      original &&
      sameSourceBinding(original, binding) &&
      original.sourceRevision === binding.sourceRevision &&
      source &&
      sameSourceBinding(source, binding) &&
      source.sourceRevision === binding.sourceRevision &&
      (!originalOwn || own?.consumerId === originalOwn.consumerId) &&
      (!own || own.consumerId === binding.consumerId);
    if (existing?.handle === handle) return Boolean(confirmed);
    if (!confirmed || existing) {
      handle.close();
      return false;
    }

    this.#consumers.set(binding.sourceId, { binding: own ?? { ...binding }, handle });
    try {
      handle.attach();
      return true;
    } catch (error) {
      this.#consumers.delete(binding.sourceId);
      handle.close();
      throw error;
    }
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
      this.#appliedSnapshots.has(snapshot) &&
      current.audienceEpoch === snapshot.audienceEpoch &&
      current.mediaStreamId === snapshot.mediaStreamId &&
      current.policyRevision === snapshot.policyRevision &&
      this.#context?.policyRevision === current.policyRevision
    )
      return current;
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
        local.handle.close();
      }
    }
  }
}
