import { sameSourceBinding } from './mediaSnapshot';
import type { MediaSnapshotPayload } from './mediaSnapshot';

type OwnProducer = MediaSnapshotPayload['ownProducers'][number];
type OwnTransport = MediaSnapshotPayload['ownTransports'][number];
type Replacement = NonNullable<OwnProducer['replacement']>;
type MediaHandle = { close: () => void };

type PendingReplacement = { descriptor: Replacement; cancel: () => void };
type LocalProducer = {
  source: OwnProducer['source'];
  handle: MediaHandle;
  pending?: PendingReplacement;
};

function matchesReplacement(current: Replacement | null, local: Replacement) {
  return (
    current?.replacementId === local.replacementId &&
    current.sourceRevision === local.sourceRevision &&
    current.expiresAt === local.expiresAt
  );
}

// Handles are owned by the call runtime. The adapter must close exactly the
// registered native resource (and its local track, if owned) without throwing.
export class OwnMediaResources {
  #producers = new Map<string, LocalProducer>();
  #transports = new Map<string, { direction: OwnTransport['direction']; handle: MediaHandle }>();

  trackProducer(
    current: OwnProducer | undefined,
    source: OwnProducer['source'],
    handle: MediaHandle,
  ) {
    const existing = this.#producers.get(source.producerId);
    const matches =
      current &&
      sameSourceBinding(current.source, source) &&
      current.source.sourceRevision === source.sourceRevision;
    if (existing?.handle === handle) return Boolean(matches);
    if (!matches || existing) {
      handle.close();
      return false;
    }
    this.#producers.set(source.producerId, { source: current.source, handle });
    return true;
  }

  trackTransport(current: OwnTransport | undefined, transport: OwnTransport, handle: MediaHandle) {
    const existing = this.#transports.get(transport.transportId);
    const matches =
      current?.direction === transport.direction &&
      current.iceGeneration === transport.iceGeneration;
    if (existing?.handle === handle) return matches;
    if (!matches || existing) {
      handle.close();
      return false;
    }
    this.#transports.set(transport.transportId, { direction: transport.direction, handle });
    return true;
  }

  trackReplacement(current: OwnProducer | undefined, descriptor: Replacement, cancel: () => void) {
    const local = current && this.#producers.get(current.source.producerId);
    const remaining = Date.parse(descriptor.expiresAt) - Date.now();
    if (
      !current ||
      !local ||
      local.pending ||
      !matchesReplacement(current.replacement, descriptor) ||
      remaining <= 0
    ) {
      cancel();
      return;
    }

    const finish = () => {
      if (local.pending !== pending) return;
      delete local.pending;
      clearTimeout(timer);
    };
    const expire = () => {
      if (local.pending !== pending) return;
      finish();
      cancel();
    };
    const timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    const pending = { descriptor: { ...descriptor }, cancel: expire };
    local.pending = pending;
    return finish;
  }

  cancelReplacements() {
    for (const producer of this.#producers.values()) producer.pending?.cancel();
  }

  reconcile(payload?: MediaSnapshotPayload) {
    const producers = new Map(
      payload?.ownProducers.map((producer) => [producer.source.producerId, producer]),
    );
    for (const [producerId, local] of this.#producers) {
      const current = producers.get(producerId);
      if (!current || !sameSourceBinding(current.source, local.source)) {
        this.#producers.delete(producerId);
        local.pending?.cancel();
        local.handle.close();
      } else if (
        local.pending &&
        !matchesReplacement(current.replacement, local.pending.descriptor)
      ) {
        local.pending.cancel();
      }
    }
    const transports = new Map(
      payload?.ownTransports.map((transport) => [transport.transportId, transport]),
    );
    for (const [transportId, local] of this.#transports) {
      if (transports.get(transportId)?.direction === local.direction) continue;
      this.#transports.delete(transportId);
      local.handle.close();
    }
  }
}
