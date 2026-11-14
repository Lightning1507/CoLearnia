import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { createWorker, version } from 'mediasoup';

const ip = '127.0.0.1';
const ports = process.argv.slice(2).map(Number);
assert.ok(
  ports.length === 0 ||
    (ports.length === 6 &&
      new Set(ports).size === 6 &&
      ports.every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)),
  'Provide six distinct ports: screen, camera, then mic (RTP/RTCP for each)',
);
const vp8 = { mimeType: 'video/VP8', clockRate: 90000 };
const opus = { mimeType: 'audio/opus', clockRate: 48000, channels: 2 };
const vp8Encode = ['-c:v', 'libvpx', '-threads', '1', '-deadline', 'realtime', '-g', '25'];
const tracks = [
  {
    source: 'screen',
    kind: 'video',
    codec: vp8,
    payloadType: 96,
    ssrc: 111111,
    input: 'testsrc2=size=320x240:rate=25',
    encode: vp8Encode,
  },
  {
    source: 'camera',
    kind: 'video',
    codec: vp8,
    payloadType: 97,
    ssrc: 333333,
    input: 'smptebars=size=160x120:rate=25',
    encode: vp8Encode,
  },
  {
    source: 'mic',
    kind: 'audio',
    codec: opus,
    payloadType: 111,
    ssrc: 222222,
    input: 'sine=frequency=440:sample_rate=48000',
    encode: ['-c:a', 'libopus', '-ac', '2'],
  },
];

async function receive(sockets, onPacket) {
  const socket = createSocket('udp4');
  sockets.push(socket);
  socket.on('message', onPacket);
  socket.bind(0, ip);
  await once(socket, 'listening');
  return socket.address().port;
}

function startSource(track, transport, sources) {
  const source = spawn(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-re',
      '-f',
      'lavfi',
      '-i',
      track.input,
      '-t',
      '4',
      ...track.encode,
      '-f',
      'rtp',
      '-payload_type',
      String(track.payloadType),
      '-ssrc',
      String(track.ssrc),
      `rtp://${ip}:${transport.tuple.localPort}?rtcpport=${transport.rtcpTuple.localPort}`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  sources.push(source);
  return once(source, 'close').then(([code]) => assert.equal(code, 0, 'FFmpeg source failed'));
}

const worker = await createWorker({ logLevel: 'error' });
const sockets = [];
const sources = [];
try {
  const router = await worker.createRouter({ mediaCodecs: [vp8, opus] });
  const createTransport = (comedia) =>
    router.createPlainTransport({
      listenInfo: { protocol: 'udp', ip },
      rtcpListenInfo: { protocol: 'udp', ip },
      rtcpMux: false,
      comedia,
      enableSctp: false,
    });
  const descriptors = [];
  const runs = [];
  const ingress = [];
  for (const track of tracks) {
    const input = await createTransport(true);
    const output = await createTransport(false);
    const codec = {
      ...track.codec,
      payloadType: track.payloadType,
    };
    const producer = await input.produce({
      kind: track.kind,
      rtpParameters: { codecs: [codec], encodings: [{ ssrc: track.ssrc }] },
    });
    const consumer = await output.consume({
      producerId: producer.id,
      rtpCapabilities: {
        codecs: router.rtpCapabilities.codecs.filter(
          ({ mimeType }) => mimeType === track.codec.mimeType,
        ),
      },
    });
    const packets = { rtp: 0, rtcp: 0, senderReports: 0, invalidRtp: 0 };
    const rtpPort =
      ports[descriptors.length * 2] ??
      (await receive(sockets, (packet) => {
        const [encoding] = consumer.rtpParameters.encodings;
        const [outputCodec] = consumer.rtpParameters.codecs;
        if (
          packet.length < 12 ||
          packet[0] >> 6 !== 2 ||
          (packet[1] & 127) !== outputCodec.payloadType ||
          packet.readUInt32BE(8) !== encoding.ssrc
        ) {
          packets.invalidRtp++;
        } else {
          packets.rtp++;
        }
      }));
    const rtcpPort =
      ports[descriptors.length * 2 + 1] ??
      (await receive(sockets, (packet) => {
        if (packet.length < 4 || packet[0] >> 6 !== 2) return;
        packets.rtcp++;
        if (packet[1] === 200) packets.senderReports++;
      }));
    await output.connect({ ip, port: rtpPort, rtcpPort });
    descriptors.push({
      source: track.source,
      kind: track.kind,
      ip,
      rtpPort,
      rtcpPort,
      inputRtpPort: input.tuple.localPort,
      inputRtcpPort: input.rtcpTuple.localPort,
      rtpParameters: consumer.rtpParameters,
      packets,
    });
    ingress.push({ track, input });
  }
  console.log(JSON.stringify({ event: 'descriptor', mediasoup: version, tracks: descriptors }));
  if (ports.length) {
    const [signal] = await once(process.stdin, 'data', { signal: AbortSignal.timeout(30_000) });
    assert.equal(
      String(signal).trim(),
      'start',
      'Expected start after the recorder binds its ports',
    );
    process.stdin.pause();
  }
  for (const { track, input } of ingress) runs.push(startSource(track, input, sources));
  await Promise.all(runs);
  await setTimeout(250);
  for (const { source, packets } of ports.length ? [] : descriptors) {
    assert.ok(packets.rtp > 0 && packets.senderReports > 0, `Missing RTP or RTCP SR for ${source}`);
    assert.equal(packets.invalidRtp, 0, `RTP did not match Consumer descriptor for ${source}`);
  }
  console.log(
    JSON.stringify(
      ports.length
        ? { event: 'sources-completed' }
        : {
            event: 'verified',
            tracks: descriptors.map(({ source, kind, packets }) => ({ source, kind, packets })),
          },
    ),
  );
} finally {
  for (const source of sources) source.kill();
  for (const socket of sockets) socket.close();
  worker.close();
}
