import { createDatabase, defaultDatabaseOptions } from '../src/lib/database.js';

export const scrum42Trial = process.env.COLEARNIA_TEST_DB_PROFILE === 'scrum42';

// Test-only opt-in. Main bootstrap does not read this switch or use these options.
export function createProfiledDatabase(uri: string, maxPoolSize = 10) {
  return createDatabase(
    uri,
    scrum42Trial
      ? {
          ...defaultDatabaseOptions,
          maxPoolSize,
          serverSelectionTimeoutMS: 200,
          waitQueueTimeoutMS: 150,
          connectTimeoutMS: 250,
          socketTimeoutMS: 400,
          maxAdaptiveRetries: 0,
          deadlineTransactionAttempts: 1,
          monitorCommands: true,
        }
      : defaultDatabaseOptions,
  );
}
