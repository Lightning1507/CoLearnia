// Disposable browser-test server. No .env is loaded, no shared DB is selected.
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createDatabase } from '../src/lib/database.js';
import { authIndexRequirements } from '../src/auth/models.js';
import { workspaceCreationIndexRequirements } from '../src/workspaces/create-workspace.js';
import { sessionIndexRequirements } from '../src/live/session-manager/session-models.js';
import { textMessageIndexes, textSyncIndexes } from '../src/messaging/text-message.js';

const port = Number(process.env.COLEARNIA_DB_TEST_PORT ?? 27193);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 27017)
  throw new Error('Use a separate disposable Mongo test port');
const retainedDatabase = process.env.COLEARNIA_MAIN_UI_TEST_DB;
const createNamedDatabase = process.env.COLEARNIA_MAIN_UI_TEST_CREATE === 'true';
if (retainedDatabase && !/^colearnia_test_main_ui_[a-f\d]{32}$/.test(retainedDatabase))
  throw new Error('Only a named disposable MAIN UI database can be reused');
const name = retainedDatabase ?? `colearnia_test_main_ui_${randomUUID().replaceAll('-', '')}`;
const uri = `mongodb://127.0.0.1:${port}/${name}?replicaSet=rs0&directConnection=true`;
const database = createDatabase(uri);
await database.connect();
const db = database.connection.db!;
const existingCollections = await db.listCollections().toArray();
if (retainedDatabase && !existingCollections.length && !createNamedDatabase)
  throw new Error(
    'Test database is missing. Set COLEARNIA_MAIN_UI_TEST_CREATE=true to create this named test database explicitly.',
  );
if (!retainedDatabase && existingCollections.length > 0)
  throw new Error('Expected a new empty test DB');
if (!existingCollections.length) {
  for (const collection of [
    'users',
    'authSessions',
    'workspaces',
    'memberships',
    'channels',
    'conversations',
    'auditEvents',
  ])
    await db.createCollection(collection);
  const requirements = [
    ...authIndexRequirements,
    ...workspaceCreationIndexRequirements,
    ...sessionIndexRequirements,
    ...textMessageIndexes,
    ...textSyncIndexes,
  ];
  for (const { collection, key, ...options } of requirements) {
    if (!(await db.listCollections({ name: collection }).toArray()).length)
      await db.createCollection(collection);
    await db.collection(collection).createIndex(key, options);
  }
}
const child = spawn(
  process.execPath,
  ['--import', 'tsx', resolve(import.meta.dirname, '../src/main.ts')],
  {
    cwd: resolve(import.meta.dirname, '..'),
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '3193',
      APP_ORIGIN: 'http://localhost:5193',
      MONGO_URI: uri,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      MEDIA_ENABLED: 'true',
      MEDIA_LOCAL_DIRECT: 'true',
      MEDIA_LISTEN_IP: '127.0.0.1',
      MEDIA_ANNOUNCED_ADDRESS: '127.0.0.1',
      MEDIA_PORT: '4193',
      AUTH_TRUST_PROXY: 'false',
      TEXT_SYNC_LIMITS_JSON: JSON.stringify({
        subscriptions: 32,
        perUser: 4,
        leaseMs: 60000,
        revocationRecords: 128,
      }),
      MESSAGING_BUDGET_JSON: '',
      TURN_KEY_ID: '',
      TURN_KEY_API_TOKEN: '',
    },
  },
);
console.log(
  `Disposable MAIN UI server: http://127.0.0.1:3193; web origin http://localhost:5193; Mongo test port ${port}`,
);
if (retainedDatabase) console.log(`Retained test database: ${name}; kept when the server stops.`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill('SIGTERM');
  await new Promise<void>((done) => {
    if (child.exitCode !== null) done();
    else {
      child.once('exit', () => done());
      setTimeout(done, 12000).unref();
    }
  });
  if (database.connection.name !== name || !name.startsWith('colearnia_test_main_ui_'))
    throw new Error('Unexpected database identity');
  if (!retainedDatabase) await db.dropDatabase();
  await database.close();
}
process.once('SIGINT', () => {
  void close().finally(() => process.exit());
});
process.once('SIGTERM', () => {
  void close().finally(() => process.exit());
});
child.once('exit', () => {
  void close();
});
