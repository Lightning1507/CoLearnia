import {
  mediaTransportConnectInputSchema,
  mediaTransportCreateInputSchema,
  mediaTransportCreateResultSchema,
  mediaTransportConnectAckSchema,
  mediaTransportCreateAckSchema,
  requestIdSchema,
  sameSessionScope,
  sessionControlBudget,
} from '@colearnia/contracts';
import type {
  LiveContext,
  LiveContextResult,
  MediaTransportConnectInput,
  MediaTransportCreateInput,
  MediaTransportCreateResult,
  SessionCleanupRequest,
  SessionCleanupResult,
} from '@colearnia/contracts';
import type { types as MediaTypes } from 'mediasoup';
import { randomUUID } from 'node:crypto';
import { sessionCleanupAdmission } from '../session-manager/cleanup-admission.js';
import type { CleanupAdmission } from '../session-manager/cleanup-admission.js';

type Command =
  | { kind: 'create'; input: MediaTransportCreateInput }
  | { kind: 'connect'; input: MediaTransportConnectInput };
type ContextInput = Pick<Command['input'], 'sessionId' | 'epoch' | 'callGeneration'>;
type Authority = <T>(
  socketId: string,
  input: ContextInput,
  // Called synchronously under the M4 gate with current socket binding and access.
  use: (resolved: LiveContextResult, router?: MediaTypes.Router) => T,
) => Promise<T>;
type Direction = MediaTransportCreateInput['payload']['direction'];
type Transport = Pick<
  MediaTypes.WebRtcTransport,
  'id' | 'closed' | 'iceParameters' | 'iceCandidates' | 'dtlsParameters' | 'connect' | 'close'
