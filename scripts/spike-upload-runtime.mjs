import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { aborted } from 'node:util';
import { setImmediate, setTimeout } from 'node:timers/promises';
import Busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

// SCRUM-39 fixture limits. Production admission and storage are outside this spike.
const maxInputBytes = 10 * 1024 * 1024;
const maxOutputBytes = 2 * 1024 * 1024;
const maxInputPixels = 16_000_000;
const chunkSize = 64 * 1024;
const nativeTimeoutSeconds = 1;
const boundary = 'colearnia-spike';
const header = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
);
const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

async function receiveImage(input, { abortAfterFirstChunk = false } = {}) {
  const controller = new AbortController();
  let received = 0;
  let file;
  let fileError;
  let limited = false;
  const chunks = [];
  const parser = Busboy({
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    limits: { files: 1, fields: 0, parts: 2, fileSize: maxInputBytes + 1 },
  });
  parser.on('filesLimit', () => {
    limited = true;
  });
  parser.on('fieldsLimit', () => {
    limited = true;
  });
  parser.on('partsLimit', () => {
    limited = true;
  });
  parser.on('file', (field, stream) => {
    file = stream;
    if (field !== 'file') limited = true;
    stream.on('limit', () => {
      limited = true;
    });
    stream.on('error', (error) => {
      fileError = error;
    });
    stream.on('data', (chunk) => {
      received += chunk.length;
      if (received <= maxInputBytes) chunks.push(chunk);
    });
  });

  async function* multipart() {
    yield header;
    for (let offset = 0; offset < input.length; offset += chunkSize) {
      yield input.subarray(offset, offset + chunkSize);
      await setImmediate();
      if (abortAfterFirstChunk && received > 0) {
        controller.abort();
        return;
      }
    }
    yield footer;
  }

  const source = Readable.from(multipart());
  try {
    await pipeline(source, parser, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      assert.ok(received > 0 && received < input.length);
      assert.ok(source.destroyed && parser.destroyed && file?.destroyed);
    }
    throw error;
  }
  if (fileError) throw fileError;
  if (!file || limited || file.truncated || received > maxInputBytes) {
    throw new Error('Multipart limit or missing file');
  }
  return Buffer.concat(chunks, received);
}

async function processImage(input, options) {
  const bytes = await receiveImage(input, options);
  const detected = await fileTypeFromBuffer(bytes);
  if (detected?.mime !== 'image/jpeg' && detected?.mime !== 'image/png') {
    throw new Error('Image signature rejected');
  }
  const image = sharp(bytes, { limitInputPixels: maxInputPixels, failOn: 'warning' });
  const { data, info } = await image
    .timeout({ seconds: nativeTimeoutSeconds })
    .rotate()
    .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > maxOutputBytes) throw new Error('Output exceeds image limit');
  return { bytes: data.length, width: info.width, height: info.height };
}

async function measure(name, run) {
  const start = performance.now();
  const baselineRss = process.memoryUsage.rss();
  let peakRss = baselineRss;
  const sample = () => {
    peakRss = Math.max(peakRss, process.memoryUsage.rss());
  };
  const timer = setInterval(sample, 2);
  try {
    const result = await run();
    sample();
    console.log(
      JSON.stringify({
        name,
        elapsedMs: +(performance.now() - start).toFixed(2),
        baselineRssMiB: +(baselineRss / 2 ** 20).toFixed(2),
        peakRssMiB: +(peakRss / 2 ** 20).toFixed(2),
        sampledDeltaMiB: +((peakRss - baselineRss) / 2 ** 20).toFixed(2),
        result,
      }),
    );
  } finally {
    clearInterval(timer);
  }
}

sharp.cache(false);
sharp.concurrency(1);
const dimensions = { width: 2048, height: 1536, channels: 3 };
const pixels = Buffer.alloc(dimensions.width * dimensions.height * dimensions.channels);
let seed = 39;
for (let offset = 0; offset < pixels.length; offset += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  pixels.writeUInt32LE(seed, offset);
}
const jpeg = await sharp(pixels, { raw: dimensions }).jpeg({ quality: 90 }).toBuffer();
const largeImage = await sharp({
  create: { width: 4096, height: 4096, channels: 3, background: 'white' },
})
  .png()
  .toBuffer();
