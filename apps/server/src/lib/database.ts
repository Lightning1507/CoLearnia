import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

export type DatabaseOptions = {
  maxPoolSize: number;
  serverSelectionTimeoutMS: number;
  waitQueueTimeoutMS: number;
  socketTimeoutMS: number;
  connectTimeoutMS?: number;
  maxAdaptiveRetries?: number;
  monitorCommands?: boolean;
  deadlineTransactionAttempts?: 1 | 2;
};

export const defaultDatabaseOptions: Readonly<DatabaseOptions> = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  waitQueueTimeoutMS: 5000,
  socketTimeoutMS: 15_000,
};

const maxTransactionAttempts = 2;
const commitTimeoutMS = 5000;

function hasLabel(error: unknown, label: string): boolean {
  return error instanceof mongoose.mongo.MongoError && error.hasErrorLabel(label);
}

// The driver can exhaust its retry budget before attaching the commit label.
function markAmbiguousCommit(error: unknown) {
  if (
    error instanceof mongoose.mongo.MongoNetworkError ||
    error instanceof mongoose.mongo.MongoWriteConcernError
  ) {
    error.addErrorLabel('UnknownTransactionCommitResult');
  }
}

async function commitTransaction(session: ClientSession): Promise<void> {
  try {
    await session.commitTransaction();
  } catch (error) {
    markAmbiguousCommit(error);
    if (!hasLabel(error, 'UnknownTransactionCommitResult')) throw error;
    try {
      await session.commitTransaction();
    } catch {
      // A failed retry cannot establish that the first commit rolled back.
      throw error;
    }
  }
}

export class DatabaseDeadlineError extends Error {}
export type DatabaseDeadline = () => number;

export function databaseQueryOptions(remaining: DatabaseDeadline) {
  const maxTimeMS = remaining();
  const controller = new AbortController();
  const signal = AbortSignal.timeout(maxTimeMS);
  signal.addEventListener('abort', () => controller.abort(new DatabaseDeadlineError()), {
    once: true,
  });
  return { maxTimeMS, signal: controller.signal };
}

export class DatabaseBusyError extends Error {
  constructor() {
    super('Database transaction capacity exhausted');
    this.name = 'DatabaseBusyError';
  }
}

const unavailableMongoCodes = new Set([
  6, 7, 50, 64, 89, 91, 189, 262, 9001, 10107, 11600, 11602, 13435, 13436,
]);

export function isDatabaseUnavailableError(error: unknown): boolean {
  return (
    error instanceof DatabaseBusyError ||
    error instanceof DatabaseDeadlineError ||
    error instanceof mongoose.mongo.MongoNetworkError ||
    error instanceof mongoose.mongo.MongoServerSelectionError ||
    (error instanceof mongoose.mongo.MongoServerError &&
      (error.codeName === 'SnapshotTooOld' || error.codeName === 'SnapshotUnavailable')) ||
    (error instanceof mongoose.mongo.MongoError &&
      (error.name === 'MongoWaitQueueTimeoutError' ||
        error.hasErrorLabel('TransientTransactionError') ||
        (typeof error.code === 'number' && unavailableMongoCodes.has(error.code))))
  );
}

