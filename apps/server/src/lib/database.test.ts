import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, DatabaseBusyError, defaultDatabaseOptions } from './database.js';
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
      ...defaultDatabaseOptions,
      maxPoolSize: 1,
    });
    vi.spyOn(database.connection, 'readyState', 'get').mockReturnValue(1);
    const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27017');
    const startSession = vi
      .spyOn(database.connection, 'startSession')
      .mockImplementation(async () => client.startSession());
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = database.transaction(async () => {
      await blocked;
      throw new Error('failure');
    });
    try {
      await expect(database.transaction(async () => 'overflow')).rejects.toBeInstanceOf(
        DatabaseBusyError,
      );
      expect(startSession).toHaveBeenCalledTimes(1);
      release();
      await expect(first).rejects.toThrow('failure');
      await expect(database.transaction(async () => 'next')).resolves.toBe('next');
    } finally {
      release();
      vi.restoreAllMocks();
      await database.close();
      await client.close();
    }
  });

  it.each([true, false])(
    'retries only commit after an unknown result (success: %s)',
    async (success) => {
      const database = createDatabase('mongodb://127.0.0.1:27017/unused');
      vi.spyOn(database.connection, 'readyState', 'get').mockReturnValue(1);
      const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27017');
      const session = client.startSession();
      vi.spyOn(database.connection, 'startSession').mockResolvedValue(session);
      const error = new mongoose.mongo.MongoServerError({ message: 'commit outcome unknown' });
      error.addErrorLabel('UnknownTransactionCommitResult');
      const transient = new mongoose.mongo.MongoServerError({ message: 'commit retry failed' });
      transient.addErrorLabel('TransientTransactionError');
      const commit = vi.spyOn(session, 'commitTransaction').mockRejectedValueOnce(error);
      if (success) commit.mockResolvedValueOnce();
      else commit.mockRejectedValueOnce(transient);
      const work = vi.fn(async () => 'value');
      try {
        const result = database.transaction(work);
        if (success) await expect(result).resolves.toBe('value');
        else await expect(result).rejects.toBe(error);
        expect(work).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledTimes(2);
        expect(session.hasEnded).toBe(true);
      } finally {
        vi.restoreAllMocks();
        await database.close();
        await client.close();
      }
    },
  );

  it.each(['timeoutMS=100', 'TIMEOUTMS=0', 'timeout%4dS=100'])(
    'rejects CSOT from MONGO_URI (%s)',
    (option) => {
      expect(() =>
        createDatabase(`mongodb://127.0.0.1:27017/unused?replicaSet=rs0&${option}`),
      ).toThrow('Remove timeoutMS from MONGO_URI');
    },
  );

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
    'MONGO_WAIT_QUEUE_TIMEOUT_MS',
    'MONGO_SOCKET_TIMEOUT_MS',
  ])('rejects unbounded or invalid %s', (name) => {
    for (const value of ['0', '-1', '1.5', 'Infinity', 'invalid']) {
      expect(() => loadConfig({ [name]: value })).toThrow();
    }
  });
});
