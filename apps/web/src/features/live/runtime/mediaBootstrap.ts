import {
  mediaBootstrapResponseSchema,
  mediaHttpContextIssueAckSchema,
  mediaIceCredentialsResponseSchema,
} from '@colearnia/contracts';
import type {
  MediaHttpContextIssueInput,
  MediaIceCredentialsResponse,
  SessionProjectionCursor,
} from '@colearnia/contracts';
import type { Device, types as MediaTypes } from 'mediasoup-client';
import type { Socket } from 'socket.io-client';
import { authApi } from '../../auth/session';
import { createMediaBootstrapApi, MediaBootstrapApiError } from '../api/mediaBootstrapApi';

type Context = SessionProjectionCursor & { socketId: string };
type Ice = MediaIceCredentialsResponse['data'];
type Identity = Pick<Ice, 'sessionId' | 'epoch' | 'callGeneration'>;
type Transport = Pick<MediaTypes.Transport, 'closed' | 'updateIceServers'>;
const refreshMarginMs = 3_600_000;
const maxRefreshRetryMs = 30_000;

class RejectedIceReplay extends MediaBootstrapApiError {
  constructor() {
    super('CONFLICT');
  }
}

class StaleProofRevision extends MediaBootstrapApiError {
  constructor(readonly revision: number) {
    super('CONFLICT');
  }
}

function isTemporary(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'TimeoutError') ||
    (error instanceof Error &&
      'code' in error &&
      ['DEPENDENCY_UNAVAILABLE', 'RATE_LIMITED', 'SERVER_BUSY'].includes(String(error.code)))
  );
}

function toRtcIceServers(servers: Ice['iceServers']): RTCIceServer[] {
  return servers.map(({ urls, username, credential }) => ({
    urls,
    ...(username === undefined ? {} : { username }),
    ...(credential === undefined ? {} : { credential }),
  }));
}

function key(value: Context) {
  return JSON.stringify([
    value.socketId,
    value.sessionId,
    value.epoch,
    value.participantId,
    value.callGeneration,
    value.audienceEpoch,
    value.scope,
  ]);
}

