import { createServer } from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { createProfiledDatabase, scrum42Trial } from './scrum42-db-profile.js';

it.runIf(scrum42Trial)(
  'measures server selection when a loopback seed cannot complete the Mongo handshake',
  async () => {
    const sockets = new Set<import('node:net').Socket>();
    const seed = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    seed.listen(0, '127.0.0.1');
    await once(seed, 'listening');
    const address = seed.address();
    if (!address || typeof address === 'string') throw new Error('Missing seed port');
    const db = createProfiledDatabase(
      'mongodb://127.0.0.1:' +
        address.port +
        '/colearnia_test_scrum42_selection?directConnection=true',
    );
    const started = performance.now();
    try {
      await expect(db.connect()).rejects.toMatchObject({ name: 'MongooseServerSelectionError' });
      expect(db.isConnected()).toBe(false);
      console.info('SCRUM42_SELECTION after %d ms', Math.round(performance.now() - started));
    } finally {
      await db.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => seed.close(() => done()));
    }
  },
);