// One instance at bootstrap; inject its connection into every model/provider.
export function createDatabase(uri: string, options: DatabaseOptions = defaultDatabaseOptions) {
  const queryStart = uri.indexOf('?');
  const query = new URLSearchParams(queryStart === -1 ? '' : uri.slice(queryStart + 1));
  if ([...query.keys()].some((key) => key.toLowerCase() === 'timeoutms')) {
    throw new Error('Remove timeoutMS from MONGO_URI');
  }
  const limits = { ...options };
  for (const value of [
    limits.maxPoolSize,
    limits.serverSelectionTimeoutMS,
    limits.waitQueueTimeoutMS,
    limits.socketTimeoutMS,
    limits.connectTimeoutMS ?? 5000,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid database limits');
  }
  // Isolate defaults from the global mongoose instance, before any model can be registered.
  // The new instance's default connection stays disconnected; only this connection opens a pool.
  const instance = new mongoose.Mongoose({
    bufferCommands: false,
    autoCreate: false,
    autoIndex: false,
  });
  const connection = instance.createConnection();
  let activeTransactions = 0;

  return {
    connection,
    async connect() {
      await connection.openUri(uri, {
        connectTimeoutMS: limits.connectTimeoutMS ?? 5000,
        ...(limits.maxAdaptiveRetries === undefined
          ? {}
          : { maxAdaptiveRetries: limits.maxAdaptiveRetries }),
        ...(limits.monitorCommands === undefined
          ? {}
          : { monitorCommands: limits.monitorCommands }),
        maxPoolSize: limits.maxPoolSize,
        minPoolSize: 0,
        serverSelectionTimeoutMS: limits.serverSelectionTimeoutMS,
        waitQueueTimeoutMS: limits.waitQueueTimeoutMS,
        socketTimeoutMS: limits.socketTimeoutMS,
        bufferCommands: false,
        autoCreate: false,
        autoIndex: false,
      });
    },
    isConnected: () => connection.readyState === 1,
    // Snapshot reads need a stable read timestamp, not a commit acknowledgement.
    // Share admission and pool with transactions; no write callback uses this path.
    async snapshotRead<T>(
      work: (session: ClientSession, beforeQuery: DatabaseDeadline) => Promise<T>,
      remaining: DatabaseDeadline,
    ): Promise<T> {
      if (connection.readyState !== 1) throw new Error('Database is not connected');
      if (activeTransactions >= limits.maxPoolSize) throw new DatabaseBusyError();
      activeTransactions += 1;
      try {
        const session = await connection.startSession({ snapshot: true });
        try {
          remaining();
          return await work(session, remaining);
        } finally {
          await session.endSession();
        }
      } finally {
        activeTransactions -= 1;
      }
    },
    async transaction<T>(
      work: (session: ClientSession, beforeQuery?: DatabaseDeadline) => Promise<T>,
      remaining?: DatabaseDeadline,
    ): Promise<T> {
      if (connection.readyState !== 1) throw new Error('Database is not connected');
      // No hidden transaction queue. Workspace/User coordination remains caller-owned.
      if (activeTransactions >= limits.maxPoolSize) throw new DatabaseBusyError();
      activeTransactions += 1;
      try {
        const session = await connection.startSession();
        try {
          for (let attempt = 1; ; attempt += 1) {
            // Reserve a bounded commit window before issuing any transaction command.
            // The driver fixes maxCommitTimeMS when the transaction starts.
            const commitBudget = remaining
              ? Math.max(1, Math.floor(remaining() / 4))
              : commitTimeoutMS;
            const beforeQuery =
              remaining &&
              (() => {
                const budget = remaining() - commitBudget;
                if (budget < 1) throw new DatabaseDeadlineError();
                return budget;
              });
            session.startTransaction({
              readPreference: 'primary',
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority', wtimeoutMS: commitBudget },
              maxCommitTimeMS: commitBudget,
            });
            try {
              const result = await work(session, beforeQuery);
              if (remaining) {
                if (remaining() < commitBudget) throw new DatabaseDeadlineError();
                // Let the driver classify ambiguous commits. Avoid another application retry
                // after the reserved window. The client can retry the same message key.
                try {
                  await session.commitTransaction();
                } catch (error) {
                  markAmbiguousCommit(error);
                  throw error;
                }
              } else {
                await commitTransaction(session);
              }
              return result;
            } catch (error) {
              if (
                attempt >=
                  (remaining
                    ? (limits.deadlineTransactionAttempts ?? maxTransactionAttempts)
                    : maxTransactionAttempts) ||
                hasLabel(error, 'UnknownTransactionCommitResult') ||
                !hasLabel(error, 'TransientTransactionError')
              ) {
                throw error;
              }
              if (session.inTransaction()) {
                await session.abortTransaction();
              }
            }
          }
        } finally {
          // The driver aborts any active transaction when ending the session.
          await session.endSession();
        }
      } finally {
        activeTransactions -= 1;
      }
    },
    async close() {
      await connection.close();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>;
