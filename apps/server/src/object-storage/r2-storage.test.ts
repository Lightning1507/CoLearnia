import { once } from 'node:events';
import { createServer } from 'node:http';
import { PassThrough, Readable, Writable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadR2Config } from './r2-config.js';
import { createR2Storage } from './r2-storage.js';

let endpoint: string;
let stored: Buffer | undefined;
const server = createServer(async (request, response) => {
  const path = request.url?.split('?')[0];
  if (path === '/test-bucket/slow-upload') {
    request.on('error', () => undefined);
    request.resume();
    return;
  }
  if (path === '/test-bucket/slow') {
    response.writeHead(200);
    response.write('first chunk');
    return;
  }
  if (path !== '/test-bucket/probe' || !request.headers.authorization) {
    response.writeHead(403).end();
    return;
  }
  if (request.method === 'PUT') {
    stored = await buffer(request);
    response.writeHead(200).end();
  } else if (request.method === 'DELETE') {
    stored = undefined;
    response.writeHead(204).end();
  } else if (stored) {
    response.writeHead(200).end(stored);
  } else {
    response
      .writeHead(404, { 'Content-Type': 'application/xml' })
      .end('<Error><Code>NoSuchKey</Code></Error>');
  }
});

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture address');
  endpoint = 'http://127.0.0.1:' + address.port;
});

afterAll(async () => {
  const stopped = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await stopped;
});

function fixture(timeoutMs = 1000) {
  return createR2Storage({
    endpoint,
    bucket: 'test-bucket',
    credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
    timeoutMs,
  });
}

it('uses a private R2 endpoint and reports invalid settings without credential values', () => {
  const account = 'a'.repeat(32);
  const input = {
    R2_ACCOUNT_ID: account,
    R2_BUCKET: 'test-bucket',
    R2_ACCESS_KEY_ID: 'fixture',
    R2_SECRET_ACCESS_KEY: 'fixture-secret',
  };
  expect(loadR2Config(input)).toMatchObject({
    endpoint: 'https://' + account + '.r2.cloudflarestorage.com',
    timeoutMs: 15_000,
  });
  expect(() => loadR2Config({ ...input, R2_BUCKET: 'https://example.com' })).toThrow(
    /^Missing or invalid R2 configuration: R2_BUCKET$/,
  );
});

it('uploads a stream, reads the same bytes, and deletes the object using signed requests', async () => {
  const storage = fixture();
  const contents = Buffer.from('fixture object');
  const chunks: Buffer[] = [];
  try {
    await storage.put('probe', Readable.from([contents]), contents.byteLength);
    expect((await fetch(endpoint + '/test-bucket/probe')).status).toBe(403);
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk);
        done();
      },
    });
    await storage.readTo('probe', destination);
    expect(Buffer.concat(chunks)).toEqual(contents);
    await storage.delete('probe');
    await expect(storage.readTo('probe', new Writable())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  } finally {
    storage.close();
  }
});

it('times out a stalled response body and tears down the destination', async () => {
  const storage = fixture(250);
  let received = false;
  const destination = new Writable({
    write(_chunk, _encoding, done) {
      received = true;
      done();
    },
  });
  try {
    await expect(storage.readTo('slow', destination)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(received).toBe(true);
    expect(destination.destroyed).toBe(true);
  } finally {
    storage.close();
  }
});

it('cancels an active download without waiting for the timeout', async () => {
  const storage = fixture();
  const controller = new AbortController();
  const destination = new Writable({
    write(_chunk, _encoding, done) {
      controller.abort();
      done();
    },
  });
  try {
    await expect(storage.readTo('slow', destination, controller.signal)).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(destination.destroyed).toBe(true);
  } finally {
    storage.close();
  }
});

it('times out a stalled upload and destroys its source', async () => {
  const storage = fixture(250);
  const source = new PassThrough();
  source.write('first chunk');
  try {
    await expect(storage.put('slow-upload', source, 1024)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(source.destroyed).toBe(true);
  } finally {
    storage.close();
  }
});
