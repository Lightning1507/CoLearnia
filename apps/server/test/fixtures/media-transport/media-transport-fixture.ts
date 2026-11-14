import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { LiveContext } from '@colearnia/contracts';
import { loadConfig } from '../../../src/config/env.js';
import { createMediaRuntime } from '../../../src/live/media/runtime.js';
import { createTransportSignaling } from '../../../src/live/media/transport-signaling.js';
import { createPausedReadySignaling } from '../../../src/live/media/paused-ready-signaling.js';
import type {
  PolicyParticipant,
  SessionPolicyInput,
} from '../../../src/live/policy/session-policy.js';

// Opt-in loopback evidence only. No routes or fake identities in the product server.
const origin = 'http://127.0.0.1:5191';
const runtime = await createMediaRuntime(loadConfig({ MEDIA_PORT: '41960' }));
const router = await runtime.createSessionRouter();
const http = createServer();
const io = new Server(http, {
  allowRequest: (request, allow) => allow(null, request.headers.origin === origin),
  maxHttpBufferSize: 32 * 1024,
});
const contexts = new Map<string, LiveContext>();
const connected = new Set<string>();
const pausedReadyEnabled = process.argv.includes('--paused-ready');

function policyFor(context: LiveContext): SessionPolicyInput {
  const participants = new Map<string, PolicyParticipant>();
  for (const entry of contexts.values()) {
    participants.set(entry.participantId, {
      participantId: entry.participantId,
      displayName: entry.participantId,
      auth: entry.auth,
      access: entry.access,
      currentAccess: entry.access,
      callGeneration: entry.callGeneration,
      audienceEpoch: entry.audienceEpoch,
      connected: true,
      blocked: false,
      scope: entry.scope,
    });
  }
  return {
    request: {
      auth: context.auth,
      sessionId: context.sessionId,
      epoch: context.epoch,
      callGeneration: context.callGeneration,
    },
    access: context.access,
    nowMs: Date.now(),
    session: {
      sessionId: context.sessionId,
      epoch: context.epoch,
      workspaceId: context.access.workspaceId,
      channelId: context.access.channelId,
      state: 'ACTIVE',
      phase: 'GUIDANCE',
      policyRevision: 0,
      hostParticipantId: null,
      helpingGroupId: null,
      round: null,
      participants,
      groups: new Map(),
    },
  };
}

const service = createTransportSignaling({
  async withContext(socketId, _input, use) {
    const context = contexts.get(socketId);
    return context
      ? use({ ok: true, context }, router, pausedReadyEnabled ? policyFor(context) : undefined)
      : use({ ok: false, errorCode: 'AUTH_REQUIRED' });
  },
  async createTransport(currentRouter) {
    const transport = await runtime.createTransport(currentRouter);
    transport.on('dtlsstatechange', (state) => {
      if (state === 'connected') {
        connected.add(transport.id);
        console.log(`Server DTLS connected (${connected.size})`);
      }
    });
    return transport;
  },
});
const pausedReady = createPausedReadySignaling(service);

io.on('connection', (socket) => {
  const browser: unknown = socket.handshake.auth.browser;
  if (browser !== 'A' && browser !== 'B') return socket.disconnect();
  const digit = browser === 'A' ? '2' : '3';
  const participantId = digit.repeat(24);
  if ([...contexts.values()].some((context) => context.participantId === participantId)) {
    return socket.disconnect();
  }
  const context: LiveContext = {
    auth: {
      userId: participantId,
      authSessionId: digit.repeat(23) + '1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    access: {
      workspaceId: '4'.repeat(24),
      channelId: '5'.repeat(24),
      channelType: 'LIVE',
      membershipId: digit.repeat(23) + '2',
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    },
    sessionId: '1'.repeat(24),
    epoch: '10000000-0000-4000-8000-000000000001',
    callGeneration: 1,
    participantId,
    host: null,
    role: 'MEMBER',
    scope: { type: 'MAIN' },
    audienceEpoch: 0,
    policyRevision: 0,
  };
  contexts.set(socket.id, context);
  service.attach(socket);
  if (pausedReadyEnabled) {
    pausedReady.attach(socket);
    socket.on('fixture.sources', (ack: unknown) => {
      if (typeof ack === 'function') ack(pausedReady.visibleSources(policyFor(context)));
    });
  }
  socket.once('disconnect', () => {
    contexts.delete(socket.id);
    service.cleanup({
      operationId: crypto.randomUUID(),
      transitionToken: crypto.randomUUID(),
      sessionId: context.sessionId,
      epoch: context.epoch,
      callGeneration: context.callGeneration,
      reason: 'DISCONNECTED',
      target: { type: 'PARTICIPANT', participantId },
    });
  });
  socket.emit('fixture.ready', {
    participantId,
    context: {
      sessionId: context.sessionId,
      epoch: context.epoch,
      callGeneration: 1,
      expectedPolicyRevision: 0,
    },
    routerRtpCapabilities: router.rtpCapabilities,
  });
});

http.listen(5192, '127.0.0.1', () => console.log('SCRUM-60 fixture listening on 5192'));
process.once('SIGINT', () => {
  runtime.close();
  void io.close();
});
