import {
  apiErrorSchema,
  textConversationSubscribeAckSchema,
  textMessageHistoryResponseSchema,
  textMessageCreatedEventSchema,
  textConversationInvalidatedEventSchema,
  textHistoryMaxLimit,
  type TextHistoryMessage,
  type TextMessageHistoryQuery,
} from '@colearnia/contracts';

export type TextSyncPort = {
  listen(
    message: (event: unknown) => void,
    invalidated: (event: unknown) => void,
    disconnected: () => void,
  ): () => void;
  subscribe(
    input: { channelId: string; rootMessageId: null; afterCheckpoint?: string },
    signal: AbortSignal,
  ): Promise<unknown>;
  history(channelId: string, query: TextMessageHistoryQuery, signal: AbortSignal): Promise<unknown>;
  unsubscribe(subscriptionId: string): void;
};
export type TextSyncState = {
  phase: 'idle' | 'syncing' | 'live' | 'resync' | 'revoked' | 'blocked';
  reason?: 'PROJECTION_CAPACITY';
  messages: TextHistoryMessage[];
  checkpoint: string | undefined;
  olderCursor: string | null;
};
class SnapshotRequired extends Error {}
class ProjectionCapacityError extends Error {}

type Limits = {
  events: number;
  messages: number;
  bytes: number;
  pages: number;
  roundMs: number;
  pageSize?: number;
};

