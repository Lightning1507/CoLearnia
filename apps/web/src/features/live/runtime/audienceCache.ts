import { QueryClient } from '@tanstack/react-query';
import type { SessionProjectionCursor } from '@colearnia/contracts';
import type { CallIdentity } from './callController';

export type AudienceLease = Readonly<{
  key: readonly (string | number)[];
  signal: AbortSignal;
}>;

// Only ephemeral meeting chat/board/frame queries belong here. Workspace/DM
// history has its own ACL and must not share this cache's lifetime.
export class AudienceCache {
  readonly #queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  readonly #prefix: readonly (string | number)[];
  #lease: AudienceLease | undefined;
  #abort: AbortController | undefined;
  #revision = 0;
  #cleanup = new Set<() => void>();

  constructor(identity: CallIdentity) {
    this.#prefix = [
      'live-session',
      identity.sessionId,
      identity.epoch,
      identity.participantId,
      identity.callGeneration,
    ];
  }

  capture() {
    return this.#lease;
  }

  subscribe = (listener: () => void) => this.#queries.getQueryCache().subscribe(listener);

  activate(cursor: SessionProjectionCursor) {
    this.invalidate();
    this.#abort = new AbortController();
    this.#lease = Object.freeze({
      key: Object.freeze([
        ...this.#prefix,
        cursor.audienceEpoch,
        cursor.scope.type,
        cursor.scope.type === 'GROUP' ? cursor.scope.groupId : '',
        ++this.#revision,
      ]),
      signal: this.#abort.signal,
    });
  }

  isCurrent(lease: AudienceLease | undefined): lease is AudienceLease {
    return Boolean(lease && lease === this.#lease && !lease.signal.aborted);
  }

  read<T>(lease: AudienceLease, key: string): T | undefined {
    if (this.isCurrent(lease)) return this.#queries.getQueryData<T>([...lease.key, key]);
  }

  write<T>(lease: AudienceLease, key: string, value: T) {
    if (!this.isCurrent(lease)) return false;
    this.#queries.setQueryData([...lease.key, key], value);
    return true;
  }

  async load<T>(lease: AudienceLease, key: string, load: (signal: AbortSignal) => Promise<T>) {
    if (!this.isCurrent(lease)) return;
    try {
      const value = await this.#queries.fetchQuery({
        queryKey: [...lease.key, key],
        queryFn: ({ signal }) => load(signal),
      });
      if (this.isCurrent(lease)) return value;
    } catch (error) {
      if (this.isCurrent(lease)) throw error;
    }
  }

  // Register subscriptions/object URLs when acquired. A late image completion
  // must pass its captured lease here before attaching anything to the UI.
  retain(lease: AudienceLease, dispose: () => void) {
    if (!this.isCurrent(lease)) {
      dispose();
      return false;
    }
    this.#cleanup.add(dispose);
    return true;
  }

  invalidate() {
    this.#lease = undefined;
    this.#abort?.abort();
    this.#abort = undefined;
    void this.#queries.cancelQueries({ queryKey: this.#prefix });
    this.#queries.removeQueries({ queryKey: this.#prefix });
    const cleanup = [...this.#cleanup];
    this.#cleanup.clear();
    // Every handle must be revoked even when another consumer's cleanup fails.
    for (const dispose of cleanup) {
      try {
        dispose();
      } catch {
        /* Keep the audience denied. */
      }
    }
  }
}
