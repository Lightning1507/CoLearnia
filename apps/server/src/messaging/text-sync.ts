import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  AuthenticatedContext,
  ChannelAccessSnapshot,
  TextMessageScope,
} from '@colearnia/contracts';
import type { MessagingRevocationPort, MessagingRevocationTarget } from './ports.js';

// No runtime defaults: these are resource limits, not product capacity claims.
export const textSyncLimitsSchema = z.strictObject({
  subscriptions: z.number().int().positive().max(1024),
  perUser: z.number().int().positive().max(64),
  leaseMs: z.number().int().min(100).max(300_000),
  revocationRecords: z.number().int().positive().max(4096),
});
export type TextSyncLimits = z.infer<typeof textSyncLimitsSchema>;
export class TextSyncError extends Error {
  constructor(readonly code: 'CONFLICT' | 'SERVER_BUSY' | 'VALIDATION_ERROR') {
    super(code);
  }
}
export type SyncEntry = {
  actor: AuthenticatedContext;
  scope: TextMessageScope;
  access: ChannelAccessSnapshot;
  owner: string;
  id: string;
  token: string;
  generation: number;
  expiresAt: number;
  historyExpiresAt: number;
  through: number;
  after: number | undefined;
  throughCheckpoint: string;
  afterCheckpoint: string | undefined;
  pending: boolean;
  emit: (event: 'message.created' | 'conversation.invalidated', payload: unknown) => boolean;
  timer: ReturnType<typeof setTimeout>;
};

