import {
  mediaTransportConnectAckSchema,
  mediaTransportCreateAckSchema,
} from '@colearnia/contracts';
import { Device } from 'mediasoup-client';
import type { types as MediaTypes } from 'mediasoup-client';
import { io } from 'socket.io-client';

async function verifyTransport() {
  const browser = new URLSearchParams(location.search).get('browser');
  if (browser !== 'A' && browser !== 'B') throw new Error('Expected browser A or B');
  const socket = io('http://127.0.0.1:5192', {
    auth: { browser },
    transports: ['websocket'],
    reconnection: false,
  });
  let transport: MediaTypes.Transport | undefined;
  let audio: AudioContext | undefined;
  let track: MediaStreamTrack | undefined;
  try {
    const { context, routerRtpCapabilities } = await new Promise<{
      context: {
        sessionId: string;
        epoch: string;
        callGeneration: number;
        expectedPolicyRevision: number;
      };
      routerRtpCapabilities: MediaTypes.RtpCapabilities;
    }>((resolve, reject) => {
      socket.once('fixture.ready', resolve);
      socket.once('connect_error', reject);
    });
    const device = await Device.factory();
    await device.load({ routerRtpCapabilities });
    const createId = crypto.randomUUID();
    const created = mediaTransportCreateAckSchema.parse(
      await socket.timeout(3000).emitWithAck('media.transport.create', {
        ...context,
        requestId: createId,
        payload: { direction: 'SEND' },
      }),
    );
    if (!('data' in created) || created.requestId !== createId)
      throw new Error('Transport create failed');
    const { transportId, iceParameters, iceCandidates, dtlsParameters } = created.data.result;
    transport = device.createSendTransport({
      id: transportId,
      iceParameters: {
        usernameFragment: iceParameters.usernameFragment,
        password: iceParameters.password,
        ...(iceParameters.iceLite === undefined ? {} : { iceLite: iceParameters.iceLite }),
      },
      iceCandidates: iceCandidates.map(({ tcpType, ...candidate }) => ({
        ...candidate,
        ...(tcpType === undefined ? {} : { tcpType }),
      })),
      dtlsParameters: {
        fingerprints: dtlsParameters.fingerprints,
        ...(dtlsParameters.role === undefined ? {} : { role: dtlsParameters.role }),
      },
    });
    transport.on('connect', ({ dtlsParameters: parameters }, callback, errback) => {
      const requestId = crypto.randomUUID();
      void socket
        .timeout(3000)
        .emitWithAck('media.transport.connect', {
          ...context,
          requestId,
          payload: { transportId, dtlsParameters: parameters },
        })
        .then((raw: unknown) => {
          const ack = mediaTransportConnectAckSchema.parse(raw);
          if (
            !('data' in ack) ||
            ack.requestId !== requestId ||
            ack.data.result.transportId !== transportId
          ) {
            throw new Error('Transport connect failed');
          }
          callback();
        })
        .catch(errback);
    });
    // mediasoup-client negotiates lazily. This local silent probe triggers the handshake.
    // The fixture never creates a Producer in the SFU or forwards audio to another client.
    transport.on('produce', (_parameters, callback) => callback({ id: 'fixture-local-probe' }));
    const ready = new Promise<void>((resolve, reject) => {
      transport?.on('connectionstatechange', (state) => {
        if (state === 'connected') resolve();
        if (state === 'failed' || state === 'closed') reject(new Error(state));
      });
    });
    audio = new AudioContext();
    track = audio.createMediaStreamDestination().stream.getAudioTracks()[0];
    if (!track) throw new Error('Missing local probe track');
    await Promise.all([ready, transport.produce({ track })]);
  } finally {
    transport?.close();
    track?.stop();
    await audio?.close();
    socket.close();
  }
}

if (import.meta.env.DEV) {
  const result = document.getElementById('result');
  if (!result) throw new Error('Missing fixture result');
  const timer = window.setTimeout(() => {
    result.textContent = 'FAIL · Timeout';
  }, 15_000);
  void verifyTransport()
    .then(
      () => {
        result.textContent = 'PASS · Socket.IO create/connect, WebRTC connected';
      },
      (error: unknown) => {
        result.textContent = `FAIL · ${String(error)}`;
      },
    )
    .finally(() => window.clearTimeout(timer));
}
