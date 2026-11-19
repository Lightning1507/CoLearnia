import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { loadR2Config } from '../src/object-storage/r2-config.js';
import { createR2Storage, ObjectStorageError } from '../src/object-storage/r2-storage.js';

async function smoke() {
  const config = loadR2Config();
  const storage = createR2Storage(config);
  const key = 'scrum-52-smoke/' + randomUUID();
  const contents = Buffer.from('CoLearnia SCRUM-52 disposable object');
  const chunks: Buffer[] = [];

  try {
    let probeFailure: unknown;
    try {
      await storage.put(key, Readable.from([contents]), contents.byteLength);
      await storage.readTo(
        key,
        new Writable({
          write(chunk: Buffer, _encoding, done) {
            chunks.push(chunk);
            done();
          },
        }),
      );
      assert.deepEqual(Buffer.concat(chunks), contents);

      const anonymous = await fetch(config.endpoint + '/' + config.bucket + '/' + key, {
        method: 'HEAD',
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      assert.ok(
        [401, 403].includes(anonymous.status),
        'Anonymous access was not explicitly denied',
      );
    } catch (error) {
      probeFailure = error;
    }
    try {
      await storage.delete(key);
    } catch {
      throw new Error('R2 smoke cleanup failed for disposable key ' + key);
    }
    if (probeFailure) throw probeFailure;

    await assert.rejects(
      storage.readTo(
        key,
        new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        }),
      ),
      (error) => error instanceof ObjectStorageError && error.code === 'NOT_FOUND',
    );
    console.info('PASS: signed R2 upload, byte-for-byte read, anonymous denial, and delete.');
  } finally {
    storage.close();
  }
}

try {
  await smoke();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'R2 smoke failed');
  process.exitCode = 1;
}
