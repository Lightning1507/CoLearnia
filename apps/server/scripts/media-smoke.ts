import { createWorker } from 'mediasoup';
import { mediaCodecs } from '../src/live/media/runtime.js';

const worker = await createWorker({ logLevel: 'warn' });
try {
  const router = await worker.createRouter({ mediaCodecs });
  if ((router.rtpCapabilities.codecs?.length ?? 0) < 2)
    throw new Error('Missing baseline audio/video codecs');
  console.log('PASS: native mediasoup worker and Router started with Opus/VP8.');
  console.log('This smoke test does not prove browser calls, group isolation or TURN.');
  router.close();
} finally {
  worker.close();
}
