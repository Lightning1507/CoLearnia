import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  accessCleanupResultSchema,
  accessRevisionSchema,
  membershipIncarnationSchema,
  accessRevocationSchema,
  workspaceDocumentIdSchema,
} from '@colearnia/contracts';
import type {
  AccessCleanupResult,
  AccessRevocation,
  AuthenticatedContext,
} from '@colearnia/contracts';
import type { CoordinationContext, OperationCoordinator } from '../lib/operation-coordinator.js';
import type { MessagingRevocationPort, MessagingRevocationTarget } from '../messaging/ports.js';

export class AccessRevocationError extends Error {
  constructor(public readonly code: 'CONFLICT' | 'SERVER_BUSY' | 'DEPENDENCY_UNAVAILABLE') {
    super(code);
    this.name = 'AccessRevocationError';
  }
}
const normalizedIdSchema = workspaceDocumentIdSchema.transform((value) => value.toLowerCase());
const revocationPrincipalSchema = z.object({
  userId: normalizedIdSchema,
  authSessionId: normalizedIdSchema,
});
const workspaceAccessSchema = z.object({
  workspaceId: normalizedIdSchema,
  membershipId: normalizedIdSchema,
  membershipIncarnation: membershipIncarnationSchema,
  membershipRevision: accessRevisionSchema,
});
// Workspace-only checks have neither channel field. A channel check always needs
// BOTH its ID and revision; never silently downgrade malformed channel input.
const revocationAccessSchema = z.union([
  workspaceAccessSchema.extend({
    channelId: z.never().optional(),
    channelRevision: z.never().optional(),
  }),
  workspaceAccessSchema.extend({
    channelId: normalizedIdSchema,
    channelRevision: accessRevisionSchema,
  }),
]);
export type RevocationAccess = z.infer<typeof revocationAccessSchema>;
export interface AccessRevocationBarrier {
  // Freshness only, not an ACL grant. Called under the same shared gate as the consumer.
  isCurrent(
    auth: AuthenticatedContext,
    access: RevocationAccess | undefined,
    held: CoordinationContext,
  ): boolean;
}
export type RevocationPersistence = {
  // Trusted business service: authorize actor, verify current target/revision and capture
  // the exact ACTIVE auth-session cohort. No external cleanup or transaction kept open.
  prepareHeld(held: CoordinationContext): Promise<{ authSessionIds: readonly string[] }>;
  // Recheck operation/revision/incarnation, then write a CAS/transaction using the captured
  // cohort. Must NOT select all current sessions on retry. Unknown commit is explicit.
  commitHeld(
    held: CoordinationContext,
    authSessionIds: readonly string[],
  ): Promise<'committed' | 'unknown'>;
  // Read back the durable outcome before ANY repeat write (also after a thrown commit).
  reconcileHeld(held: CoordinationContext): Promise<'committed' | 'not_committed' | 'unknown'>;
};

type Leg = {
  target: MessagingRevocationTarget;
  generation?: number;
  done: boolean;
  pending?: Promise<boolean>;
};
type RecordEntry = {
  event: AccessRevocation;
  userId: string;
  command: string;
  persistence: RevocationPersistence;
  cohort: readonly string[];
  prepared: boolean;
  installed: boolean;
  legs: Leg[];
  liveDone: boolean;
  livePending?: Promise<boolean>;
  cleanupPending: boolean;
  writeAttempted: boolean;
  committed: boolean;
  active?: Promise<AccessCleanupResult>;
};
const objectId = (value: string) => workspaceDocumentIdSchema.parse(value).toLowerCase();
const fail = (code: ConstructorParameters<typeof AccessRevocationError>[0]): never => {
  throw new AccessRevocationError(code);
};

