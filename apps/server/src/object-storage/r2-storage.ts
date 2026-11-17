import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { loadR2Config } from './r2-config.js';

type R2Config = ReturnType<typeof loadR2Config>;

export class ObjectStorageError extends Error {
  constructor(readonly code: 'ABORTED' | 'TIMEOUT' | 'NOT_FOUND' | 'UNAVAILABLE') {
    super('Private object storage: ' + code);
  }
}

export function createR2Storage(config: R2Config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: config.credentials,
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  async function run<T>(
    caller: AbortSignal | undefined,
    action: (signal: AbortSignal) => Promise<T>,
  ) {
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;
    try {
      signal.throwIfAborted();
      return await action(signal);
    } catch (error) {
      if (signal.aborted) {
        throw new ObjectStorageError(signal.reason === timeout.reason ? 'TIMEOUT' : 'ABORTED');
      }
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new ObjectStorageError('NOT_FOUND');
      }
      throw new ObjectStorageError('UNAVAILABLE');
    }
  }

  return {
    async put(
      key: string,
      body: Uint8Array | Readable,
      contentLength: number,
      caller?: AbortSignal,
    ) {
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        (body instanceof Uint8Array && body.byteLength !== contentLength)
      ) {
        throw new TypeError('Object upload requires a valid content length');
      }
      try {
        await run(caller, async (signal) => {
          await client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: key,
              Body: body,
              ContentLength: contentLength,
            }),
            { abortSignal: signal },
          );
        });
      } finally {
        // The adapter owns the upload source for the duration of this call.
        if (body instanceof Readable) body.destroy();
      }
    },
    async readTo(key: string, destination: Writable, caller?: AbortSignal) {
      try {
        await run(caller, async (signal) => {
          const { Body } = await client.send(
            new GetObjectCommand({ Bucket: config.bucket, Key: key }),
            { abortSignal: signal },
          );
          if (!(Body instanceof Readable)) throw new Error('Expected a Node readable stream');
          await pipeline(Body, destination, { signal });
        });
      } finally {
        destination.destroy();
      }
    },
    async delete(key: string, caller?: AbortSignal) {
      await run(caller, async (signal) => {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), {
          abortSignal: signal,
        });
      });
    },
    close() {
      client.destroy();
    },
  };
}
