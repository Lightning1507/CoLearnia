import { createHash } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { DatabaseDeadlineError, databaseQueryOptions } from '../lib/database.js';
import type { Database, DatabaseDeadline } from '../lib/database.js';
import { preflightIndexes } from '../lib/database-preflight.js';
import type { IndexRequirement } from '../lib/database-preflight.js';
import type { MessagingRevocationPort, MessagingRevocationTarget } from './ports.js';

export const textSendLedgerIndex = {
  collection: 'textSendIntents',
  name: 'uq_text_send_conversation',
  key: { conversationId: 1 },
  unique: true,
} satisfies IndexRequirement;

export type TextSendScope = {
  workspaceId: string;
  channelId: string;
  authSessionId: string;
};

type Intent = TextSendScope & {
  _id: number;
  reservationId: Types.ObjectId;
  processId: Types.ObjectId;
  generation: number;
  conversationId: Types.ObjectId;
  userId: string;
  clientMessageId: string;
  fingerprint: string;
};

export class TextSendLedgerError extends Error {
  constructor(readonly code: 'SERVER_BUSY' | 'CONFLICT' | 'DEPENDENCY_UNAVAILABLE') {
    super(code);
  }
}

export function createTextSendLedger(database: Database, maxPending: number) {
  if (!Number.isSafeInteger(maxPending) || maxPending <= 0)
    throw new TypeError('Invalid TEXT capacity');
  const processId = new Types.ObjectId();
  const owned = new Set<string>();
  let generation = 0;
  let ready = false;
  let startup: Promise<void> | undefined;

  function collection() {
    const db = database.connection.db;
    if (!db || !database.isConnected()) throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
    return db.collection<Intent>(textSendLedgerIndex.collection);
  }
  const match = ({ _id, reservationId }: Intent) => ({ _id, reservationId });
  async function fence(intent: Intent, remaining: DatabaseDeadline) {
    const options = databaseQueryOptions(remaining);
    // Take a write lock on the same document as the send transaction. A read
    // that finds no message would not prevent a late commit.
    const result = await collection().deleteOne(match(intent), {
      ...options,
      writeConcern: { w: 'majority', wtimeoutMS: options.maxTimeMS },
    });
    if (!result.deletedCount && (await read(match(intent), remaining).next()))
      throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
  }
  function read(filter: mongo.Filter<Intent>, remaining: DatabaseDeadline) {
    return collection().find(filter, {
      ...databaseQueryOptions(remaining),
      readPreference: 'primary',
      readConcern: { level: 'majority' },
    });
  }
  function targetFilter(target: Exclude<MessagingRevocationTarget, { kind: 'RUNTIME' }>) {
    switch (target.kind) {
      case 'AUTH_SESSION':
        return { userId: target.userId, authSessionId: target.authSessionId };
      case 'USER':
        return { userId: target.userId };
      case 'WORKSPACE':
        return { workspaceId: target.workspaceId, ...(target.userId && { userId: target.userId }) };
      case 'CHANNEL':
        return {
          workspaceId: target.workspaceId,
          channelId: target.channelId,
          ...(target.userId && { userId: target.userId }),
        };
    }
  }
  async function start(remaining: DatabaseDeadline) {
    if (!(await preflightIndexes(database.connection, [textSendLedgerIndex])).ready)
      throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
    const stale = await read({}, remaining)
      .limit(maxPending + 1)
      .toArray();
    if (stale.length > maxPending) throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
    for (const intent of stale) await fence(intent, remaining);
    remaining();
    ready = true;
  }
  async function allocate(
    identity: Omit<Intent, '_id'>,
    remaining: DatabaseDeadline,
    canFence: boolean,
  ): Promise<Intent> {
    for (let slot = 0; slot < maxPending; slot++) {
      const intent = { ...identity, _id: slot };
      const options = databaseQueryOptions(remaining);
      try {
        await collection().insertOne(intent, {
          ...options,
          writeConcern: { w: 'majority', wtimeoutMS: options.maxTimeMS },
        });
        return intent;
      } catch (error) {
        if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) throw error;
        const current = await read({ conversationId: identity.conversationId }, remaining).next();
        if (!current) continue;
        if (
          current.userId !== identity.userId ||
          current.clientMessageId !== identity.clientMessageId
        )
          throw new TextSendLedgerError('SERVER_BUSY');
        if (current.fingerprint !== identity.fingerprint) throw new TextSendLedgerError('CONFLICT');
        // The old local writer has stopped. Fence it in Mongo before admitting
        // a new transaction. A server-side lock or uncertain fence leaves it pending.
        if (
          canFence &&
          current.processId.equals(processId) &&
          !owned.has(current.reservationId.toString())
        ) {
          await fence(current, remaining);
          return allocate(identity, remaining, false);
        }
        throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
      }
    }
    throw new TextSendLedgerError('SERVER_BUSY');
  }
  return {
    // Cold startup, before accepting new TEXT writes in the single app process.
    async start(remaining: DatabaseDeadline) {
      if (ready) return;
      startup ??= start(remaining).finally(() => {
        startup = undefined;
      });
      await startup;
    },
    async claim(
      scope: TextSendScope & {
        conversationId: Types.ObjectId;
        userId: string;
        clientMessageId: string;
      },
      text: string,
      remaining: DatabaseDeadline,
    ): Promise<Intent> {
      if (!ready) throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
      if (generation >= Number.MAX_SAFE_INTEGER)
        throw new TextSendLedgerError('DEPENDENCY_UNAVAILABLE');
      // Capture the resource generation synchronously under the caller's ACL gate.
      const identity = {
        ...scope,
        processId,
        generation: ++generation,
        reservationId: new Types.ObjectId(),
        fingerprint: createHash('sha256').update(text).digest('hex'),
      };
      const key = identity.reservationId.toString();
      owned.add(key);
      try {
        return await allocate(identity, remaining, true);
      } catch (error) {
        owned.delete(key);
        throw error;
      }
    },
    release(intent: Intent) {
      owned.delete(intent.reservationId.toString());
    },
    async consume(intent: Intent, session: ClientSession, remaining: DatabaseDeadline) {
      // This mutation must commit atomically with sequence and message. Holding
      // the old identity in memory cannot authorize a write after its fence.
      const result = await collection().deleteOne(match(intent), {
        session,
        ...databaseQueryOptions(remaining),
      });
      return result.deletedCount === 1;
    },
    fence,
    bindRevocation(sync: MessagingRevocationPort): MessagingRevocationPort {
      const watermarks = new Map<string, number>();
      return {
        fence(input) {
          const watermark = sync.fence(input);
          if (!watermarks.has(input.revocationId)) watermarks.set(input.revocationId, generation);
          return watermark;
        },
        async revoke(input) {
          const reply = await sync.revoke(input);
          if (reply.status !== 'completed' || input.target.kind === 'RUNTIME') return reply;
          const through = watermarks.get(input.revocationId);
          const blocked = {
            status: 'blocked',
            revocationId: input.revocationId,
            retryRequired: true,
          } as const;
          if (through === undefined || !ready) return blocked;
          const remaining = () => {
            const ms = Math.floor(input.deadlineMs - performance.now());
            if (ms < 1 || input.signal.aborted) throw new DatabaseDeadlineError();
            return ms;
          };
          try {
            const intents = await read(
              {
                ...targetFilter(input.target),
                processId,
                generation: { $lte: through },
              },
              remaining,
            )
              .limit(maxPending + 1)
              .toArray();
            if (intents.length > maxPending) return blocked;
            for (const intent of intents) await fence(intent, remaining);
            remaining();
            return reply;
          } catch {
            return blocked;
          }
        },
      };
    },
  };
}

export type TextSendLedger = ReturnType<typeof createTextSendLedger>;
