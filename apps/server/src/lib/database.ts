import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

export type DatabaseOptions = {
  maxPoolSize: number;
  serverSelectionTimeoutMS: number;
  waitQueueTimeoutMS: number;
  socketTimeoutMS: number;
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

async function commitTransaction(session: ClientSession): Promise<void> {
  try {
    await session.commitTransaction();
  } catch (error) {
    if (!hasLabel(error, 'UnknownTransactionCommitResult')) throw error;
    try {
      await session.commitTransaction();
    } catch {
      // A failed retry cannot establish that the first commit rolled back.
      throw error;
    }
  }
}

export class DatabaseBusyError extends Error {
  constructor() {
    super('Database transaction capacity exhausted');
    this.name = 'DatabaseBusyError';
  }
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
        connectTimeoutMS: 5000,
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
    async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
      if (connection.readyState !== 1) throw new Error('Database is not connected');
      // No hidden transaction queue. Workspace/User coordination remains caller-owned.
      if (activeTransactions >= limits.maxPoolSize) throw new DatabaseBusyError();
      activeTransactions += 1;
      try {
        const session = await connection.startSession();
        try {
          for (let attempt = 1; ; attempt += 1) {
            session.startTransaction({
              readPreference: 'primary',
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority', wtimeoutMS: commitTimeoutMS },
              maxCommitTimeMS: commitTimeoutMS,
            });
            try {
              const result = await work(session);
              await commitTransaction(session);
              return result;
            } catch (error) {
              if (
                attempt >= maxTransactionAttempts ||
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