> & {
  observer: { once(event: 'close', listener: () => void): unknown };
  on(event: 'dtlsstatechange', listener: (state: MediaTypes.DtlsState) => void): unknown;
};
type SocketPort = {
  id: string;
  on(
    event: `media.transport.${Command['kind']}`,
    listener: (raw: unknown, ack?: (value: unknown) => void) => void,
  ): unknown;
  once(event: 'disconnect', listener: () => void): unknown;
};
type Slot = {
  key: string;
  socketId: string;
  context: LiveContext;
  direction: Direction;
  transport?: Transport;
  descriptor?: MediaTransportCreateResult;
  connectedWith?: string;
  connecting: boolean;
  established?: boolean;
  closed: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
type Failure = { errorCode: string };
type Result = Slot | Failure;
type Intent = {
  signature: string;
  slot: Slot;
  result?: Result;
  expiresAt: number;
};

const reject = (errorCode: string): Failure => ({ errorCode });
const replayMs = 60_000;
const pendingConnectMs = sessionControlBudget.foregroundTransitionTimeoutMs;
// PoC admission ceilings. One SEND and one RECV per current recipient binding.
const maxSlots = 512;
const maxIntents = 4096;

function slotKey(socketId: string, context: LiveContext, direction: Direction) {
  const { sessionId, epoch, participantId, callGeneration, audienceEpoch } = context;
  return JSON.stringify([
    socketId,
    sessionId,
    epoch,
    participantId,
    callGeneration,
    audienceEpoch,
    direction,
  ]);
}

function describeTransport(transport: Transport) {
  return mediaTransportCreateResultSchema.parse({
    transportId: transport.id,
    iceGeneration: 0,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  });
}

export function createTransportSignaling({
  withContext,
  createTransport,
  admission = sessionCleanupAdmission,
}: {
  withContext: Authority;
  createTransport: (router: MediaTypes.Router) => Promise<Transport>;
  admission?: CleanupAdmission;
}) {
  const slots = new Map<string, Slot>();
  const transports = new Map<string, Slot>();
  const intents = new Map<string, Intent>();
  const pending = new Set<Slot>();

  function forget(slot: Slot) {
    slot.closed = true;
    clearTimeout(slot.timer);
    if (slots.get(slot.key) === slot) slots.delete(slot.key);
    if (slot.transport && transports.get(slot.transport.id) === slot)
      transports.delete(slot.transport.id);
    delete slot.transport;
    delete slot.descriptor;
  }

  function close(slot: Slot) {
    const transport = slot.transport;
    forget(slot);
    transport?.close();
  }

  function authorize(socketId: string, input: Command['input'], resolved: LiveContextResult) {
    if (!resolved.ok) return reject(resolved.errorCode);
    const { context } = resolved;
    if (!(Date.parse(context.auth.expiresAt) > Date.now())) return reject('AUTH_REQUIRED');
    if (
      context.sessionId !== input.sessionId ||
      context.epoch !== input.epoch ||
      context.callGeneration !== input.callGeneration ||
      context.policyRevision !== input.expectedPolicyRevision
    )
      return reject('CONFLICT');
    if (
      context.scope.type === 'GROUP' &&
      context.scope.mode === 'ACTIVITY' &&
      !(Date.parse(context.scope.deadline) > Date.now())
    )
      return reject('FORBIDDEN');
    return {
      context,
      owns: (slot: Slot) =>
        !slot.closed &&
        slot.key === slotKey(socketId, context, slot.direction) &&
        slot.context.auth.userId === context.auth.userId &&
        slot.context.auth.authSessionId === context.auth.authSessionId &&
        sameSessionScope(slot.context.scope, context.scope),
    };
  }

  async function perform(socketId: string, command: Command, respond: (result: Result) => void) {
    const { input } = command;
    const signature = JSON.stringify(input.payload);
    const prepared = await withContext(socketId, input, (resolved, router) => {
      const access = authorize(socketId, input, resolved);
      if ('errorCode' in access) return access;
      const { context, owns } = access;
      const { userId } = context.auth;
      const sessionKey = `${context.sessionId}:${context.epoch}`;
      const now = performance.now();
      for (const [key, intent] of intents) {
        if (intent.expiresAt <= now) intents.delete(key);
      }
      const intentKey = JSON.stringify([userId, sessionKey, command.kind, input.requestId]);
      const prior = intents.get(intentKey);
      if (prior) {
        if (!owns(prior.slot) || prior.signature !== signature) return reject('CONFLICT');
        if (!prior.result) return reject('OPERATION_IN_PROGRESS');
        return { ready: Promise.resolve(prior.result) };
      }

      let slot: Slot;
      if (command.kind === 'create') {
        const { direction } = command.input.payload;
        const key = slotKey(socketId, context, direction);
        if (!router || router.closed) return reject('DEPENDENCY_UNAVAILABLE');
        if (slots.has(key)) return reject('CONFLICT');
        if (slots.size >= maxSlots) return reject('SERVER_BUSY');
        slot = { key, socketId, context, direction, connecting: false, closed: false };
      } else {
        const target = transports.get(command.input.payload.transportId);
        if (!target || !owns(target)) return reject('CONFLICT');
        if (target.connecting) return reject('OPERATION_IN_PROGRESS');
        if (target.connectedWith !== undefined && target.connectedWith !== signature) {
          return reject('CONFLICT');
        }
        slot = target;
      }

      let userIntents = 0;
      let sessionIntents = 0;
      for (const intent of intents.values()) {
        if (intent.slot.context.auth.userId === userId) userIntents++;
        if (
          intent.slot.context.sessionId === context.sessionId &&
          intent.slot.context.epoch === context.epoch
        ) {
          sessionIntents++;
        }
      }
      if (intents.size >= maxIntents || userIntents >= 64 || sessionIntents >= 1024)
        return reject('SERVER_BUSY');
      if (command.kind === 'connect' && slot.connectedWith === signature) {
        const ready = Promise.resolve(slot);
        intents.set(intentKey, { signature, slot, result: slot, expiresAt: now + replayMs });
        return { ready };
      }
      const release = admission.tryAcquire(userId, sessionKey);
      if (!release) return reject('SERVER_BUSY');
      if (command.kind === 'create') slots.set(slot.key, slot);
      else slot.connecting = true;
      pending.add(slot);

      const intent: Intent = { signature, slot, expiresAt: now + replayMs };
      let finish!: (result: Result) => void;
      const ready = new Promise<Result>((resolve) => {
        finish = (result) => {
          if (intent.result) return;
          intent.result = result;
          resolve(result);
        };
      });
      intents.set(intentKey, intent);
      let started = false;
      let expired = false;
      const releaseAdmission = () => {
        pending.delete(slot);
        release();
      };
      const timeout = setTimeout(() => {
        expired = true;
        close(slot);
        if (!started) releaseAdmission();
        finish(reject('DEPENDENCY_UNAVAILABLE'));
      }, sessionControlBudget.cleanupAttemptTimeoutMs);
      return {
        ready,
        start: () => {
          if (expired) return;
          started = true;
          void (async () => {
            if (slot.closed) return reject('CONFLICT');
            if (command.kind === 'create') {
              if (!router) return reject('DEPENDENCY_UNAVAILABLE');
              const native = await createTransport(router);
              if (slot.closed) {
                native.close();
                return reject('CONFLICT');
              }
              slot.transport = native;
              native.observer.once('close', () => forget(slot));
              native.on('dtlsstatechange', (state) => {
                if (state === 'connected') {
                  slot.established = true;
                  clearTimeout(slot.timer);
                }
                if (state === 'failed' || state === 'closed') close(slot);
              });
            } else {
              if (!slot.transport) return reject('CONFLICT');
              const { fingerprints, role } = command.input.payload.dtlsParameters;
              await slot.transport.connect({
                dtlsParameters: { fingerprints, ...(role === undefined ? {} : { role }) },
              });
            }

            return withContext(socketId, input, (fresh) => {
              const current = authorize(socketId, input, fresh);
              if ('errorCode' in current) return current;
              if (!current.owns(slot) || !slot.transport || slot.transport.closed)
                return reject('CONFLICT');
              if (command.kind === 'create') {
                slot.descriptor = describeTransport(slot.transport);
                transports.set(slot.transport.id, slot);
                slot.timer = setTimeout(() => close(slot), pendingConnectMs);
                slot.timer.unref();
              } else {
                slot.connecting = false;
                slot.connectedWith = signature;
              }
              return slot;
            });
          })()
            .catch(() => reject('DEPENDENCY_UNAVAILABLE'))
            .then((result) => {
              if ('errorCode' in result) close(slot);
              finish(result);
            })
            .finally(() => {
              clearTimeout(timeout);
              releaseAdmission();
            });
        },
      };
    });
    if ('errorCode' in prepared) return respond(prepared);
    prepared.start?.();
    const result = await prepared.ready;
    if ('errorCode' in result) return respond(result);
    // Retry replies are checked again, even when waiting on an existing intent.
    await withContext(socketId, input, (resolved) => {
      const access = authorize(socketId, input, resolved);
      if ('errorCode' in access) return respond(access);
      respond(access.owns(result) ? result : reject('CONFLICT'));
    });
  }

  return {
    attach(socket: SocketPort) {
      const register = (kind: Command['kind'], decode: (value: unknown) => Command | null) => {
        socket.on(`media.transport.${kind}`, (raw: unknown, ack?: (value: unknown) => void) => {
          if (typeof ack !== 'function') return;
          const candidate =
            raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined;
          const requestId = requestIdSchema.safeParse(candidate).data ?? randomUUID();
          let responded = false;
          const reply = (value: unknown) => {
            if (responded) return;
            responded = true;
            ack(value);
          };
          const fail = (code: string) =>
            reply({ requestId, error: { code, message: 'Không thể xử lý media transport.' } });
          const command = decode(raw);
          if (!command) return fail('VALIDATION_ERROR');
          if (
            Buffer.byteLength(JSON.stringify(command.input), 'utf8') >
            sessionControlBudget.maxControlBytes
          ) {
            return fail('PAYLOAD_TOO_LARGE');
          }
          void perform(socket.id, command, (result) => {
            if ('errorCode' in result) return fail(result.errorCode);
            const payload =
              command.kind === 'create'
                ? result.descriptor
                : result.transport && !result.transport.closed
                  ? { transportId: result.transport.id, connected: true }
                  : null;
            if (!payload) return fail('CONFLICT');
            const schema =
              command.kind === 'create'
                ? mediaTransportCreateAckSchema
                : mediaTransportConnectAckSchema;
            reply(schema.parse({ requestId, data: { status: 'completed', result: payload } }));
          }).catch(() => fail('DEPENDENCY_UNAVAILABLE'));
        });
      };
      register('create', (raw) => {
        const parsed = mediaTransportCreateInputSchema.safeParse(raw);
        return parsed.success ? { kind: 'create', input: parsed.data } : null;
      });
      register('connect', (raw) => {
        const parsed = mediaTransportConnectInputSchema.safeParse(raw);
        return parsed.success ? { kind: 'connect', input: parsed.data } : null;
      });
      socket.once('disconnect', () => {
        for (const slot of slots.values()) {
          if (slot.socketId === socket.id && !slot.established) close(slot);
        }
      });
    },
    cleanup(request: SessionCleanupRequest): SessionCleanupResult {
      let cleanupPending = false;
      for (const slot of new Set([...slots.values(), ...pending])) {
        const context = slot.context;
        const { target } = request;
        if (context.sessionId !== request.sessionId || context.epoch !== request.epoch) continue;
        if (
          target.type !== 'SCOPE' &&
          (context.participantId !== target.participantId ||
            !('callGeneration' in request) ||
            context.callGeneration !== request.callGeneration)
        )
          continue;
        if (
          target.type !== 'PARTICIPANT' &&
          (context.scope.type !== target.scope.type ||
            (context.scope.type === 'GROUP' &&
              target.scope.type === 'GROUP' &&
              context.scope.groupId !== target.scope.groupId))
        )
          continue;
        if (target.type === 'PARTICIPANT_SCOPE' && context.audienceEpoch !== target.audienceEpoch)
          continue;
        cleanupPending ||= pending.has(slot);
        close(slot);
      }
      const { reason, ...identity } = request;
      void reason;
      return {
        ...identity,
        outcome: { permissionRevoked: true, pendingInvalidated: true, cleanupPending },
      };
    },
  };
}