// Create once for the accepted call. Context comes from M4's current projection
// and socket binding; dispose with the call signal.
export function createMediaBootstrapRuntime({
  getContext,
  getCsrfToken = authApi.csrf,
  issue,
  signal,
  api = createMediaBootstrapApi(),
  now = () => performance.now(),
}: {
  getContext: () => Context | null;
  getCsrfToken?: (signal: AbortSignal) => string | Promise<string>;
  issue: (input: MediaHttpContextIssueInput, signal: AbortSignal) => Promise<unknown>;
  signal: AbortSignal;
  api?: ReturnType<typeof createMediaBootstrapApi>;
  now?: () => number;
}) {
  function capture() {
    signal.throwIfAborted();
    const context = getContext();
    if (!context) throw new MediaBootstrapApiError('FORBIDDEN');
    const stamp = key(context);
    function readCurrent() {
      signal.throwIfAborted();
      const current = getContext();
      if (!current || stamp !== key(current))
        throw new DOMException('Media context changed', 'AbortError');
      return current;
    }
    return {
      stamp,
      identity: {
        sessionId: context.sessionId,
        epoch: context.epoch,
        callGeneration: context.callGeneration,
      },
      getPolicyRevision: () => readCurrent().policyRevision,
      assertCurrent() {
        readCurrent();
      },
    };
  }
  type Capture = ReturnType<typeof capture>;
  type Proof = { token: string; deadline: number };
  type IceIntent = {
    stamp: string;
    body: string;
    job?: Promise<{ data: Ice; deadline: number }>;
    deadline?: number;
  };
  let proof: { stamp: string; job: Promise<Proof>; value?: Proof } | undefined;
  let ice: IceIntent | undefined;
  signal.addEventListener(
    'abort',
    () => {
      proof = undefined;
      ice = undefined;
    },
    { once: true },
  );

  async function getProof(context: Capture, rejected?: string) {
    context.assertCurrent();
    if (
      proof?.stamp === context.stamp &&
      (!proof.value || (proof.value.token !== rejected && proof.value.deadline > now()))
    )
      return proof.job;
    const started = now();
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
    const requestProof = async (expectedPolicyRevision: number) => {
      const requestId = crypto.randomUUID();
      deadline.throwIfAborted();
      const raw = await issue(
        { ...context.identity, requestId, expectedPolicyRevision, payload: {} },
        deadline,
      );
      context.assertCurrent();
      deadline.throwIfAborted();
      const ack = mediaHttpContextIssueAckSchema.parse(raw);
      if (ack.requestId !== requestId) throw new MediaBootstrapApiError('CONFLICT');
      return ack;
    };
    const job = (async () => {
      let revision = context.getPolicyRevision();
      let ack = await requestProof(revision);
      if ('error' in ack && ack.error.code === 'CONFLICT') {
        const currentRevision = context.getPolicyRevision();
        if (currentRevision > revision) {
          revision = currentRevision;
          ack = await requestProof(revision);
        }
        if ('error' in ack && ack.error.code === 'CONFLICT') throw new StaleProofRevision(revision);
      }
      if ('error' in ack) throw new MediaBootstrapApiError(ack.error.code);
      return { token: ack.data.result.token, deadline: started + 60_000 };
    })();
    const pending: NonNullable<typeof proof> = { stamp: context.stamp, job };
    proof = pending;
    try {
      const value = await job;
      if (proof === pending) pending.value = value;
      return value;
    } catch (error) {
      if (proof === pending) proof = undefined;
      throw error;
    }
  }

  async function withProof<T extends Identity>(
    context: Capture,
    run: (token: string) => Promise<T>,
  ) {
    let { token } = await getProof(context);
    context.assertCurrent();
    let result: T;
    try {
      result = await run(token);
    } catch (error) {
      context.assertCurrent();
      if (!(error instanceof MediaBootstrapApiError) || error.code !== 'FORBIDDEN') throw error;
      ({ token } = await getProof(context, token));
      context.assertCurrent();
      result = await run(token);
    }
    context.assertCurrent();
    const { sessionId, epoch, callGeneration } = context.identity;
    if (
      result.sessionId !== sessionId ||
      result.epoch !== epoch ||
      result.callGeneration !== callGeneration
    )
      throw new MediaBootstrapApiError('CONFLICT');
    return result;
  }

  async function updateTransports(context: Capture, transports: readonly Transport[]) {
    const { data, deadline } = await credentials(context);
    const iceServers = toRtcIceServers(data.iceServers);
    for (const transport of transports) {
      context.assertCurrent();
      if (deadline <= now()) throw new MediaBootstrapApiError('CONFLICT');
      if (transport.closed) continue;
      try {
        await transport.updateIceServers({ iceServers });
      } catch (error) {
        if (!transport.closed) throw error;
      }
    }
    context.assertCurrent();
    return deadline;
  }

  function credentials(context: Capture) {
    context.assertCurrent();
    if (
      ice?.stamp === context.stamp &&
      ice.job &&
      (ice.deadline === undefined || ice.deadline - now() > refreshMarginMs)
    )
      return ice.job;
    const { sessionId, ...identity } = context.identity;
    const replay = ice?.stamp === context.stamp && !ice.job ? ice : undefined;
    const intent: IceIntent = replay ?? {
      stamp: context.stamp,
      body: JSON.stringify({ ...identity, requestId: crypto.randomUUID() }),
    };
    const started = now();
    const job = withProof(context, async (token) => {
      const send = async () => {
        const csrf = await getCsrfToken(signal);
        context.assertCurrent();
        try {
          return await api(sessionId, 'ice-credentials', token, signal, {
            method: 'POST',
            body: intent.body,
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          });
        } catch (error) {
          if (replay && error instanceof MediaBootstrapApiError && error.code === 'CONFLICT')
            throw new RejectedIceReplay();
          throw error;
        }
      };
      let raw: unknown;
      try {
        raw = await send();
      } catch (error) {
        if (!(error instanceof MediaBootstrapApiError) || error.code !== 'CSRF_INVALID')
          throw error;
        context.assertCurrent();
        raw = await send();
      }
      const parsed = mediaIceCredentialsResponseSchema.safeParse(raw);
      if (!parsed.success) throw new MediaBootstrapApiError('DEPENDENCY_UNAVAILABLE');
      return parsed.data.data;
    })
      .then((data) => {
        const deadline = started + Date.parse(data.expiresAt) - Date.parse(data.serverTime);
        if (deadline <= now()) throw new MediaBootstrapApiError('CONFLICT');
        if (ice === intent) intent.deadline = deadline;
        return { data, deadline };
      })
      .catch((error: unknown) => {
        if (ice === intent) {
          if (isTemporary(error) || error instanceof StaleProofRevision) delete intent.job;
          else ice = undefined;
        }
        throw error;
      });
    intent.job = job;
    ice = intent;
    return job;
  }

  return {
    async loadDevice(device: Pick<Device, 'load'>) {
      const context = capture();
      const { sessionId, epoch, callGeneration } = context.identity;
      const query = new URLSearchParams({ epoch, callGeneration: String(callGeneration) });
      const data = await withProof(
        context,
        async (token) =>
          mediaBootstrapResponseSchema.parse(
            await api(sessionId, `bootstrap?${query}`, token, signal),
          ).data,
      );
      context.assertCurrent();
      // The validated JSON response omits optional properties rather than sending undefined.
      await device.load({
        routerRtpCapabilities: data.routerRtpCapabilities as MediaTypes.RtpCapabilities,
      });
      context.assertCurrent();
    },
    async getIceServers() {
      const context = capture();
      const { data } = await credentials(context);
      context.assertCurrent();
      return toRtcIceServers(data.iceServers);
    },
    async refreshTransports(transports: readonly Transport[]) {
      await updateTransports(capture(), transports);
    },
    maintainIceServers(
      getTransports: () => readonly Transport[],
      onError: (error: unknown) => void,
    ) {
      const context = capture();
      const refreshLifetime = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      let retryMs = 1000;
      let waitingForRevision: number | undefined;
      const stop = () => {
        refreshLifetime.abort();
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
      };
      const refresh = async () => {
        try {
          context.assertCurrent();
          if (
            waitingForRevision !== undefined &&
            context.getPolicyRevision() <= waitingForRevision
          ) {
            scheduleRetry();
            return;
          }
          waitingForRevision = undefined;
          const deadline = await updateTransports(
            {
              ...context,
              assertCurrent() {
                refreshLifetime.signal.throwIfAborted();
                context.assertCurrent();
              },
            },
            getTransports(),
          );
          retryMs = 1000;
          if (!refreshLifetime.signal.aborted)
            timer = setTimeout(
              () => void refresh(),
              Math.max(1000, deadline - now() - refreshMarginMs),
            );
        } catch (error) {
          if (
            refreshLifetime.signal.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
          ) {
            stop();
            return;
          }
          if (
            isTemporary(error) ||
            error instanceof RejectedIceReplay ||
            error instanceof StaleProofRevision
          ) {
            const firstFailure = retryMs === 1000;
            if (error instanceof StaleProofRevision) waitingForRevision = error.revision;
            scheduleRetry();
            if (firstFailure) onError(error);
            return;
          }
          stop();
          onError(error);
        }
      };
      function scheduleRetry() {
        timer = setTimeout(() => void refresh(), retryMs);
        retryMs = Math.min(retryMs * 2, maxRefreshRetryMs);
      }
      signal.addEventListener('abort', stop, { once: true });
      void refresh();
      return stop;
    },
  };
}

export function bindMediaBootstrapSocket(
  socket: Pick<Socket, 'connected' | 'id' | 'timeout'>,
  getProjection: () => SessionProjectionCursor | null,
  options: Omit<Parameters<typeof createMediaBootstrapRuntime>[0], 'getContext' | 'issue'>,
) {
  return createMediaBootstrapRuntime({
    ...options,
    getContext() {
      const projection = getProjection();
      return socket.connected && socket.id && projection
        ? { ...projection, socketId: socket.id }
        : null;
    },
    async issue(input, signal) {
      signal.throwIfAborted();
      if (!socket.connected) throw new MediaBootstrapApiError('FORBIDDEN');
      // Proof issuance is a control request, not a disposable media update.
      // Volatile drops a packet when the socket is briefly unwritable just after
      // join/resync. The caller bounds one proof job and its ACK deadline.
      const result: unknown = await socket
        .timeout(4000)
        .emitWithAck('media.httpContext.issue', input)
        .catch(() => {
          signal.throwIfAborted();
          throw new MediaBootstrapApiError('DEPENDENCY_UNAVAILABLE');
        });
      signal.throwIfAborted();
      return result;
    },
  });
}
