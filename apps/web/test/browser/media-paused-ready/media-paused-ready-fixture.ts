import {
  mediaConsumerCreateAckSchema,
  mediaConsumerReadyAckSchema,
  mediaProducerCreateAckSchema,
  mediaSourceDescriptorSchema,
  mediaTransportConnectAckSchema,
  mediaTransportCreateAckSchema,
} from '@colearnia/contracts';
import { Device } from 'mediasoup-client';
import type { types as MediaTypes } from 'mediasoup-client';
import { io } from 'socket.io-client';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import { receiveMainAudio } from '../../../src/features/live/runtime/receiveMainAudio';

type CommandContext = {
  sessionId: string;
  epoch: string;
  callGeneration: number;
  expectedPolicyRevision: number;
};
type Ack<T> = { requestId: string } & ({ data: { result: T } } | { error: { code: string } });

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function verifyMedia(video: HTMLVideoElement) {
  const browser = new URLSearchParams(location.search).get('browser');
  if (browser !== 'A' && browser !== 'B') throw new Error('Expected browser A or B');
  const socket = io('http://127.0.0.1:5192', {
    auth: { browser },
    transports: ['websocket'],
    reconnection: false,
  });
  const { context, participantId, routerRtpCapabilities } = await new Promise<{
    context: CommandContext;
    participantId: string;
    routerRtpCapabilities: MediaTypes.RtpCapabilities;
  }>((resolve, reject) => {
    socket.once('fixture.ready', resolve);
    socket.once('connect_error', reject);
  });
  const device = await Device.factory();
  await device.load({ routerRtpCapabilities });

  async function command<T>(event: string, payload: object, parse: (raw: unknown) => Ack<T>) {
    const requestId = crypto.randomUUID();
    const ack = parse(
      await socket.timeout(4000).emitWithAck(event, { ...context, requestId, payload }),
    );
    if (ack.requestId !== requestId) throw new Error(`${event}: requestId mismatch`);
    if ('error' in ack) throw new Error(`${event}: ${ack.error.code}`);
    return ack.data.result;
  }

  async function openTransport(direction: 'SEND' | 'RECV') {
    const { transportId, iceParameters, iceCandidates, dtlsParameters } = await command(
      'media.transport.create',
      { direction },
      mediaTransportCreateAckSchema.parse,
    );
    const options: MediaTypes.TransportOptions = {
      id: transportId,
      iceParameters: iceParameters as MediaTypes.IceParameters,
      iceCandidates: iceCandidates as MediaTypes.IceCandidate[],
      dtlsParameters: dtlsParameters as MediaTypes.DtlsParameters,
    };
    const transport =
      direction === 'SEND'
        ? device.createSendTransport(options)
        : device.createRecvTransport(options);
    transport.on('connect', ({ dtlsParameters: parameters }, callback, errback) => {
      void command(
        'media.transport.connect',
        { transportId, dtlsParameters: parameters },
        mediaTransportConnectAckSchema.parse,
      ).then(callback, errback);
    });
    return transport;
  }

  const send = await openTransport('SEND');
  const recv = await openTransport('RECV');
  const own = new Set<string>();
  send.on('produce', ({ kind, rtpParameters }, callback, errback) => {
    void command(
      'media.producer.create',
      { transportId: send.id, sourceKind: kind === 'audio' ? 'MIC' : 'CAMERA', rtpParameters },
      mediaProducerCreateAckSchema.parse,
    ).then(({ producerId }) => {
      own.add(producerId);
      callback({ id: producerId });
    }, errback);
  });

  const audio = new AudioContext();
  await audio.resume();
  const oscillator = audio.createOscillator();
  oscillator.frequency.value = browser === 'A' ? 440 : 660;
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const painter = canvas.getContext('2d');
  if (!painter) throw new Error('Canvas unavailable');
  let frame = 0;
  const paint = () => {
    painter.fillStyle = frame++ % 2 ? '#126ac9' : '#a25c11';
    painter.fillRect(0, 0, canvas.width, canvas.height);
  };
  paint();
  const paintTimer = window.setInterval(paint, 100);
  const call = new CallControllerOwner();
  const [mic] = destination.stream.getAudioTracks();
  const [camera] = canvas.captureStream(10).getVideoTracks();
  if (!mic || !camera) throw new Error('Missing synthetic media');
  window.addEventListener(
    'pagehide',
    () => {
      call.shutdown();
      window.clearInterval(paintTimer);
      mic.stop();
      camera.stop();
      send.close();
      recv.close();
      socket.close();
      void audio.close();
    },
    { once: true },
  );
  await send.produce({ track: mic });
  await send.produce({ track: camera });

  const stream = new MediaStream();
  video.srcObject = stream;
  const end = performance.now() + 16_000;
  let peers: ReturnType<typeof mediaSourceDescriptorSchema.parse>[] = [];
  while (peers.length < 2 && performance.now() < end) {
    const raw: unknown = await socket.timeout(3000).emitWithAck('fixture.sources');
    peers = mediaSourceDescriptorSchema
      .array()
      .parse(raw)
      .filter(({ producerId }) => !own.has(producerId));
    if (peers.length < 2) await delay(100);
  }
  if (peers.length !== 2) throw new Error('Peer did not publish audio and video');
  const consumers: MediaTypes.Consumer[] = [];
  const analyser = audio.createAnalyser();
  const silence = audio.createGain();
  silence.gain.value = 0;
  analyser.connect(silence).connect(audio.destination);
  const samples = new Float32Array(analyser.fftSize);
  await call.acquire({ ...context, participantId }, async (_, signal, media) => {
    media.updateContext({
      ...context,
      participantId,
      audienceEpoch: 0,
      policyRevision: context.expectedPolicyRevision,
      projectionSequence: 0,
      scope: { type: 'MAIN' },
    });
    const requestId = crypto.randomUUID();
    const request = media.begin(requestId);
    if (!request) throw new Error('Could not initialize fixture media snapshot');
    const descriptor = {
      snapshotId: crypto.randomUUID(),
      mediaStreamId: crypto.randomUUID(),
      mediaSequence: 0,
      audienceEpoch: 0,
      policyRevision: context.expectedPolicyRevision,
      partCount: 1,
    };
    request.acceptAck({ requestId, data: { status: 'completed', result: descriptor } });
    request.acceptPart({
      requestId,
      sessionId: context.sessionId,
      epoch: context.epoch,
      callGeneration: context.callGeneration,
      ...descriptor,
      partIndex: 0,
      payload: { sources: peers, ownConsumers: [], ownProducers: [], ownTransports: [] },
    });
    const outcome = await request.result;
    if (outcome.status !== 'applied') throw new Error('Fixture media snapshot rejected');
    const source = peers.find(({ kind }) => kind === 'audio');
    if (!source) throw new Error('Missing peer audio');
    const consumer = await receiveMainAudio({
      media,
      snapshot: outcome.snapshot,
      source,
      transport: recv,
      rtpCapabilities: device.recvRtpCapabilities,
      command: async (event, envelope) => socket.timeout(4000).emitWithAck(event, envelope),
      signal,
    });
    consumers.push(consumer);
    // Keep the remote stream attached to the media element for browser decoding.
    // The video element is muted; AudioGraph remains the sole audible output.
    stream.addTrack(consumer.track);
    // A separate silent analyser measures the track. AudioGraph owns audible playback.
    audio.createMediaStreamSource(new MediaStream([consumer.track])).connect(analyser);
    return () => {};
  });
  for (const { producerId, sourceId, sourceGeneration, sourceRevision } of peers.filter(
    ({ kind }) => kind === 'video',
  )) {
    const binding = { sourceId, sourceGeneration, expectedSourceRevision: sourceRevision };
    const params = await command(
      'media.consumer.create',
      { ...binding, transportId: recv.id, producerId, rtpCapabilities: device.recvRtpCapabilities },
      mediaConsumerCreateAckSchema.parse,
    );
    const consumer = await recv.consume({
      id: params.consumerId,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters as MediaTypes.RtpParameters,
    });
    stream.addTrack(consumer.track);
    consumers.push(consumer);
    await command(
      'media.consumer.ready',
      { ...binding, consumerId: consumer.id },
      mediaConsumerReadyAckSchema.parse,
    );
  }

  const received = new Map<string, number>();
  let audioPeak = 0;
  const statsDeadline = performance.now() + 10_000;
  while ((received.size < 2 || audioPeak <= 0.001) && performance.now() < statsDeadline) {
    analyser.getFloatTimeDomainData(samples);
    for (const sample of samples) audioPeak = Math.max(audioPeak, Math.abs(sample));
    for (const consumer of consumers) {
      (await consumer.getStats()).forEach((entry) => {
        if (entry.type !== 'inbound-rtp' || !(entry.packetsReceived > 0)) return;
        if (consumer.kind === 'video' && entry.framesDecoded > 0)
          received.set('video', entry.framesDecoded);
        if (consumer.kind === 'audio') received.set('audio', entry.packetsReceived);
      });
    }
    if (received.size < 2 || audioPeak <= 0.001) await delay(200);
  }
  const stats = `video frames decoded=${received.get('video') ?? 0} · audio packets=${received.get('audio') ?? 0} · audio peak=${audioPeak.toFixed(3)}`;
  if (received.size !== 2 || audioPeak <= 0.001) throw new Error(stats);
  call.shutdown();
  if (!consumers.find(({ kind }) => kind === 'audio')?.closed)
    throw new Error('Call shutdown retained its audio Consumer');
  return `PASS · ${browser} · ${stats}`;
}

if (import.meta.env.DEV) {
  const result = document.querySelector('#result');
  const video = document.querySelector('video');
  if (!result || !video) throw new Error('Missing fixture elements');
  const deadline = window.setTimeout(() => {
    result.textContent = 'FAIL · Timeout';
  }, 32_000);
  void verifyMedia(video)
    .then(
      (value) => {
        result.textContent = value;
      },
      (error: unknown) => {
        result.textContent = `FAIL · ${String(error)}`;
      },
    )
    .finally(() => window.clearTimeout(deadline));
}