const tooManyBytes = Buffer.alloc(maxInputBytes + 1, 0x61);
const boundaryBytes = tooManyBytes.subarray(0, maxInputBytes);
const fake = Buffer.from('This is text presented as a JPEG in the multipart header.');
const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 2));
assert.equal((await fileTypeFromBuffer(truncated))?.mime, 'image/jpeg');

console.log(
  JSON.stringify({
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    jpegBytes: jpeg.length,
    overPixelImageBytes: largeImage.length,
  }),
);

function checkImage(result) {
  assert.equal(result.width, 1440);
  assert.equal(result.height, 1080);
  assert.ok(result.bytes > 0 && result.bytes <= maxOutputBytes);
  return result;
}

for (let sample = 1; sample <= 5; sample++) {
  await measure(`valid-image-${sample}`, async () => checkImage(await processImage(jpeg)));
}
await measure('two-concurrent-images', async () =>
  (await Promise.all([processImage(jpeg), processImage(jpeg)])).map(checkImage),
);
await measure('exact-byte-limit', async () => {
  assert.equal((await receiveImage(boundaryBytes)).length, maxInputBytes);
  return 'accepted by multipart parser';
});
for (const [name, bytes, expected, options] of [
  ['fake-jpeg', fake, /Image signature rejected/],
  ['truncated-jpeg', truncated, /premature end|truncat|corrupt/i],
  ['over-byte-limit-by-one', tooManyBytes, /Multipart limit/],
  ['over-pixel-limit', largeImage, /pixel limit/i],
  ['abort-mid-stream', jpeg, { name: 'AbortError' }, { abortAfterFirstChunk: true }],
]) {
  await measure(name, async () => {
    await assert.rejects(processImage(bytes, options), expected);
    return { outcome: 'rejected', inputBytes: bytes.length };
  });
}

await measure('native-timeout-after-request-abort', async () => {
  const started = performance.now();
  const elapsedMs = () => +(performance.now() - started).toFixed(2);
  const controller = new AbortController();
  // A deliberately costly filter makes the native timeout observable on this fixture.
  const image = sharp(jpeg, { limitInputPixels: maxInputPixels })
    .median(51)
    .timeout({ seconds: nativeTimeoutSeconds })
    .jpeg();
  const native = image.toBuffer();
  const request = Promise.race([
    native,
    aborted(controller.signal, image).then(() => controller.signal.throwIfAborted()),
  ]);
  const requestRejected = assert.rejects(request, { name: 'AbortError' }).then(elapsedMs);
  let nativeFinished = false;
  const nativeRejected = assert.rejects(native, /timeout/i).then(() => {
    nativeFinished = true;
    return elapsedMs();
  });
  // Handle either unexpected outcome while waiting to observe native processing.
  const outcomes = Promise.allSettled([requestRejected, nativeRejected]);
  const observationDeadline = started + 5000;
  while (sharp.counters().process === 0 && performance.now() < observationDeadline) {
    await setTimeout(1);
  }
  assert.equal(sharp.counters().process, 1, 'expected the isolated sharp job to be processing');
  const abortAtMs = elapsedMs();
  controller.abort();
  const requestResult = await requestRejected;
  assert.equal(nativeFinished, false, 'native work settled before request rejection');
  assert.equal(sharp.counters().process, 1, 'native work stopped when the request was aborted');
  const nativeResult = await nativeRejected;
  await outcomes;
  assert.ok(nativeResult > requestResult);
  assert.equal(sharp.counters().process, 0);
  return {
    timeoutSeconds: nativeTimeoutSeconds,
    abortAtMs,
    requestRejectedAtMs: requestResult,
    nativeRejectedAtMs: nativeResult,
    nativeProcessingAfterRequestAbort: true,
  };
});
