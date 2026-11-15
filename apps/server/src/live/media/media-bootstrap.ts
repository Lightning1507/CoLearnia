import { createHash, createHmac, randomBytes } from 'node:crypto';
import { sameSessionScope } from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import type {
  AuthenticatedContext,
  CommonErrorCode,
  LiveContext,
  MediaHttpContextIssueInput,
  MediaIceCredentialsResponse,
} from '@colearnia/contracts';
import type { createMainJoinRegistry } from '../session-manager/main-join-registry.js';
import { sessionCleanupAdmission } from '../session-manager/cleanup-admission.js';

type Identity = Pick<LiveContext, 'sessionId' | 'epoch' | 'callGeneration'>;
type Registry = Pick<ReturnType<typeof createMainJoinRegistry>, 'withContext'>;
type IceServers = MediaIceCredentialsResponse['data']['iceServers'];
type Binding = Identity &
  Pick<LiveContext, 'participantId' | 'audienceEpoch' | 'scope'> & {
    socketId: string;
    userId: string;
    authSessionId: string;
  };
type Proof = { binding: Binding; digest: string; nonce: Buffer; expires: number };
type IceIntent = {
  binding: Binding;
  expires: number;
  pending: boolean;
  failed?: boolean;
  result: Promise<IceServers>;
};

const proofTtlMs = 60_000;
export const mediaIceTtlSeconds = 14_400;
const iceTtlMs = mediaIceTtlSeconds * 1000;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function sameBinding(left: Binding, right: Binding) {
  return (
    left.socketId === right.socketId &&
    left.userId === right.userId &&
    left.authSessionId === right.authSessionId &&
    left.sessionId === right.sessionId &&
    left.epoch === right.epoch &&
    left.callGeneration === right.callGeneration &&
    left.participantId === right.participantId &&
    left.audienceEpoch === right.audienceEpoch &&
    sameSessionScope(left.scope, right.scope)
  );
}

export class MediaBootstrapError extends Error {
  constructor(readonly code: CommonErrorCode) {
    super(code);
  }
}

