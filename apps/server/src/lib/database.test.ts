import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, DatabaseBusyError } from './database.js';
import { loadConfig } from '../config/env.js';

describe('database admission and configuration', () => {
  it('rejects a model query before connect instead of buffering it', async () => {
    const database = createDatabase('mongodb://127.0.0.1:27017/unused');
    const model = database.connection.model('BeforeConnect', new mongoose.Schema({ name: String }));
    try {
      await expect(model.findOne().exec()).rejects.toThrow(/bufferCommands = false/);
    } finally {
      await database.close();
    }
  });

  it('rejects overload immediately and releases admission after failure', async () => {
    const database = createDatabase('mongodb://127.0.0.1:27017/unused', {
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      operationTimeoutMS: 15_000,
    });
    vi.spyOn(database.connection, 'readyState', 'get').mockReturnValue(1);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = vi
      .spyOn(database.connection, 'transaction')
      .mockImplementationOnce(async () => {
        await blocked;
        throw new Error('failure');
      })
      .mockResolvedValue('next');
    const first = database.transaction(async () => 'first');
    try {
      await expect(database.transaction(async () => 'overflow')).rejects.toBeInstanceOf(
        DatabaseBusyError,
      );
      expect(transaction).toHaveBeenCalledTimes(1);
      release();
      await expect(first).rejects.toThrow('failure');
      await expect(database.transaction(async () => 'next')).resolves.toBe('next');
    } finally {
      release();
      vi.restoreAllMocks();
      await database.close();
    }
  });

  it('preserves unknown-commit errors for caller reconciliation without an outer retry', async () => {
    const database = createDatabase('mongodb://127.0.0.1:27017/unused');
    vi.spyOn(database.connection, 'readyState', 'get').mockReturnValue(1);
    const error = new mongoose.mongo.MongoServerError({ message: 'commit outcome unknown' });
    error.addErrorLabel('UnknownTransactionCommitResult');
    const transaction = vi.spyOn(database.connection, 'transaction').mockRejectedValue(error);
    try {
      await expect(database.transaction(async () => 'value')).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(error.hasErrorLabel('UnknownTransactionCommitResult')).toBe(true);
    } finally {
      vi.restoreAllMocks();
      await database.close();
    }
  });

  it('rejects work before connection without invoking the callback', async () => {
    const database = createDatabase('mongodb://127.0.0.1:27017/unused');
    let called = false;
    await expect(
      database.transaction(async () => {
        called = true;
      }),
    ).rejects.toThrow('Database is not connected');
    expect(called).toBe(false);
    await database.close();
  });

  it.each([
    'MONGO_MAX_POOL_SIZE',
    'MONGO_SERVER_SELECTION_TIMEOUT_MS',
    'MONGO_OPERATION_TIMEOUT_MS',
  ])('rejects unbounded or invalid %s', (name) => {
    for (const value of ['0', '-1', '1.5', 'Infinity', 'invalid']) {
      expect(() => loadConfig({ [name]: value })).toThrow();
    }
  });
});