// One process, shared with ALL ACL/mutation/runtime consumers. No timer evicts an
// unresolved deny. Capacity exhaustion fails closed; restart recovery is not provided.
export function createAccessRevocationCoordinator(options: {
  coordinator: OperationCoordinator;
  messaging: MessagingRevocationPort;
  live: { revoke(event: AccessRevocation): Promise<AccessCleanupResult> };
  maxOperations?: number;
  maxAuthSessions?: number;
  maxConcurrentOperations?: number;
  maxInFlightAdapterTasks?: number;
  cleanupTimeoutMs?: number;
}) {
  const maxOperations = options.maxOperations ?? 1024;
  const maxConcurrentOperations = options.maxConcurrentOperations ?? 16;
  let activeOperations = 0;
  let adapterTasks = 0;
  const maxInFlightAdapterTasks = options.maxInFlightAdapterTasks ?? 256;
  const maxAuthSessions = options.maxAuthSessions ?? 128;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 2000;
  for (const value of [
    maxOperations,
    maxAuthSessions,
    cleanupTimeoutMs,
    maxConcurrentOperations,
    maxInFlightAdapterTasks,
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid revocation limit');
  }
  const records = new Map<string, RecordEntry>();
  const scope = (record: RecordEntry) => ({
    userId: record.userId,
    ...('workspaceId' in record.event ? { workspaceId: record.event.workspaceId } : {}),
  });
  function matches(record: RecordEntry, auth: AuthenticatedContext, access?: RevocationAccess) {
    if (!record.installed) return false;
    const event = record.event;
    switch (event.kind) {
      case 'AUTH_SESSION':
        return auth.authSessionId.toLowerCase() === event.authSessionId;
      case 'USER_AUTH_SESSIONS':
        return (
          auth.userId.toLowerCase() === event.userId &&
          record.cohort.includes(auth.authSessionId.toLowerCase())
        );
      case 'WORKSPACE_DELETED':
        return access?.workspaceId === event.workspaceId;
      case 'CHANNEL_DELETED':
        return (
          access?.workspaceId === event.workspaceId &&
          access.channelId === event.channelId &&
          (!record.committed ||
            (access.channelRevision !== undefined && access.channelRevision <= event.revision))
        );
      case 'WORKSPACE_MEMBERSHIP':
      case 'PRIVATE_CHANNEL_ACCESS':
        return (
          auth.userId.toLowerCase() === event.userId &&
          access?.workspaceId === event.workspaceId &&
          access.membershipId === event.membershipId &&
          access.membershipIncarnation === event.membershipIncarnation &&
          (event.kind === 'WORKSPACE_MEMBERSHIP'
            ? !record.committed || access.membershipRevision <= event.revision
            : access.channelId === event.channelId &&
              (!record.committed ||
                (access.channelRevision !== undefined && access.channelRevision <= event.revision)))
        );
    }
  }
  const barrier: AccessRevocationBarrier = {
    isCurrent(auth, access, held) {
      const principal = revocationPrincipalSchema.safeParse(auth);
      const parsedAccess =
        access === undefined ? undefined : revocationAccessSchema.safeParse(access);
      if (!principal.success || (parsedAccess && !parsedAccess.success)) return false;
      const normalizedAccess = parsedAccess?.data;
      held.assertHeld(
        normalizedAccess
          ? { workspaceId: normalizedAccess.workspaceId }
          : { userId: principal.data.userId },
      );
      return ![...records.values()].some((record) =>
        matches(record, { ...auth, ...principal.data }, normalizedAccess),
      );
    },
  };
  function targets(record: RecordEntry): MessagingRevocationTarget[] {
    const event = record.event;
    switch (event.kind) {
      case 'AUTH_SESSION':
        return [
          { kind: 'AUTH_SESSION', userId: record.userId, authSessionId: event.authSessionId },
        ];
      case 'USER_AUTH_SESSIONS':
        return record.cohort.map((authSessionId) => ({
          kind: 'AUTH_SESSION',
          userId: event.userId,
          authSessionId,
        }));
      case 'WORKSPACE_MEMBERSHIP':
        return [{ kind: 'WORKSPACE', workspaceId: event.workspaceId, userId: event.userId }];
      case 'PRIVATE_CHANNEL_ACCESS':
        return [
          {
            kind: 'CHANNEL',
            workspaceId: event.workspaceId,
            channelId: event.channelId,
            userId: event.userId,
          },
        ];
      case 'CHANNEL_DELETED':
        return [
          {
            kind: 'CHANNEL',
            workspaceId: event.workspaceId,
            channelId: event.channelId,
            userId: null,
          },
        ];
      case 'WORKSPACE_DELETED':
        return [{ kind: 'WORKSPACE', workspaceId: event.workspaceId, userId: null }];
    }
  }
  function result(record: RecordEntry): AccessCleanupResult {
    const complete = record.committed && record.liveDone && record.legs.every((leg) => leg.done);
    return {
      operationId: record.event.operationId,
      permissionRevoked: complete,
      pendingInvalidated: complete,
      cleanupPending: !complete || record.cleanupPending,
    };
  }
  async function bounded<T>(
    task: Promise<T>,
    timeout: number,
    abort: () => void,
  ): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(
            () => {
              abort();
              resolve(undefined);
            },
            Math.max(1, timeout),
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  function launch(work: () => Promise<boolean>): Promise<boolean> | undefined {
    if (adapterTasks >= maxInFlightAdapterTasks) return undefined;
    adapterTasks++;
    return Promise.resolve()
      .then(work)
      .catch(() => false)
      .finally(() => {
        adapterTasks--;
      });
  }
  async function execute(record: RecordEntry) {
    await options.coordinator.run(scope(record), async (held) => {
      if (!record.prepared) {
        const captured = await record.persistence.prepareHeld(held);
        if (
          !Array.isArray(captured.authSessionIds) ||
          captured.authSessionIds.length > maxAuthSessions
        )
          fail('SERVER_BUSY');
        record.cohort = Object.freeze([...new Set(captured.authSessionIds.map(objectId))]);
        if (record.event.kind !== 'USER_AUTH_SESSIONS' && record.cohort.length !== 0)
          throw new TypeError('Only logout-all captures a cohort');
        record.prepared = true;
        record.legs = targets(record).map((target) => ({ target, done: false }));
        // Install BEFORE fence, including when a synchronous adapter fence throws.
        record.installed = true;
      }
      for (const leg of record.legs) {
        if (leg.generation !== undefined) continue;
        const fence = options.messaging.fence({
          revocationId: record.event.operationId,
          target: structuredClone(leg.target),
        });
        if (
          !Number.isSafeInteger(fence.throughResourceGeneration) ||
          fence.throughResourceGeneration < 0
        )
          fail('DEPENDENCY_UNAVAILABLE');
        leg.generation = fence.throughResourceGeneration;
      }
    });
    // M4 acquires Workspace gates internally; never await these adapters while holding one.
    const controller = new AbortController();
    const deadlineMs = performance.now() + cleanupTimeoutMs;
    const tasks = record.legs.map(async (leg) => {
      if (leg.done) return;
      if (!leg.pending) {
        const pending = launch(async () => {
          const reply = await options.messaging.revoke({
            revocationId: record.event.operationId,
            target: structuredClone(leg.target),
            throughResourceGeneration: leg.generation!,
            deadlineMs,
            signal: controller.signal,
          });
          return reply.revocationId === record.event.operationId && reply.status === 'completed';
        });
        if (!pending) return;
        leg.pending = pending;
      }
      const task = leg.pending;
      const done = await bounded(task, deadlineMs - performance.now(), () => controller.abort());
      if (done !== undefined) {
        leg.done = done;
        delete leg.pending;
      }
    });
    if (!record.liveDone) {
      if (!record.livePending) {
        const pending = launch(async () => {
          const reply = accessCleanupResultSchema.parse(
            await options.live.revoke(structuredClone(record.event)),
          );
          if (reply.operationId !== record.event.operationId) return false;
          record.cleanupPending = reply.cleanupPending;
          return reply.permissionRevoked && reply.pendingInvalidated;
        });
        if (pending) record.livePending = pending;
      }
      if (record.livePending)
        tasks.push(
          (async () => {
            const done = await bounded(record.livePending!, deadlineMs - performance.now(), () =>
              controller.abort(),
            );
            if (done !== undefined) {
              record.liveDone = done;
              delete record.livePending;
            }
          })(),
        );
    }
    await Promise.all(tasks);
    if (!record.liveDone || record.legs.some((leg) => !leg.done)) return result(record);
    await options.coordinator.run(scope(record), async (held) => {
      if (record.committed) return;
      if (record.writeAttempted) {
        const outcome = await record.persistence.reconcileHeld(held);
        if (outcome === 'committed') {
          record.committed = true;
          return;
        }
        if (outcome !== 'not_committed') return;
      }
      record.writeAttempted = true;
      const outcome = await record.persistence.commitHeld(held, [...record.cohort]);
      if (outcome === 'committed') record.committed = true;
      else if (outcome !== 'unknown') throw new TypeError('Invalid persistence outcome');
    });
    return result(record);
  }
  return {
    barrier,
    // M4's revokedAuthSessions callback: exact immutable cohort, never a fresh DB query.
    revokedAuthSessions(raw: AccessRevocation): readonly string[] {
      const event = accessRevocationSchema.parse(raw);
      const record = records.get(event.operationId);
      if (!record?.installed || JSON.stringify(event) !== JSON.stringify(record.event))
        return fail('DEPENDENCY_UNAVAILABLE');
      return [...record.cohort];
    },
    async revoke(input: {
      event: AccessRevocation;
      // For auth-session this MUST be its server-verified owner; otherwise the affected
      // user (when present) or the actor. prepareHeld verifies actor/target from DB.
      userId: string;
      persistence: RevocationPersistence;
    }): Promise<AccessCleanupResult> {
      const parsed = accessRevocationSchema.parse(input.event);
      const event = accessRevocationSchema.parse(
        Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            typeof value === 'string' && (key.endsWith('Id') || key === 'operationId')
              ? value.toLowerCase()
              : value,
          ]),
        ),
      );
      const userId = objectId(input.userId);
      if ('userId' in event && event.userId !== userId)
        throw new TypeError('Affected User gate required');
      const command = JSON.stringify({ event, userId });
      let record = records.get(event.operationId);
      if (record && record.command !== command) return fail('CONFLICT');
      if (!record && activeOperations >= maxConcurrentOperations) return fail('SERVER_BUSY');
      if (!record) {
        if (records.size >= maxOperations) return fail('SERVER_BUSY');
        if (!options.messaging || !options.live) return fail('DEPENDENCY_UNAVAILABLE');
        record = {
          event,
          userId,
          command,
          persistence: { ...input.persistence },
          cohort: [],
          prepared: false,
          installed: false,
          legs: [],
          liveDone: false,
          cleanupPending: false,
          writeAttempted: false,
          committed: false,
        };
        records.set(event.operationId, record);
      }
      if (record.committed) return result(record);
      if (!record.active) {
        if (activeOperations >= maxConcurrentOperations) return fail('SERVER_BUSY');
        activeOperations++;
        const current = record;
        current.active = execute(current)
          .catch((error: unknown) => {
            if (!current.installed) {
              records.delete(current.event.operationId);
              throw error;
            }
            return result(current);
          })
          .finally(() => {
            delete current.active;
            activeOperations--;
          });
      }
      return structuredClone(await record.active!);
    },
    metrics() {
      return {
        operations: records.size,
        adapterTasks,
        pending: [...records.values()].filter((record) => !record.committed).length,
      };
    },
  };
}