export function createMediaBootstrap({
  registry,
  issueIceServers,
  now = Date.now,
}: {
  registry: Registry;
  issueIceServers: (signal: AbortSignal) => Promise<IceServers>;
  now?: () => number;
}) {
  const key = randomBytes(32);
  const proofs = new Map<string, Proof>();
  const bySocket = new Map<string, string>();
  const proofRequests = new Map<
    string,
    { binding: Binding; digest: string; expires: number; expectedPolicyRevision: number }
  >();
  const iceRequests = new Map<string, IceIntent>();
  const lastIce = new Map<string, IceIntent>();
  const tokenFor = (nonce: Buffer) => createHmac('sha256', key).update(nonce).digest('base64url');
  const iso = (ms: number) => new Date(ms).toISOString();

  function revokeSocket(socketId: string) {
    const current = bySocket.get(socketId);
    if (current) proofs.delete(current);
    bySocket.delete(socketId);
    lastIce.delete(socketId);
  }

  function sweep() {
    const time = now();
    for (const proof of proofs.values()) {
      if (proof.expires <= time) {
        proofs.delete(proof.digest);
        bySocket.delete(proof.binding.socketId);
      }
    }
    for (const [id, request] of proofRequests) {
      if (request.expires + proofTtlMs <= time) proofRequests.delete(id);
    }
    for (const [id, request] of iceRequests) {
      if (!request.pending && request.expires + proofTtlMs <= time) iceRequests.delete(id);
    }
    for (const [socket, request] of lastIce) {
      if (!request.pending && request.expires <= time) lastIce.delete(socket);
    }
  }

  function current<T>(
    socketId: string,
    identity: Identity,
    auth: AuthenticatedContext,
    use: (binding: Binding, live: LiveContext, router: MediaTypes.Router) => T,
  ) {
    return registry.withContext(socketId, identity, (resolved, router, policy) => {
      if (
        !resolved.ok ||
        !policy ||
        !router ||
        router.closed ||
        !policy.session.participants.get(resolved.context.participantId)?.connected
      )
        throw new MediaBootstrapError('FORBIDDEN');
      const live = resolved.context;
      if (
        live.sessionId !== identity.sessionId ||
        live.epoch !== identity.epoch ||
        live.callGeneration !== identity.callGeneration ||
        live.auth.userId !== auth.userId ||
        live.auth.authSessionId !== auth.authSessionId ||
        !(Date.parse(auth.expiresAt) > now())
      )
        throw new MediaBootstrapError('FORBIDDEN');
      return use(
        {
          sessionId: live.sessionId,
          epoch: live.epoch,
          callGeneration: live.callGeneration,
          participantId: live.participantId,
          audienceEpoch: live.audienceEpoch,
          scope: live.scope,
          userId: auth.userId,
          authSessionId: auth.authSessionId,
          socketId,
        },
        live,
        router,
      );
    });
  }

  function authorized<T>(
    identity: Identity,
    auth: AuthenticatedContext,
    token: string,
    use: (binding: Binding, router: MediaTypes.Router) => T,
  ) {
    const proof = proofs.get(digest(token));
    if (!proof) throw new MediaBootstrapError('FORBIDDEN');
    const bound = proof.binding;
    if (
      proof.expires <= now() ||
      auth.userId !== bound.userId ||
      auth.authSessionId !== bound.authSessionId ||
      identity.sessionId !== bound.sessionId ||
      identity.epoch !== bound.epoch ||
      identity.callGeneration !== bound.callGeneration
    )
      throw new MediaBootstrapError('FORBIDDEN');
    return current(bound.socketId, identity, auth, (binding, _, router) => {
      if (
        proofs.get(proof.digest) !== proof ||
        proof.expires <= now() ||
        !sameBinding(binding, bound)
      )
        throw new MediaBootstrapError('FORBIDDEN');
      return use(binding, router);
    });
  }

  return {
    revokeSocket,
    issue(
      socketId: string,
      auth: AuthenticatedContext,
      input: MediaHttpContextIssueInput,
      reply: (result: { token: string; expiresAt: string }) => void,
    ) {
      return current(socketId, input, auth, (binding, live) => {
        sweep();
        if (input.expectedPolicyRevision !== live.policyRevision)
          throw new MediaBootstrapError('CONFLICT');
        const id = JSON.stringify([auth.userId, input.requestId]);
        const recorded = proofRequests.get(id);
        const active = proofs.get(bySocket.get(socketId) ?? '');
        if (recorded) {
          if (
            !active ||
            recorded.expectedPolicyRevision !== input.expectedPolicyRevision ||
            !sameBinding(recorded.binding, binding) ||
            active.digest !== recorded.digest ||
            !sameBinding(active.binding, binding)
          )
            throw new MediaBootstrapError('CONFLICT');
          reply({ token: tokenFor(active.nonce), expiresAt: iso(active.expires) });
          return;
        }
        const rates = [...proofRequests.values()].filter((request) => request.expires > now());
        const session = (item: { binding: Binding }) =>
          item.binding.sessionId === binding.sessionId && item.binding.epoch === binding.epoch;
        if (
          rates.length >= 512 ||
          rates.filter(session).length >= 64 ||
          rates.filter((item) => item.binding.userId === auth.userId).length >= 4
        )
          throw new MediaBootstrapError('RATE_LIMITED');
        const nonce = randomBytes(32);
        const token = tokenFor(nonce);
        const hash = digest(token);
        const expires = now() + proofTtlMs;
        if (active) proofs.delete(active.digest);
        proofs.set(hash, { binding, digest: hash, nonce, expires });
        bySocket.set(socketId, hash);
        proofRequests.set(id, {
          binding,
          digest: hash,
          expires,
          expectedPolicyRevision: input.expectedPolicyRevision,
        });
        reply({ token, expiresAt: iso(expires) });
      });
    },
    async bootstrap(
      identity: Identity,
      auth: AuthenticatedContext,
      token: string,
      reply: (rtp: unknown) => void,
    ) {
      return authorized(identity, auth, token, (_, router) => reply(router.rtpCapabilities));
    },
    async ice(
      identity: Identity,
      auth: AuthenticatedContext,
      token: string,
      requestId: string,
      reply: (
        value: Pick<MediaIceCredentialsResponse['data'], 'iceServers' | 'expiresAt' | 'serverTime'>,
      ) => void,
    ) {
      const intent = await authorized(identity, auth, token, (binding) => {
        sweep();
        const id = JSON.stringify([binding.userId, requestId]);
        const previous = iceRequests.get(id);
        if (previous) {
          if (!sameBinding(previous.binding, binding) || previous.expires <= now())
            throw new MediaBootstrapError('CONFLICT');
          return previous;
        }
        const cached = lastIce.get(binding.socketId);
        const usable =
          cached &&
          sameBinding(cached.binding, binding) &&
          (cached.pending ||
            (cached.failed ? cached.expires > now() : cached.expires - now() > 3_600_000));
        if (
          iceRequests.size >= 1024 ||
          [...iceRequests.values()].filter((entry) => entry.binding.userId === binding.userId)
            .length >= 16
        )
          throw new MediaBootstrapError('RATE_LIMITED');
        if (usable) {
          iceRequests.set(id, cached);
          return cached;
        }
        const release = sessionCleanupAdmission.tryAcquire(
          binding.userId,
          `${binding.sessionId}:${binding.epoch}`,
        );
        if (!release) throw new MediaBootstrapError('RATE_LIMITED');
        const slot: IceIntent = {
          binding,
          expires: now() + iceTtlMs,
          pending: true,
          result: Promise.resolve()
            .then(() => issueIceServers(AbortSignal.timeout(1800)))
            .catch(() => {
              // Briefly retain the failed intent to bound repeated upstream requests.
              slot.expires = now() + 5000;
              slot.failed = true;
              throw new MediaBootstrapError('DEPENDENCY_UNAVAILABLE');
            })
            .finally(() => {
              slot.pending = false;
              release();
            }),
        };
        iceRequests.set(id, slot);
        lastIce.set(binding.socketId, slot);
        return slot;
      });
      const iceServers = await intent.result;
      await authorized(identity, auth, token, (binding) => {
        if (!sameBinding(binding, intent.binding) || intent.expires <= now())
          throw new MediaBootstrapError('FORBIDDEN');
        reply({ iceServers, expiresAt: iso(intent.expires), serverTime: iso(now()) });
      });
    },
  };
}