// Controller only: the labelled SCRUM-46 fixture UI is not silently switched to a live API.
export function createTextSynchronizer(
  port: TextSyncPort,
  channelId: string,
  limits: Limits,
  changed: (state: TextSyncState) => void,
) {
  const { pageSize, ...budgets } = limits;
  for (const value of [...Object.values(budgets), pageSize ?? textHistoryMaxLimit])
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
      throw new Error('Invalid sync limits');
  if (limits.bytes < 2) throw new Error('Sync byte budget cannot contain an empty projection');
  const pageLimit = Math.min(textHistoryMaxLimit, limits.messages, pageSize ?? textHistoryMaxLimit);
  // Learn a smaller snapshot window across rounds, including pages=1 configurations.
  let snapshotLimit = pageLimit;
  let state: TextSyncState = {
    phase: 'idle',
    messages: [],
    checkpoint: undefined,
    olderCursor: null,
  };
  let generation = 0;
  let cleanup: (() => void) | undefined;
  let inFlight: Promise<void> | undefined;
  let readOlder: (() => Promise<void>) | undefined;
  let olderInFlight: Promise<void> | undefined;
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const notify = () => changed({ ...state, messages: [...state.messages] });
  function stop() {
    generation++;
    cleanup?.();
    cleanup = undefined;
    inFlight = undefined;
    readOlder = undefined;
    olderInFlight = undefined;
    state = { phase: 'idle', messages: [], checkpoint: undefined, olderCursor: null };
    notify();
  }
  async function run() {
    readOlder = undefined;
    const turn = ++generation;
    cleanup?.();
    const controller = new AbortController();
    let subscriptionId: string | undefined;
    let conversationId: string | undefined;
    let buffered: unknown[] = [];
    let bufferBytes = 0;
    const valid = () => turn === generation && !controller.signal.aborted;
    const after = state.checkpoint;
    const initialSnapshotLimit = snapshotLimit;
    const rows = new Map(state.messages.map((row) => [row.id, row]));
    let rowBytes = bytes(state.messages);
    const ordered = () =>
      [...rows.values()].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
      );
    let completed = false;
    let olderCursor = state.olderCursor;
    let unlisten = () => {};
    function invalidate(revoked: boolean, forgetCheckpoint = false, capacityBlocked = false) {
      if (!valid()) return;
      cleanup?.();
      cleanup = undefined;
      inFlight = undefined;
      buffered = [];
      bufferBytes = 0;
      if (revoked)
        state = { phase: 'revoked', messages: [], checkpoint: undefined, olderCursor: null };
      else if (capacityBlocked)
        state = {
          phase: 'blocked',
          reason: 'PROJECTION_CAPACITY',
          messages: [],
          checkpoint: undefined,
          olderCursor: null,
        };
      else
        state = {
          ...state,
          phase: 'resync',
          ...(forgetCheckpoint && { checkpoint: undefined, messages: [], olderCursor: null }),
        };
      notify();
    }
    function merge(message: TextHistoryMessage) {
      if (
        message.channelId !== channelId ||
        message.rootMessageId !== null ||
        message.conversationId !== conversationId ||
        (message.commitSeq !== undefined && !Number.isSafeInteger(message.commitSeq))
      )
        throw new Error('Scope or sequence mismatch');
      if (rows.has(message.id)) return;
      const cost = bytes(message) + (rows.size > 0 ? 1 : 0);
      if (rows.size >= limits.messages || rowBytes + bufferBytes + cost > limits.bytes)
        throw new SnapshotRequired('Cache overflow');
      rows.set(message.id, message);
      rowBytes += cost;
    }
    function event(value: unknown, invalidation: boolean) {
      if (!valid()) return;
      const parsed = invalidation
        ? textConversationInvalidatedEventSchema.safeParse(value)
        : textMessageCreatedEventSchema.safeParse(value);
      if (!parsed.success) {
        invalidate(false);
        return;
      }
      if (!subscriptionId) {
        const cost = bytes(value);
        if (buffered.length >= limits.events || bufferBytes + rowBytes + cost > limits.bytes) {
          invalidate(false, true);
          return;
        }
        buffered.push({ value, invalidation });
        bufferBytes += cost;
        return;
      }
      if (parsed.data.subscriptionId !== subscriptionId) return;
      if ('reason' in parsed.data) {
        const revoked = parsed.data.reason === 'ACCESS_REVOKED';
        const recover = !revoked && state.phase === 'live';
        invalidate(revoked);
        if (recover) void reconcile();
        return;
      }
      if (!completed) {
        const cost = bytes(value);
        if (buffered.length >= limits.events || bufferBytes + rowBytes + cost > limits.bytes) {
          invalidate(false, true);
          return;
        }
        buffered.push({ value, invalidation: false });
        bufferBytes += cost;
      } else {
        try {
          merge(parsed.data.message);
          state.messages = ordered();
          notify();
        } catch (error) {
          invalidate(false, error instanceof SnapshotRequired);
          if (turn === generation) void reconcile();
        }
      }
    }
    const deadline = setTimeout(() => invalidate(false), limits.roundMs);
    unlisten = port.listen(
      (value) => event(value, false),
      (value) => event(value, true),
      () => invalidate(false),
    );
    cleanup = () => {
      clearTimeout(deadline);
      controller.abort();
      unlisten();
      if (subscriptionId) port.unsubscribe(subscriptionId);
    };
    state = { ...state, phase: 'syncing' };
    notify();
    try {
      const ack = textConversationSubscribeAckSchema.parse(
        await port.subscribe(
          { channelId, rootMessageId: null, ...(after && { afterCheckpoint: after }) },
          controller.signal,
        ),
      );
      if (!valid()) {
        if ('data' in ack) port.unsubscribe(ack.data.subscriptionId);
        return;
      }
      if ('error' in ack) throw ack.error;
      subscriptionId = ack.data.subscriptionId;
      const scope = ack.data.scope;
      if (scope.channelId !== channelId || scope.rootMessageId !== null)
        throw new Error('Wrong ACK scope');
      conversationId = scope.conversationId;
      if (!after) {
        rows.clear();
        rowBytes = 2;
      }
      // Process invalidations received before ACK before issuing a history request.
      const early = buffered;
      buffered = [];
      bufferBytes = 0;
      for (const item of early as { value: unknown; invalidation: boolean }[])
        event(item.value, item.invalidation);
      if (!valid()) return;
      const through = ack.data.throughCheckpoint;
      let cursor: string | undefined;
      const visited = new Set<string>();
      for (let pageNumber = 0; ; pageNumber++) {
        if (pageNumber >= limits.pages) throw new SnapshotRequired('Page budget exhausted');
        const query: TextMessageHistoryQuery = after
          ? {
              mode: 'catch-up',
              afterCheckpoint: after,
              throughCheckpoint: through,
              syncToken: ack.data.syncToken,
              limit: pageLimit,
              ...(cursor && { cursor }),
            }
          : {
              mode: 'snapshot',
              throughCheckpoint: through,
              syncToken: ack.data.syncToken,
              limit: snapshotLimit,
            };
        const raw = await port.history(channelId, query, controller.signal);
        if (!valid()) return;
        const failure = apiErrorSchema.safeParse(raw);
        if (failure.success) throw failure.data.error;
        const response = textMessageHistoryResponseSchema.parse(raw);
        if (!valid()) return;
        if ('error' in response) throw response.error;
        if (!response.data) throw new Error('Missing page');
        const page = response.data;
        if (
          page.mode !== query.mode ||
          !('throughCheckpoint' in page) ||
          page.throughCheckpoint !== through ||
          JSON.stringify(page.scope) !== JSON.stringify(scope)
        )
          throw new Error('Wrong page scope or turn');
        if (page.items.length > query.limit) throw new Error('Server exceeded requested limit');
        try {
          if (!after) {
            const projectedIds = new Set(page.items.map((message) => message.id));
            for (const item of buffered as { value: unknown }[]) {
              projectedIds.add(textMessageCreatedEventSchema.parse(item.value).message.id);
            }
            if (projectedIds.size > limits.messages)
              throw new SnapshotRequired('Snapshot and events exceed row budget');
          }
          for (const message of page.items) merge(message);
        } catch (error) {
          if (after || !(error instanceof SnapshotRequired)) throw error;
          rows.clear();
          rowBytes = 2;
          if (query.limit === 1) {
            if (page.items.some((message) => 2 + bytes(message) > limits.bytes))
              throw new ProjectionCapacityError();
            // Pending live events, rather than the minimum page itself, exhausted capacity.
            throw error;
          }
          snapshotLimit = Math.max(1, Math.floor(query.limit / 2));
          continue;
        }
        if (!after) {
          olderCursor = page.nextCursor;
          break;
        }
        if (page.nextCursor === null) break;
        if (visited.has(page.nextCursor)) throw new Error('Repeated cursor');
        visited.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      const pending = buffered;
      buffered = [];
      bufferBytes = 0;
      completed = true;
      for (const item of pending as { value: unknown; invalidation: boolean }[])
        event(item.value, item.invalidation);
      if (!valid()) return;
      clearTimeout(deadline);
      state = {
        ...state,
        phase: 'live',
        messages: ordered(),
        checkpoint: through,
        olderCursor,
      };
      notify();
      readOlder = async () => {
        const cursor = state.olderCursor;
        if (!valid() || !cursor) return;
        try {
          const raw = await port.history(
            channelId,
            { mode: 'history', cursor, limit: pageLimit },
            controller.signal,
          );
          if (!valid()) return;
          const failure = apiErrorSchema.safeParse(raw);
          if (failure.success) throw failure.data.error;
          const response = textMessageHistoryResponseSchema.parse(raw);
          if ('error' in response) throw response.error;
          const page = response.data;
          if (
            page.mode !== 'history' ||
            JSON.stringify(page.scope) !== JSON.stringify(scope) ||
            page.items.length > pageLimit ||
            page.nextCursor === cursor
          )
            throw new SnapshotRequired('Wrong older-history scope');
          for (const row of page.items) merge(row);
          state = { ...state, messages: ordered(), olderCursor: page.nextCursor };
          notify();
        } catch (error) {
          if (error instanceof ProjectionCapacityError) invalidate(false, true, true);
          else {
            const code =
              error && typeof error === 'object' && 'code' in error ? error.code : undefined;
            invalidate(
              ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'].includes(String(code)),
              code === 'CONFLICT' || error instanceof SnapshotRequired,
            );
          }
        }
      };
    } catch (error) {
      if (error instanceof ProjectionCapacityError) {
        invalidate(false, true, true);
        return;
      }
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      invalidate(
        ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND'].includes(String(code)),
        code === 'CONFLICT' || error instanceof SnapshotRequired,
      );
      const needsSnapshot =
        (after !== undefined && (code === 'CONFLICT' || error instanceof SnapshotRequired)) ||
        (error instanceof SnapshotRequired && snapshotLimit < initialSnapshotLimit);
      if (turn === generation && needsSnapshot) await reconcile();
    }
  }
  function reconcile() {
    if (state.phase === 'blocked') return Promise.resolve();
    if (inFlight) return inFlight;
    const pending = run();
    inFlight = pending;
    void pending.finally(() => {
      if (inFlight === pending) inFlight = undefined;
    });
    return pending;
  }
  function loadOlder() {
    if (state.phase !== 'live' || !readOlder) return Promise.resolve();
    if (olderInFlight) return olderInFlight;
    const pending = readOlder();
    olderInFlight = pending;
    void pending.finally(() => {
      if (olderInFlight === pending) olderInFlight = undefined;
    });
    return pending;
  }
  return {
    reconcile,
    loadOlder,
    stop,
    snapshot: () => ({ ...state, messages: [...state.messages] }),
  };
}