const checkpointBody = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.number().int().nonnegative().safe(),
]);
export function createTextSyncRegistry(secret: string, limits: TextSyncLimits) {
  textSyncLimitsSchema.parse(limits);
  const epoch = randomUUID();
  let generation = 0;
  const entries = new Map<string, SyncEntry>();
  const fences = new Map<string, { target: string; generation: number }>();
  const sign = (body: string) =>
    createHmac('sha256', secret).update('text-checkpoint:').update(body).digest();
  function checkpoint(scope: TextMessageScope, sequence: number) {
    const body = Buffer.from(
      JSON.stringify([epoch, scope.channelId, scope.conversationId, sequence]),
    ).toString('base64url');
    return body + '.' + sign(body).toString('base64url');
  }
  function sequence(value: string, scope: TextMessageScope) {
    try {
      const [body, signature, extra] = value.split('.');
      if (!body || !signature || extra !== undefined) throw new Error();
      const actual = Buffer.from(signature, 'base64url');
      const expected = sign(body);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error();
      const [issuedEpoch, channel, conversation, seq] = checkpointBody.parse(
        JSON.parse(Buffer.from(body, 'base64url').toString()),
      );
      if (
        issuedEpoch !== epoch ||
        channel !== scope.channelId ||
        conversation !== scope.conversationId
      )
        throw new Error();
      return seq;
    } catch {
      throw new TextSyncError('CONFLICT');
    }
  }
  function close(entry: SyncEntry, reason?: 'ACCESS_REVOKED' | 'RESYNC_REQUIRED') {
    if (entries.get(entry.id) !== entry) return;
    entries.delete(entry.id);
    clearTimeout(entry.timer);
    if (reason) {
      try {
        entry.emit('conversation.invalidated', { subscriptionId: entry.id, reason });
      } catch {
        /* Already fenced. */
      }
    }
  }
  function current(entry: SyncEntry, actor: AuthenticatedContext, access: ChannelAccessSnapshot) {
    if (
      entries.get(entry.id) !== entry ||
      entry.pending ||
      Date.now() >= entry.expiresAt ||
      actor.userId !== entry.actor.userId ||
      actor.authSessionId !== entry.actor.authSessionId ||
      JSON.stringify(access) !== JSON.stringify(entry.access)
    ) {
      // A request from another session must not invalidate the owner's lease.
      if (actor.authSessionId === entry.actor.authSessionId) close(entry, 'RESYNC_REQUIRED');
      throw new TextSyncError('CONFLICT');
    }
  }
  function currentHistory(
    entry: SyncEntry,
    actor: AuthenticatedContext,
    access: ChannelAccessSnapshot,
  ) {
    current(entry, actor, access);
    if (Date.now() >= entry.historyExpiresAt) throw new TextSyncError('CONFLICT');
  }
  const matches = (entry: SyncEntry, target: MessagingRevocationTarget) => {
    if (target.kind === 'RUNTIME') return false;
    if (target.userId !== null && target.userId !== entry.actor.userId) return false;
    if (target.kind === 'AUTH_SESSION') return target.authSessionId === entry.actor.authSessionId;
    if (target.kind === 'USER') return true;
    if (target.workspaceId !== entry.access.workspaceId) return false;
    return target.kind === 'WORKSPACE' || target.channelId === entry.scope.channelId;
  };
  const revocation: MessagingRevocationPort = {
    fence({ revocationId, target }) {
      const serialized = JSON.stringify(target);
      let fence = fences.get(revocationId);
      if (fence && fence.target !== serialized) throw new TextSyncError('CONFLICT');
      if (!fence) {
        if (fences.size >= limits.revocationRecords) throw new TextSyncError('SERVER_BUSY');
        fence = { target: serialized, generation };
        fences.set(revocationId, fence);
      }
      for (const entry of entries.values()) {
        if (entry.generation <= fence.generation && matches(entry, target)) entry.pending = true;
      }
      return { throughResourceGeneration: fence.generation };
    },
    async revoke({ revocationId, target, throughResourceGeneration, signal, deadlineMs }) {
      const fence = fences.get(revocationId);
      if (
        !fence ||
        fence.target !== JSON.stringify(target) ||
        fence.generation !== throughResourceGeneration ||
        signal.aborted ||
        performance.now() >= deadlineMs
      ) {
        return { status: 'blocked', revocationId, retryRequired: true };
      }
      for (const entry of entries.values()) {
        if (entry.generation <= throughResourceGeneration && matches(entry, target))
          close(entry, 'ACCESS_REVOKED');
      }
      return { status: 'completed', revocationId };
    },
  };
  return {
    retainedBytes: () => entries.size * 8192,
    revocation,
    close,
    current,
    currentHistory,
    cursor(entry: SyncEntry, position: number) {
      return checkpoint({ ...entry.scope, channelId: 'page:' + entry.id }, position);
    },
    position(entry: SyncEntry, cursor: string) {
      const position = sequence(cursor, { ...entry.scope, channelId: 'page:' + entry.id });
      if (entry.after === undefined || position <= entry.after || position > entry.through)
        throw new TextSyncError('CONFLICT');
      return position;
    },
    entries: () => [...entries.values()],
    closeOwner(owner: string) {
      for (const entry of entries.values()) if (entry.owner === owner) close(entry);
    },
    stop() {
      for (const entry of entries.values()) close(entry, 'RESYNC_REQUIRED');
    },
    open(
      input: Pick<SyncEntry, 'actor' | 'scope' | 'access' | 'owner' | 'emit'>,
      through: number,
      afterCheckpoint?: string,
      persistOnSocket = false,
    ) {
      if (
        entries.size >= limits.subscriptions ||
        [...entries.values()].filter((e) => e.actor.userId === input.actor.userId).length >=
          limits.perUser ||
        generation >= Number.MAX_SAFE_INTEGER
      )
        throw new TextSyncError('SERVER_BUSY');
      const after =
        afterCheckpoint === undefined ? undefined : sequence(afterCheckpoint, input.scope);
      if (after !== undefined && after > through) throw new TextSyncError('CONFLICT');
      const id = randomUUID();
      const authExpiresAt = Date.parse(input.actor.expiresAt);
      const historyExpiresAt = Math.min(authExpiresAt, Date.now() + limits.leaseMs);
      const expiresAt = persistOnSocket ? authExpiresAt : historyExpiresAt;
      if (expiresAt <= Date.now()) throw new TextSyncError('CONFLICT');
      // History tokens keep their original deadline. Opted-in sockets keep only fanout after it.
      const scheduleExpiry = (): ReturnType<typeof setTimeout> =>
        setTimeout(
          () => {
            if (Date.now() < expiresAt) {
              entry.timer = scheduleExpiry();
              return;
            }
            close(entry, Date.now() >= authExpiresAt ? 'ACCESS_REVOKED' : 'RESYNC_REQUIRED');
          },
          Math.min(expiresAt - Date.now(), 2_147_483_647),
        ).unref();
      const entry: SyncEntry = {
        ...input,
        id,
        token: randomBytes(32).toString('base64url'),
        generation: ++generation,
        expiresAt,
        historyExpiresAt,
        through,
        after,
        throughCheckpoint: checkpoint(input.scope, through),
        afterCheckpoint,
        pending: false,
        timer: scheduleExpiry(),
      };
      entries.set(id, entry);
      return entry;
    },
    find(token: string, actor: AuthenticatedContext, access: ChannelAccessSnapshot) {
      const entry = [...entries.values()].find(
        (e) =>
          e.token === token &&
          e.actor.authSessionId === actor.authSessionId &&
          e.actor.userId === actor.userId,
      );
      if (!entry) throw new TextSyncError('CONFLICT');
      currentHistory(entry, actor, access);
      return entry;
    },
    unsubscribe(id: string, owner: string) {
      const entry = entries.get(id);
      if (entry?.owner === owner) close(entry);
    },
  };
}
