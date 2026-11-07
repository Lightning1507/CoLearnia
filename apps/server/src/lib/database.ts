import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

export type DatabaseOptions = {
  maxPoolSize: number;
  serverSelectionTimeoutMS: number;
  operationTimeoutMS: number;
};

export const defaultDatabaseOptions: Readonly<DatabaseOptions> = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  operationTimeoutMS: 15_000,
};

export class DatabaseBusyError extends Error {
  constructor() {
    super('Database transaction capacity exhausted');
    this.name = 'DatabaseBusyError';
  }
}

// One instance at bootstrap; inject its connection into every model/provider.
export function createDatabase(uri: string, options: DatabaseOptions = defaultDatabaseOptions) {
  const limits = { ...options };
  for (const value of [
    limits.maxPoolSize,
    limits.serverSelectionTimeoutMS,
    limits.operationTimeoutMS,
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
        timeoutMS: limits.operationTimeoutMS,
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
      // Driver inherits timeoutMS for the whole withTransaction retry cycle.
      // Always await sequential DB operations and pass session explicitly.
      // Preserve errors/labels: unknown commit is NOT proof of rollback.
      try {
        return await connection.transaction(work, {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        });
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
