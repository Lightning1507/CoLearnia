import { Types } from 'mongoose';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { sessionEpochSchema } from '@colearnia/contracts';
import type { Database } from '../../lib/database.js';
import { preflightIndexes } from '../../lib/database-preflight.js';
import { createSessionRepository } from './session-repository.js';
import { sessionIndexRequirements, sessionModels } from './session-models.js';

export type StaleSession = Readonly<{
  sessionId: string;
  epoch: string;
  workspaceId: string;
  channelId: string;
}>;
const cleanupResultSchema = z.strictObject({
  sessionId: z.string(),
  epoch: sessionEpochSchema,
  permissionRevoked: z.boolean(),
  pendingInvalidated: z.boolean(),
  cleanupPending: z.boolean(),
});
export type PrepareStaleSession = (
  input: StaleSession,
  signal: AbortSignal,
) => Promise<z.infer<typeof cleanupResultSchema>>;
export class SessionBootstrapError extends Error {
  constructor() {
    super('Session bootstrap requires reconciliation');
    this.name = 'SessionBootstrapError';
  }
}

// Conservative fallback until M2/M5 supply their cleanup providers. Reads only.
// Absence/closure is evidence; presence of an unhandled artifact keeps readiness false.
export function createColdSessionArtifactGuard(database: Database): PrepareStaleSession {
  return async (input, signal) => {
    const db = database.connection.db;
    if (!db || signal.aborted) throw new SessionBootstrapError();
    const sessionId = new Types.ObjectId(input.sessionId);
    const conversation = await db.collection('conversations').findOne(
      {
        kind: { $in: ['SESSION', 'GROUP', 'HOST_PRIVATE'] },
        'scope.sessionId': sessionId,
        $expr: { $ne: [{ $type: '$closedAt' }, 'date'] },
      },
      { projection: { _id: 1 }, maxTimeMS: 5000 },
    );
    const frame = await db.collection('files').findOne(
      {
        purpose: 'FRAME',
        'scope.sessionId': sessionId,
        $expr: {
          $and: [
            { $ne: ['$state', 'DELETE_PENDING'] },
            { $ne: [{ $type: '$cleanupAfter' }, 'date'] },
          ],
        },
      },
      { projection: { _id: 1 }, maxTimeMS: 5000 },
    );
    if (signal.aborted) throw new SessionBootstrapError();
    const confirmed = !conversation && !frame;
    return {
      sessionId: input.sessionId,
      epoch: input.epoch,
      permissionRevoked: confirmed,
      pendingInvalidated: confirmed,
      cleanupPending: true,
    };
  };
}

// Cold startup only, before accepting live runtime. Health HTTP can already listen.
export function createSessionBootstrap(
  database: Database,
  options: {
    isOffline(): boolean;
    prepareStaleSession: PrepareStaleSession;
    now?: () => number;
    pageSize?: number;
    maxSessions?: number;
    cleanupTimeoutMs?: number;
    totalTimeoutMs?: number;
  },
) {
  const { LiveSession } = sessionModels(database.connection);
  const repository = createSessionRepository(database);
  const now = options.now ?? Date.now;
  const pageSize = options.pageSize ?? 25;
  const maxSessions = options.maxSessions ?? 10_000;
  const timeoutMs = options.cleanupTimeoutMs ?? 10_000;
  const totalTimeoutMs = options.totalTimeoutMs ?? 30_000;
  if (
    ![pageSize, maxSessions, timeoutMs, totalTimeoutMs].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) ||
    pageSize > 100
  )
    throw new TypeError('Invalid bootstrap limits');
  let state: 'IDLE' | 'RUNNING' | 'READY' | 'FAILED' = 'IDLE';
  let ended = 0;
  let task: Promise<void> | undefined;
  const totalAbort = new AbortController();
  let deadline = Number.POSITIVE_INFINITY;
  function offline() {
    if (
      totalAbort.signal.aborted ||
      performance.now() >= deadline ||
      !options.isOffline() ||
      !database.isConnected()
    )
      throw new SessionBootstrapError();
  }
  const timestamp = () => {
    const at = new Date(now());
    if (!Number.isFinite(at.getTime())) throw new SessionBootstrapError();
    return at;
  };

  async function prepare(input: StaleSession) {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          options.prepareStaleSession(
            Object.freeze({ ...input }),
            AbortSignal.any([abort.signal, totalAbort.signal]),
          ),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              abort.abort();
              reject(new SessionBootstrapError());
            },
            Math.min(timeoutMs, Math.max(0, deadline - performance.now())),
          );
        }),
      ]);
      const parsed = cleanupResultSchema.safeParse(result);
      if (
        !parsed.success ||
        parsed.data.sessionId !== input.sessionId ||
        parsed.data.epoch !== input.epoch ||
        !parsed.data.permissionRevoked ||
        !parsed.data.pendingInvalidated
      )
        throw new SessionBootstrapError();
    } finally {
      clearTimeout(timer);
    }
  }
  async function execute() {
    offline();
    const db = database.connection.db!;
    const collections = await db
      .listCollections(
        { name: { $in: ['liveSessions', 'sessionParticipants'] } },
        { nameOnly: true },
      )
      .toArray();
    offline();
    // Fresh database: no old metadata; do not auto provision a feature's schema/indexes.
    if (!collections.length) return;
    if (
      collections.length !== 2 ||
      !(await preflightIndexes(database.connection, sessionIndexRequirements)).ready
    )
      throw new SessionBootstrapError();
    let cursor: Types.ObjectId | undefined;
    for (;;) {
      offline();
      const batch = await LiveSession.find({
        status: { $in: ['ACTIVE', 'ENDING'] },
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      })
        .select('_id epoch workspaceId channelId status revision')
        .sort({ _id: 1 })
        .limit(pageSize)
        .read('primary')
        .readConcern('majority')
        .maxTimeMS(5000)
        .lean();
      offline();
      if (!batch.length) return;
      for (const session of batch) {
        offline();
        if (ended >= maxSessions) throw new SessionBootstrapError();
        const identity = { sessionId: session._id, epoch: session.epoch };
        let revision = session.revision;
        if (session.status === 'ACTIVE') {
          const ending = await repository.beginEnding({
            ...identity,
            expectedRevision: revision,
            at: timestamp(),
          });
          revision = ending.revision;
        }
        offline();
        await prepare({
          sessionId: session._id.toHexString(),
          epoch: session.epoch,
          workspaceId: session.workspaceId.toHexString(),
          channelId: session.channelId.toHexString(),
        });
        offline();
        // Participant leftAt and host=null are committed together, never restored as grants.
        await repository.completeEnding(
          {
            ...identity,
            expectedRevision: revision,
            at: timestamp(),
          },
          offline,
        );
        offline();
        ended++;
        cursor = session._id;
      }
    }
  }
  return {
    isReady: () => state === 'READY',
    stats: () => ({ state, ended }),
    run() {
      // Single-flight and one attempt per process. Failed/late cleanup never overlaps a retry.
      if (!task) {
        state = 'RUNNING';
        deadline = performance.now() + totalTimeoutMs;
        let timer: ReturnType<typeof setTimeout>;
        const timedOut = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            totalAbort.abort();
            reject(new SessionBootstrapError());
          }, totalTimeoutMs);
        });
        task = Promise.race([execute(), timedOut])
          .then(
            () => {
              state = 'READY';
            },
            () => {
              state = 'FAILED';
              throw new SessionBootstrapError();
            },
          )
          .finally(() => clearTimeout(timer));
      }
      return task;
    },
  };
}
