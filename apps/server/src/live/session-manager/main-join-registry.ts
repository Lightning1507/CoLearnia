import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  authenticatedContextSchema,
  channelAccessStampSchema,
  sessionJoinAckSchema,
  sessionJoinInputSchema,
  sessionJoinTicketInputSchema,
  sessionEndInputSchema,
  workspaceDocumentIdSchema,
  liveAccessRevocationSchema,
  accessCleanupResultSchema,
  sessionResumeInputSchema,
  sessionResyncInputSchema,
  sessionResyncAckSchema,
} from '@colearnia/contracts';
import type {
  AuthenticatedContext,
  ChannelAccessStamp,
  CommonErrorCode,
  LiveContextRequest,
  LiveContextResult,
  SessionSnapshotPart,
  SessionEndInput,
  SessionCleanupRequest,
  LiveAccessRevocation,
  AccessCleanupResult,
} from '@colearnia/contracts';
import { Types } from 'mongoose';
import type { types as MediaTypes } from 'mediasoup';
import type { OperationCoordinator, CoordinationContext } from '../../lib/operation-coordinator.js';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import {
  createSessionProjectionCursor,
  prepareSessionSnapshot,
} from '../projection/session-projection.js';
import { resolveSessionPolicyContext } from '../policy/session-policy.js';
import type {
  PolicyParticipant,
  SessionPolicyInput,
  SessionPolicyState,
} from '../policy/session-policy.js';
import { beginSessionTransition, createSessionTransitionTiming } from './session-transition.js';
import { createSessionEndOperation } from './session-end-operation.js';
import type { SessionTransitionAdapters, SessionTransitionTiming } from './session-transition.js';
import { matchesMainRevocation, mayMatchMainRevocation } from './main-revocation.js';
import { createSessionMetadataWrite } from './session-metadata-write.js';
import type { SessionMutationRepository } from './session-metadata-write.js';

type Target = { workspaceId: string; channelId: string };
type Authority = { auth: AuthenticatedContext; access: ChannelAccessStamp; displayName: string };
type Binding = {
  socketId: string;
  auth: AuthenticatedContext;
  isConnected(): boolean;
};
type Repository = SessionMutationRepository;
type Room = {
  state: SessionPolicyState;
  router: MediaTypes.Router;
  revision: number;
  hostUserId: string;
  hostParticipantId: string;
  hostReservation: Authority | null;
  uncertain: boolean;
  joinAttempted: boolean;
  metadata?: ReturnType<typeof createSessionMetadataWrite>;
  endToken?: string;
  mediaFailed?: boolean;
  failureTask?: Promise<'ENDED' | 'PENDING'>;
};
type EndRecord = {
  destination: Target;
  binding: Binding | null;
  command: string;
  operation: ReturnType<typeof createSessionEndOperation>;
  expiresAt: number;
};
type Ownership = {
  binding: Binding;
  room: Room;
  participant: PolicyParticipant;
  resumeTicket: string;
  reconnect?: {
    deadline: number;
    generation: number;
    handle?: ReturnType<typeof beginSessionTransition>;
    task?: Promise<unknown>;
    retryCleanup?: () => Promise<unknown>;
  };
  resumeReplay?: { digest: string; requestId: string; socketId: string; generation: number };
};
type Intent = {
  key: string;
  digest: string;
  token: string;
  room: Room;
  authority: Authority;
  expiresAt: number;
  failed?: boolean;
  consumed?: { ownership: Ownership; requestId: string };
};
type Revocation = {
  event: LiveAccessRevocation;
  authSessions: Set<string>;
  command: string;
  expiresAt: number;
  task?: Promise<AccessCleanupResult>;
};
export class MainJoinError extends Error {
  constructor(readonly code: CommonErrorCode) {
    super('Unable to complete live session join');
    this.name = 'MainJoinError';
  }
}
function fail(code: CommonErrorCode): never {
  throw new MainJoinError(code);
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const sameStamp = (a: ChannelAccessStamp, b: ChannelAccessStamp) =>
  a.workspaceId === b.workspaceId &&
  a.channelId === b.channelId &&
  a.membershipId === b.membershipId &&
  a.membershipIncarnation === b.membershipIncarnation &&
  a.membershipRevision === b.membershipRevision &&
  a.channelRevision === b.channelRevision;
const defaults = {
  maxRooms: 128,
  maxOwnerships: 1024,
  maxIntents: 4096,
  perUserIntents: 64,
  perRoomIntents: 1024,
  ticketTtlMs: 60_000,
  routerTimeoutMs: 2000,
  maxEndRecords: 128,
  endReplayTtlMs: 60_000,
  maxRevocations: 128,
  revocationReplayTtlMs: 60_000,
  reconnectGraceMs: 30_000,
};

// Construct once at composition, with the SAME coordinator used by M1/M2.
// M1 must re-read auth/access and include its current revocation barriers under held.
export function createMainJoinRegistry(options: {
  coordinator: OperationCoordinator;
  repository: Repository;
  resolveAuthority(
    auth: AuthenticatedContext,
    target: Target,
    held: CoordinationContext,
  ): Promise<Authority>;
  // Synchronous M1 deny/version fence, including peers. Must not acquire another User gate.
  isAuthorityCurrent(
    authority: Readonly<Authority>,
    held: CoordinationContext,
    committedAccess?: Readonly<ChannelAccessStamp>,
  ): boolean;
  createRouter(): Promise<MediaTypes.Router>;
  endCleanup?: SessionTransitionAdapters;
  revocationCleanup?: Parameters<typeof beginSessionTransition>[2];
  reconnectCleanup?: SessionTransitionAdapters;
  // Exact cohort committed by M1 for this user/operation/revision. Never infer
  // logout-all targets from the sessions present when its notification arrives.
  revokedAuthSessions?(
    event: Extract<LiveAccessRevocation, { kind: 'USER_AUTH_SESSIONS' }>,
  ): readonly string[];
  now?: () => number;
  limits?: Partial<typeof defaults>;
}) {
  const limits = { ...defaults, ...options.limits };
  if (
    Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1) ||
    limits.ticketTtlMs > 60_000 ||
    limits.reconnectGraceMs > 30_000
  )
    throw new TypeError('Invalid join limits');
  const now = options.now ?? Date.now;
  const rooms = new Map<string, Room>();
  const ownerships = new Map<string, Ownership>();
  const intents = new Map<string, Intent>();
  const tickets = new Map<string, Intent>();
  const endRecords = new Map<string, EndRecord>();
  const failedRouters = new Set<string>();
  const revocations = new Map<string, Revocation>();
  const inFlight = new Map<symbol, { auth: AuthenticatedContext; target: Target }>();
  const pendingRouters = new Set<string>();
  const creatingRooms = new Set<string>();
  const joiningUsers = new Set<string>();
  const queuedUsers = new Map<string, number>();
  const queuedChannels = new Map<string, number>();
  const deadlines = new WeakMap<CoordinationContext, number>();
  let queued = 0;
  let nextGeneration = 0;
  let closed = false;
  let lastTime = Number.NEGATIVE_INFINITY;

  function clock() {
    const value = now();
    if (!Number.isFinite(value) || value < lastTime) fail('DEPENDENCY_UNAVAILABLE');
    lastTime = value;
    return value;
  }
  function identity(raw: AuthenticatedContext) {
    const auth = authenticatedContextSchema.parse(raw);
    return {
      ...auth,
      userId: auth.userId.toLowerCase(),
      authSessionId: auth.authSessionId.toLowerCase(),
    };
  }
  function target(raw: Target) {
    return {
      workspaceId: workspaceDocumentIdSchema.parse(raw.workspaceId).toLowerCase(),
      channelId: workspaceDocumentIdSchema.parse(raw.channelId).toLowerCase(),
    };
  }
  function assertRunning() {
    if (closed) fail('DEPENDENCY_UNAVAILABLE');
  }
  async function run<T>(
    auth: AuthenticatedContext,
    destination: Target,
    work: (held: CoordinationContext) => Promise<T>,
  ) {
    const userCount = queuedUsers.get(auth.userId) ?? 0;
    const channelCount = queuedChannels.get(destination.channelId) ?? 0;
    if (userCount >= 4 || channelCount >= 64 || queued >= 512) fail('SERVER_BUSY');
    const deadline = clock() + 10_000;
    const operation = Symbol();
    inFlight.set(operation, { auth, target: destination });
    queued++;
    queuedUsers.set(auth.userId, userCount + 1);
    queuedChannels.set(destination.channelId, channelCount + 1);
    try {
      return await options.coordinator.run(
        { userId: auth.userId, workspaceId: destination.workspaceId },
        (held) => {
          deadlines.set(held, deadline);
          expireConnections(rooms.get(destination.channelId));
          return work(held);
        },
        { waitTimeoutMs: 2000 },
      );
    } finally {
      inFlight.delete(operation);
      const missed = [...rooms.values()].filter(
        (room) => failedRouters.has(room.router.id) && !room.failureTask,
      );
      if (!closed && missed.length)
        void registryFailure(missed.map((room) => room.router.id)).catch(() => {});
      queued--;
      for (const [map, key] of [
        [queuedUsers, auth.userId],
        [queuedChannels, destination.channelId],
      ] as const) {
        const count = (map.get(key) ?? 1) - 1;
        if (count) map.set(key, count);
        else map.delete(key);
      }
    }
  }
  async function authority(
    auth: AuthenticatedContext,
    destination: Target,
    held: CoordinationContext,
    peer = false,
  ) {
    const required = {
      workspaceId: destination.workspaceId,
      ...(peer ? {} : { userId: auth.userId }),
    };
    held.assertHeld(required);
    assertRunning();
    if (clock() >= (deadlines.get(held) ?? Number.POSITIVE_INFINITY))
      fail('DEPENDENCY_UNAVAILABLE');
    if (Date.parse(auth.expiresAt) <= clock()) fail('AUTH_REQUIRED');
    let result: Authority;
    try {
      result = await options.resolveAuthority({ ...auth }, { ...destination }, held);
    } catch (error) {
      if (error instanceof MainJoinError) throw error;
      fail('DEPENDENCY_UNAVAILABLE');
    }
    held.assertHeld(required);
    assertRunning();
    if (clock() >= (deadlines.get(held) ?? Number.POSITIVE_INFINITY))
      fail('DEPENDENCY_UNAVAILABLE');
    const currentAuth = identity(result.auth);
    const stamp = channelAccessStampSchema.parse(result.access);
    const access = {
      ...stamp,
      workspaceId: stamp.workspaceId.toLowerCase(),
      channelId: stamp.channelId.toLowerCase(),
      membershipId: stamp.membershipId.toLowerCase(),
    };
    if (
      currentAuth.userId !== auth.userId ||
      currentAuth.authSessionId !== auth.authSessionId ||
      Date.parse(currentAuth.expiresAt) <= clock()
    )
      fail('AUTH_REQUIRED');
    if (
      access.workspaceId !== destination.workspaceId ||
      access.channelId !== destination.channelId ||
      access.channelType !== 'LIVE' ||
      !access.canReadContent
    )
      fail('FORBIDDEN');
    if (
      typeof result.displayName !== 'string' ||
      !result.displayName.trim() ||
      Buffer.byteLength(result.displayName) > 512
    )
      fail('DEPENDENCY_UNAVAILABLE');
    const resultAuthority = { auth: currentAuth, access, displayName: result.displayName };
    if (!currentFence(resultAuthority, held)) fail('FORBIDDEN');
    return resultAuthority;
  }
  function currentFence(
    current: Authority,
    held: CoordinationContext,
    committedAccess?: ChannelAccessStamp,
  ) {
    held.assertHeld({ workspaceId: current.access.workspaceId });
    if (
      [...revocations.values()].some((record) =>
        matchesMainRevocation(
          record.event,
          current.auth,
          committedAccess ?? current.access,
          record.authSessions,
        ),
      )
    )
      return false;
    try {
      return options.isAuthorityCurrent(current, held, committedAccess) === true;
    } catch {
      fail('DEPENDENCY_UNAVAILABLE');
    }
  }
  function usable(room: Room) {
    if (room.mediaFailed || room.uncertain || room.router.closed) fail('DEPENDENCY_UNAVAILABLE');
    if (room.state.state !== 'ACTIVE') fail('SESSION_ENDED');
  }
  function reservedHostCurrent(room: Room, current: Authority, held: CoordinationContext) {
    const reserved = room.hostReservation;
    return (
      !!reserved &&
      room.state.hostParticipantId === room.hostParticipantId &&
      reserved.auth.userId === current.auth.userId &&
      reserved.auth.authSessionId === current.auth.authSessionId &&
      Date.parse(reserved.auth.expiresAt) > clock() &&
      reserved.access.workspaceId === current.access.workspaceId &&
      reserved.access.channelId === current.access.channelId &&
      reserved.access.membershipId === current.access.membershipId &&
      reserved.access.membershipIncarnation === current.access.membershipIncarnation &&
      current.access.membershipRevision >= reserved.access.membershipRevision &&
      current.access.channelRevision >= reserved.access.channelRevision &&
      currentFence(current, held, reserved.access)
    );
  }
  function clearHostReservation(room: Room) {
    room.hostReservation = null;
    room.state.hostParticipantId = null;
    if (room.state.policyRevision >= Number.MAX_SAFE_INTEGER) {
      room.uncertain = true;
      fail('SERVER_BUSY');
    }
    room.state.policyRevision++;
  }
  function forget(intent: Intent) {
    if (intents.get(intent.key) === intent) intents.delete(intent.key);
    if (tickets.get(intent.digest) === intent) tickets.delete(intent.digest);
    intent.token = '';
  }
  function expireConnections(room: Room | undefined) {
    if (!room) return;
    for (const owner of ownerships.values()) {
      const record = owner.reconnect;
      if (owner.room !== room || !record || clock() < record.deadline) continue;
      blockPeer(room, owner.participant);
      owner.resumeTicket = '';
      delete owner.resumeReplay;
      const cleanup = record.handle?.inspect();
      if (!cleanup?.permissionRevoked || !cleanup.pendingInvalidated) continue;
      ownerships.delete(owner.participant.auth.userId);
      const participants = new Map(room.state.participants);
      participants.delete(owner.participant.participantId);
      room.state = { ...room.state, participants };
      if (room.state.hostParticipantId === owner.participant.participantId)
        room.state.hostParticipantId = null;
    }
  }
  function sweep() {
    const time = clock();
    for (const intent of intents.values()) if (intent.expiresAt <= time) forget(intent);
    for (const [key, record] of endRecords) if (record.expiresAt <= time) endRecords.delete(key);
    for (const [key, record] of revocations) if (record.expiresAt <= time) revocations.delete(key);
  }
  async function metadataResult(
    room: Room,
    write: ReturnType<typeof createSessionMetadataWrite>,
    guard: () => void = () => {},
  ) {
    try {
      const result = await write.run(guard);
      guard();
      room.revision = result.revision;
      if (room.metadata === write) {
        delete room.metadata;
        room.uncertain = false;
      }
      return result;
    } catch {
      room.metadata = write;
      room.uncertain = true;
      fail('DEPENDENCY_UNAVAILABLE');
    }
  }
  async function settleMetadata(room: Room, guard: () => void = () => {}) {
    if (room.metadata) await metadataResult(room, room.metadata, guard);
    if (room.uncertain) fail('DEPENDENCY_UNAVAILABLE');
  }
  function retireOrphan(
    room: Room | undefined,
    held: CoordinationContext,
    timing = createSessionTransitionTiming(),
  ) {
    if (
      !room ||
      room.uncertain ||
      room.state.state !== 'ACTIVE' ||
      [...ownerships.values()].some(
        (owner) =>
          owner.room === room &&
          !owner.participant.blocked &&
          Date.parse(owner.participant.auth.expiresAt) > clock() &&
          currentFence(
            {
              auth: owner.participant.auth,
              access: owner.participant.currentAccess,
              displayName: owner.participant.displayName,
            },
            held,
            owner.participant.access,
          ) &&
          (owner.reconnect ? clock() < owner.reconnect.deadline : owner.binding.isConnected()),
      ) ||
      (!room.joinAttempted && [...intents.values()].some((intent) => intent.room === room))
    )
      return;
    const adapters = options.endCleanup;
    if (!adapters) fail('DEPENDENCY_UNAVAILABLE');
    sweep();
    if (
      endRecords.size >= limits.maxEndRecords ||
      room.state.policyRevision >= Number.MAX_SAFE_INTEGER
    )
      fail('SERVER_BUSY');
    return acceptRoomEnd(
      room,
      null,
      {
        requestId: randomUUID(),
        sessionId: room.state.sessionId,
        epoch: room.state.epoch,
        callGeneration: 1,
        expectedPolicyRevision: room.state.policyRevision,
        action: 'END',
      },
      timing,
      held,
      adapters,
    );
  }
  async function makeRouter(channelId: string) {
    if (pendingRouters.has(channelId) || pendingRouters.size >= 32) fail('SERVER_BUSY');
    pendingRouters.add(channelId);
    let abandoned = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = Promise.resolve()
      .then(() => options.createRouter())
      .then((router) => {
        if (abandoned || closed) {
          router.close();
          fail('DEPENDENCY_UNAVAILABLE');
        }
        return router;
      })
      .finally(() => pendingRouters.delete(channelId));
    try {
      return await Promise.race([
        running,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abandoned = true;
            reject(new MainJoinError('DEPENDENCY_UNAVAILABLE'));
          }, limits.routerTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  function blockPeer(room: Room, participant: PolicyParticipant) {
    if (participant.blocked) return;
    participant.blocked = true;
    if (room.state.policyRevision >= Number.MAX_SAFE_INTEGER) {
      room.uncertain = true;
      fail('SERVER_BUSY');
    }
    room.state.policyRevision++;
  }
  async function refreshPeers(room: Room, held: CoordinationContext) {
    const destination = { workspaceId: room.state.workspaceId, channelId: room.state.channelId };
    for (const owner of ownerships.values()) {
      if (owner.room !== room) continue;
      const participant = owner.participant;
      participant.connected = !owner.reconnect && owner.binding.isConnected();
      if (participant.blocked || !participant.connected) continue;
      participant.currentAccess = { ...participant.currentAccess, canReadContent: false };
      try {
        const current = await authority(participant.auth, destination, held, true);
        const previous = participant.access;
        const continuous =
          previous.membershipId === current.access.membershipId &&
          previous.membershipIncarnation === current.access.membershipIncarnation &&
          current.access.membershipRevision >= previous.membershipRevision &&
          current.access.channelRevision >= previous.channelRevision &&
          currentFence(current, held, previous);
        participant.auth = current.auth;
        participant.currentAccess = current.access;
        if (!continuous) blockPeer(room, participant);
        else participant.access = { ...current.access };
      } catch (error) {
        if (
          error instanceof MainJoinError &&
          ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(error.code)
        ) {
          blockPeer(room, participant);
        } else throw error;
      }
    }
  }
  function fencePeers(room: Room, held: CoordinationContext) {
    for (const owner of ownerships.values()) {
      if (owner.room !== room || owner.participant.blocked) continue;
      const participant = owner.participant;
      if (
        !currentFence(
          {
            auth: participant.auth,
            access: participant.currentAccess,
            displayName: participant.displayName,
          },
          held,
        )
      ) {
        participant.currentAccess = { ...participant.currentAccess, canReadContent: false };
        blockPeer(room, participant);
      }
    }
  }
  function policyInput(owner: Ownership, current: Authority): SessionPolicyInput {
    owner.participant.currentAccess = { ...current.access };
    for (const bound of ownerships.values())
      if (bound.room === owner.room)
        bound.participant.connected = !bound.reconnect && bound.binding.isConnected();
    return {
      request: {
        auth: current.auth,
        sessionId: owner.room.state.sessionId,
        epoch: owner.room.state.epoch,
        callGeneration: owner.participant.callGeneration,
      },
      access: current.access,
      session: owner.room.state,
      nowMs: clock(),
    };
  }
  async function delivery(owner: Ownership, requestId: string, held: CoordinationContext) {
    await refreshPeers(owner.room, held);
    const current = await authority(
      owner.participant.auth,
      { workspaceId: owner.room.state.workspaceId, channelId: owner.room.state.channelId },
      held,
    );
    usable(owner.room);
    fencePeers(owner.room, held);
    const input = policyInput(owner, current);
    const cursor = createSessionProjectionCursor(input);
    if (!cursor.ok) fail(cursor.errorCode);
    const snapshot = prepareSessionSnapshot(input, cursor.cursor, {
      requestId,
      snapshotId: randomUUID(),
    });
    if (!snapshot.ok) fail(snapshot.errorCode);
    const ack = sessionJoinAckSchema.parse({
      requestId,
      data: {
        status: 'completed',
        result: {
          participantId: owner.participant.participantId,
          callGeneration: owner.participant.callGeneration,
          resumeTicket: owner.resumeTicket,
          snapshot: snapshot.ack.data!.result,
        },
      },
    });
    if (!('data' in ack)) fail('INTERNAL_ERROR');
    return { ack, parts: snapshot.parts as readonly SessionSnapshotPart[] };
  }

  function acceptRoomEnd(
    currentRoom: Room,
    binding: Binding | null,
    input: SessionEndInput,
    timing: SessionTransitionTiming,
    held: CoordinationContext,
    adapters: SessionTransitionAdapters,
  ): EndRecord {
    const cleanupActor = binding?.auth.userId ?? currentRoom.hostUserId;
    const destination = {
      workspaceId: currentRoom.state.workspaceId,
      channelId: currentRoom.state.channelId,
    };
    const key = JSON.stringify([input.sessionId, input.epoch]);
    const owners = [...ownerships.values()].filter((value) => value.room === currentRoom);
    const token = randomUUID();
    const cleanupIdentity = {
      operationId: input.requestId,
      transitionToken: token,
      sessionId: input.sessionId,
      epoch: input.epoch,
      reason: 'SESSION_ENDED' as const,
    };
    const targets: { userId: string; request: SessionCleanupRequest }[] = owners.map((value) => ({
      userId: value.participant.auth.userId,
      request: {
        ...cleanupIdentity,
        callGeneration: value.participant.callGeneration,
        target: { type: 'PARTICIPANT', participantId: value.participant.participantId },
      },
    }));
    targets.push({
      userId: cleanupActor,
      request: { ...cleanupIdentity, target: { type: 'SCOPE', scope: { type: 'MAIN' } } },
    });
    for (const groupId of currentRoom.state.groups.keys())
      targets.push({
        userId: cleanupActor,
        request: {
          ...cleanupIdentity,
          target: { type: 'SCOPE', scope: { type: 'GROUP', groupId } },
        },
      });
    // Last acceptance check under the gate, before any state/resource change.
    if (performance.now() >= timing.deadlineMs) fail('DEPENDENCY_UNAVAILABLE');
    currentRoom.endToken = token;
    currentRoom.state.state = 'ENDING';
    currentRoom.state.policyRevision++;
    for (const value of owners) value.participant.blocked = true;
    for (const intent of [...intents.values()]) if (intent.room === currentRoom) forget(intent);
    currentRoom.router.close();
    const isCurrent = () =>
      !closed &&
      rooms.get(destination.channelId) === currentRoom &&
      currentRoom.state.state === 'ENDING' &&
      currentRoom.endToken === token;
    const metadata = { sessionId: new Types.ObjectId(input.sessionId), epoch: input.epoch };
    let beginWrite: ReturnType<typeof createSessionMetadataWrite> | undefined;
    let completeWrite: ReturnType<typeof createSessionMetadataWrite> | undefined;
    const operation = createSessionEndOperation({
      input,
      timing,
      context: {
        assertHeld: () => held.assertHeld({ workspaceId: destination.workspaceId }),
        isCurrent,
      },
      targets,
      adapters,
      beginEnding: async (guard) => {
        if (currentRoom.metadata && currentRoom.metadata !== beginWrite)
          await settleMetadata(currentRoom, guard);
        beginWrite ??= createSessionMetadataWrite(options.repository, {
          kind: 'beginEnding',
          input: { ...metadata, expectedRevision: currentRoom.revision, at: new Date(clock()) },
        });
        await metadataResult(currentRoom, beginWrite, guard);
      },
      completeEnding: async (guard) => {
        completeWrite ??= createSessionMetadataWrite(options.repository, {
          kind: 'completeEnding',
          input: { ...metadata, expectedRevision: currentRoom.revision, at: new Date(clock()) },
        });
        await metadataResult(currentRoom, completeWrite, guard);
      },
      finalize: (guard) =>
        options.coordinator.run({ workspaceId: destination.workspaceId }, async () => {
          guard();
          currentRoom.state.state = 'ENDED';
          currentRoom.state.hostParticipantId = null;
          for (const value of owners)
            if (ownerships.get(value.participant.auth.userId) === value)
              ownerships.delete(value.participant.auth.userId);
          if (rooms.get(destination.channelId) === currentRoom) rooms.delete(destination.channelId);
        }),
    });
    const accepted = {
      binding,
      command: JSON.stringify(input),
      operation,
      expiresAt: Number.POSITIVE_INFINITY,
      destination,
    };
    endRecords.set(key, accepted);
    return accepted;
  }

  function registryFailure(routerIds: readonly string[]) {
    assertRunning();
    if (
      !Array.isArray(routerIds) ||
      routerIds.length > limits.maxRooms + 32 ||
      routerIds.some((value) => typeof value !== 'string' || !value || value.length > 256)
    )
      fail('VALIDATION_ERROR');
    if (new Set([...failedRouters, ...routerIds]).size > limits.maxRooms + 32) fail('SERVER_BUSY');
    for (const id of routerIds) failedRouters.add(id);
    const failed = new Set(routerIds);
    const affected = [...rooms.values()].filter((room) => failed.has(room.router.id));
    for (const room of affected) {
      room.mediaFailed = true;
      for (const intent of [...intents.values()]) if (intent.room === room) forget(intent);
    }
    const jobs = affected.map((room) => {
      if (!room.failureTask) {
        const timing = createSessionTransitionTiming();
        room.failureTask = options.coordinator
          .run(
            { workspaceId: room.state.workspaceId },
            async (held) => {
              assertRunning();
              if (rooms.get(room.state.channelId) !== room) return undefined;
              // A completed replay no longer occupies admission after its TTL.
              // Sweep inside the gate too: waiting for it may cross that TTL.
              sweep();
              const key = JSON.stringify([room.state.sessionId, room.state.epoch]);
              const existing = endRecords.get(key);
              if (existing) return existing;
              const adapters = options.endCleanup;
              if (
                !adapters ||
                typeof adapters.messaging !== 'function' ||
                typeof adapters.board !== 'function' ||
                !(
                  typeof adapters.media === 'function' ||
                  (adapters.media && typeof adapters.media.revoke === 'function')
                ) ||
                room.state.state !== 'ACTIVE' ||
                endRecords.size >= limits.maxEndRecords ||
                room.state.policyRevision >= Number.MAX_SAFE_INTEGER
              )
                return undefined;
              const owner = [...ownerships.values()].find((value) => value.room === room);
              // Reservation-only rooms still need scope cleanup and durable end. No auth
              // authority is invented: this is a server lifecycle action, not a host command.
              return acceptRoomEnd(
                room,
                null,
                {
                  requestId: randomUUID(),
                  sessionId: room.state.sessionId,
                  epoch: room.state.epoch,
                  callGeneration: owner?.participant.callGeneration ?? 1,
                  expectedPolicyRevision: room.state.policyRevision,
                  action: 'END',
                },
                timing,
                held,
                adapters,
              );
            },
            { waitTimeoutMs: 2000 },
          )
          .then(async (record) => {
            if (!record) return 'PENDING' as const;
            const result = await record.operation.run();
            if ('data' in result && result.data.status === 'completed') {
              if (record.expiresAt === Number.POSITIVE_INFINITY)
                record.expiresAt = clock() + limits.endReplayTtlMs;
              return 'ENDED' as const;
            }
            return 'PENDING' as const;
          })
          .catch(() => 'PENDING' as const);
      }
      return room.failureTask.then((state) => ({
        sessionId: room.state.sessionId,
        epoch: room.state.epoch,
        state,
      }));
    });
    return Promise.all(jobs);
  }

  return {
    stats: () => ({
      rooms: rooms.size,
      ownerships: ownerships.size,
      intents: intents.size,
      pendingRouters: pendingRouters.size,
      creatingRooms: creatingRooms.size,
      pendingOwnerships: joiningUsers.size,
      queued,
      revocations: revocations.size,
      endRecords: endRecords.size,
      uncertainRooms: [...rooms.values()].filter((room) => room.uncertain).length,
    }),

    // Trusted socket lifecycle callback; never accept a client-supplied socket id.
    async disconnect(socketId: string) {
      assertRunning();
      const owner = [...ownerships.values()].find((value) => value.binding.socketId === socketId);
      if (!owner) return;
      if (owner.reconnect) return owner.reconnect.task ?? owner.reconnect.retryCleanup?.();
      const { participant, room } = owner;
      const record: NonNullable<Ownership['reconnect']> = {
        deadline: clock() + limits.reconnectGraceMs,
        generation: participant.callGeneration,
      };
      owner.reconnect = record;
      participant.connected = false;
      if (
        participant.audienceEpoch >= Number.MAX_SAFE_INTEGER ||
        room.state.policyRevision >= Number.MAX_SAFE_INTEGER
      ) {
        room.uncertain = true;
        fail('SERVER_BUSY');
      }
      participant.audienceEpoch++;
      room.state.policyRevision++;
      const adapters = options.reconnectCleanup;
      if (!adapters || typeof adapters.media === 'function') fail('DEPENDENCY_UNAVAILABLE');
      const request: SessionCleanupRequest = {
        operationId: randomUUID(),
        sessionId: room.state.sessionId,
        epoch: room.state.epoch,
        transitionToken: randomUUID(),
        callGeneration: record.generation,
        target: { type: 'PARTICIPANT', participantId: participant.participantId },
        reason: 'DISCONNECTED',
      };
      // Fence/close media before waiting for a gate; beginSessionTransition consumes
      // the same result rather than issuing a second native revoke.
      let mediaResult: ReturnType<typeof adapters.media.revoke>;
      try {
        mediaResult = adapters.media.revoke(structuredClone(request));
      } catch {
        fail('DEPENDENCY_UNAVAILABLE');
      }
      const timing = createSessionTransitionTiming();
      record.retryCleanup = () => {
        const task = (async () => {
          // Retry only acquisition failures, before a cleanup handle exists. A
          // callback retry reuses this record, request and synchronous media result.
          for (let attempt = 0; ; attempt++) {
            try {
              await options.coordinator.run(
                { workspaceId: room.state.workspaceId },
                async (held) => {
                  if (
                    closed ||
                    ownerships.get(participant.auth.userId) !== owner ||
                    owner.reconnect !== record ||
                    participant.callGeneration !== record.generation ||
                    room.state.state !== 'ACTIVE'
                  )
                    fail('CONFLICT');
                  record.handle = beginSessionTransition(
                    request,
                    {
                      assertHeld: () => held.assertHeld({ workspaceId: room.state.workspaceId }),
                      isCurrent: () =>
                        !closed &&
                        ownerships.get(participant.auth.userId) === owner &&
                        owner.reconnect === record &&
                        participant.callGeneration === record.generation,
                    },
                    { ...adapters, media: { revoke: () => mediaResult } },
                    {
                      userId: participant.auth.userId,
                      timing,
                    },
                  );
                },
                { waitTimeoutMs: 2000 },
              );
              break;
            } catch (error) {
              if (
                record.handle ||
                !(error instanceof CoordinationError) ||
                !['TIMEOUT', 'BUSY'].includes(error.code) ||
                attempt >= 2
              )
                throw error;
            }
          }
          await record.handle!.runForeground();
          return record.handle!.reconcile();
        })().catch((error: unknown) => {
          if (!record.handle) delete record.task;
          throw error;
        });
        record.task = task;
        return task;
      };
      return record.retryCleanup();
    },

    async resume(rawBinding: Binding, raw: unknown) {
      assertRunning();
      const input = sessionResumeInputSchema.parse(raw);
      const auth = identity(rawBinding.auth);
      const binding = { ...rawBinding, auth };
      if (!binding.socketId || binding.socketId.length > 256) fail('VALIDATION_ERROR');
      const owner = ownerships.get(auth.userId);
      if (!owner || owner.participant.auth.authSessionId !== auth.authSessionId) fail('CONFLICT');
      const digest = hash(input.resumeTicket);
      const replay = owner.resumeReplay;
      const isReplay =
        !!replay &&
        replay.digest === digest &&
        replay.requestId === input.requestId &&
        replay.socketId === binding.socketId &&
        replay.generation === input.callGeneration &&
        !owner.reconnect;
      const record = owner.reconnect;
      // Preserve one lost-ACK intent across a subsequent REAL disconnect. It may
      // never move an ownership that is still connected to another socket.
      const hasResumeGrant = () =>
        (record?.generation === input.callGeneration && hash(owner.resumeTicket) === digest) ||
        (!!record &&
          !!replay &&
          owner.resumeReplay === replay &&
          replay.digest === digest &&
          replay.requestId === input.requestId &&
          replay.generation === input.callGeneration &&
          record.generation === owner.participant.callGeneration);
      if (!isReplay && (!record || !hasResumeGrant() || clock() >= record.deadline))
        fail('CONFLICT');
      if (record) await (record.task ?? record.retryCleanup?.());
      const destination = {
        workspaceId: owner.room.state.workspaceId,
        channelId: owner.room.state.channelId,
      };
      return run(auth, destination, async (held) => {
        if (
          ownerships.get(auth.userId) !== owner ||
          !binding.isConnected() ||
          owner.room.state.sessionId !== input.sessionId ||
          owner.room.state.epoch !== input.epoch
        )
          fail('CONFLICT');
        usable(owner.room);
        let current: Authority;
        try {
          current = await authority(auth, destination, held);
        } catch (error) {
          if (
            error instanceof MainJoinError &&
            ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(error.code)
          ) {
            blockPeer(owner.room, owner.participant);
            owner.resumeTicket = '';
          }
          throw error;
        }
        const previousAccess = owner.participant.access;
        if (
          owner.participant.blocked ||
          current.access.membershipId !== previousAccess.membershipId ||
          current.access.membershipIncarnation !== previousAccess.membershipIncarnation ||
          current.access.membershipRevision < previousAccess.membershipRevision ||
          current.access.channelRevision < previousAccess.channelRevision ||
          !currentFence(current, held, previousAccess)
        ) {
          blockPeer(owner.room, owner.participant);
          owner.resumeTicket = '';
          fail('FORBIDDEN');
        }
        usable(owner.room);
        if (!binding.isConnected()) fail('CONFLICT');
        const latestReplay = owner.resumeReplay;
        if (
          latestReplay &&
          !owner.reconnect &&
          latestReplay.digest === digest &&
          latestReplay.requestId === input.requestId &&
          latestReplay.socketId === binding.socketId &&
          latestReplay.generation === input.callGeneration &&
          owner.binding.socketId === binding.socketId
        ) {
          return delivery(owner, input.requestId, held);
        }
        if (
          !record ||
          owner.reconnect !== record ||
          clock() >= record.deadline ||
          owner.participant.callGeneration !== record.generation ||
          !hasResumeGrant()
        )
          fail('CONFLICT');
        const cleanup = record.handle?.inspect();
        if (!cleanup?.permissionRevoked || !cleanup.pendingInvalidated)
          fail('DEPENDENCY_UNAVAILABLE');
        if (
          nextGeneration >= Number.MAX_SAFE_INTEGER ||
          owner.room.state.policyRevision >= Number.MAX_SAFE_INTEGER
        )
          fail('SERVER_BUSY');
        const committed = record.handle!.commitHeld(
          {
            assertHeld: () =>
              held.assertHeld({ userId: auth.userId, workspaceId: destination.workspaceId }),
            isCurrent: () =>
              !closed &&
              owner.reconnect === record &&
              ownerships.get(auth.userId) === owner &&
              clock() < record.deadline &&
              binding.isConnected() &&
              !owner.participant.blocked &&
              currentFence(current, held, owner.participant.access),
          },
          () => {
            owner.binding = binding;
            owner.participant.auth = current.auth;
            owner.participant.access = { ...current.access };
            owner.participant.currentAccess = { ...current.access };
            owner.participant.callGeneration = ++nextGeneration;
            owner.participant.scope = { type: 'MAIN' };
            owner.participant.connected = true;
            owner.resumeReplay = {
              digest,
              requestId: input.requestId,
              socketId: binding.socketId,
              generation: input.callGeneration,
            };
            owner.resumeTicket = randomBytes(32).toString('base64url');
            delete owner.reconnect;
            owner.room.state.policyRevision++;
            return true;
          },
        );
        if (!committed.ok) fail(committed.errorCode);
        return delivery(owner, input.requestId, held);
      });
    },

    async resync(rawBinding: Binding, raw: unknown) {
      assertRunning();
      const input = sessionResyncInputSchema.parse(raw);
      const auth = identity(rawBinding.auth);
      const owner = ownerships.get(auth.userId);
      if (!owner) fail('CONFLICT');
      return run(
        auth,
        { workspaceId: owner.room.state.workspaceId, channelId: owner.room.state.channelId },
        async (held) => {
          if (
            ownerships.get(auth.userId) !== owner ||
            owner.reconnect ||
            owner.binding.socketId !== rawBinding.socketId ||
            !rawBinding.isConnected() ||
            owner.participant.auth.authSessionId !== auth.authSessionId ||
            owner.room.state.sessionId !== input.sessionId ||
            owner.room.state.epoch !== input.epoch ||
            owner.participant.callGeneration !== input.callGeneration
          )
            fail('CONFLICT');
          usable(owner.room);
          const result = await delivery(owner, input.requestId, held);
          return {
            parts: result.parts,
            ack: sessionResyncAckSchema.parse({
              requestId: input.requestId,
              data: { status: 'completed', result: result.ack.data.result.snapshot },
            }),
          };
        },
      );
    },

    async issue(rawAuth: AuthenticatedContext, rawTarget: Target, raw: unknown) {
      const timing = createSessionTransitionTiming();
      const deadline = clock() + 10_000;
      const auth = identity(rawAuth);
      const destination = target(rawTarget);
      const input = sessionJoinTicketInputSchema.parse(raw);
      for (let pass = 0; pass < 2; pass++) {
        if (clock() >= deadline) fail('DEPENDENCY_UNAVAILABLE');
        const outcome = await run(auth, destination, async (held) => {
          deadlines.set(held, deadline);
          sweep();
          const current = await authority(auth, destination, held);
          const pendingRoom = rooms.get(destination.channelId);
          if (pendingRoom?.metadata) await settleMetadata(pendingRoom);
          if (clock() >= deadline) fail('DEPENDENCY_UNAVAILABLE');
          const key = JSON.stringify([auth.userId, auth.authSessionId, input.requestId]);
          const existing = intents.get(key);
          if (existing) {
            if (existing.failed) fail('CONFLICT');
            if (existing.expiresAt <= clock()) {
              forget(existing);
              fail('VALIDATION_ERROR');
            }
            if (
              !sameStamp(existing.authority.access, current.access) ||
              existing.room.state.channelId !== destination.channelId
            )
              fail('CONFLICT');
            usable(existing.room);
            if (existing.consumed) fail('CONFLICT');
            return {
              sessionId: existing.room.state.sessionId,
              epoch: existing.room.state.epoch,
              ticket: existing.token,
              expiresAt: new Date(existing.expiresAt).toISOString(),
            };
          }
          if (
            intents.size >= limits.maxIntents ||
            [...intents.values()].filter((i) => i.authority.auth.userId === auth.userId).length >=
              limits.perUserIntents
          )
            fail('SERVER_BUSY');
          if (clock() >= deadline) fail('DEPENDENCY_UNAVAILABLE');
          const ending = retireOrphan(rooms.get(destination.channelId), held, timing);
          if (ending) return { ending };
          let room = rooms.get(destination.channelId);
          if (!room) {
            if (rooms.size + creatingRooms.size >= limits.maxRooms) fail('SERVER_BUSY');
            creatingRooms.add(destination.channelId);
            const sessionId = new Types.ObjectId();
            const participantId = new Types.ObjectId();
            const epoch = randomUUID();
            let router: MediaTypes.Router;
            try {
              router = await makeRouter(destination.channelId);
            } catch (error) {
              creatingRooms.delete(destination.channelId);
              throw error;
            }
            try {
              const afterRouter = await authority(auth, destination, held);
              if (!sameStamp(current.access, afterRouter.access)) fail('CONFLICT');
              room = {
                router,
                revision: 0,
                hostUserId: auth.userId,
                hostParticipantId: participantId.toHexString(),
                hostReservation: afterRouter,
                uncertain: false,
                joinAttempted: false,
                state: {
                  sessionId: sessionId.toHexString(),
                  workspaceId: destination.workspaceId,
                  channelId: destination.channelId,
                  epoch,
                  state: 'ACTIVE',
                  phase: 'GUIDANCE',
                  policyRevision: 0,
                  hostParticipantId: participantId.toHexString(),
                  helpingGroupId: null,
                  round: null,
                  participants: new Map(),
                  groups: new Map(),
                },
              };
              const at = new Date(clock());
              try {
                await metadataResult(
                  room,
                  createSessionMetadataWrite(options.repository, {
                    kind: 'create',
                    input: {
                      sessionId,
                      workspaceId: new Types.ObjectId(destination.workspaceId),
                      channelId: new Types.ObjectId(destination.channelId),
                      epoch,
                      hostUserId: new Types.ObjectId(auth.userId),
                      participantId,
                      at,
                    },
                  }),
                );
              } catch {
                // Never infer rollback or adopt a prior durable session after a write error.
                room.uncertain = true;
                if (!closed) rooms.set(destination.channelId, room);
                fail('DEPENDENCY_UNAVAILABLE');
              }
              assertRunning();
              rooms.set(destination.channelId, room);
              if (failedRouters.has(room.router.id)) {
                room.mediaFailed = true;
                fail('DEPENDENCY_UNAVAILABLE');
              }
            } catch (error) {
              router.close();
              throw error;
            } finally {
              creatingRooms.delete(destination.channelId);
            }
          }
          if (room.state.workspaceId !== destination.workspaceId) fail('CONFLICT');
          usable(room);
          const afterWrite = await authority(auth, destination, held);
          if (!sameStamp(current.access, afterWrite.access)) fail('CONFLICT');
          usable(room);
          if (intents.size >= limits.maxIntents) fail('SERVER_BUSY');
          if ([...intents.values()].filter((i) => i.room === room).length >= limits.perRoomIntents)
            fail('SERVER_BUSY');
          const token = randomBytes(32).toString('base64url');
          const intent: Intent = {
            key,
            digest: hash(token),
            token,
            room,
            authority: afterWrite,
            expiresAt: clock() + limits.ticketTtlMs,
          };
          intents.set(key, intent);
          tickets.set(intent.digest, intent);
          return {
            sessionId: room.state.sessionId,
            epoch: room.state.epoch,
            ticket: token,
            expiresAt: new Date(intent.expiresAt).toISOString(),
          };
        });
        if ('ending' in outcome) {
          const result = await outcome.ending.operation.run();
          if (!('data' in result) || result.data.status !== 'completed')
            fail('DEPENDENCY_UNAVAILABLE');
          outcome.ending.expiresAt = clock() + limits.endReplayTtlMs;
        } else return outcome;
      }
      fail('DEPENDENCY_UNAVAILABLE');
    },

    async join(rawBinding: Binding, raw: unknown) {
      const input = sessionJoinInputSchema.parse(raw);
      const auth = identity(rawBinding.auth);
      const binding: Binding = {
        auth,
        socketId: rawBinding.socketId,
        isConnected: rawBinding.isConnected,
      };
      if (!binding.socketId || binding.socketId.length > 256) fail('VALIDATION_ERROR');
      const intent = tickets.get(hash(input.ticket));
      if (!intent || intent.expiresAt <= clock()) {
        if (intent) forget(intent);
        fail('VALIDATION_ERROR');
      }
      const destination = {
        workspaceId: intent.room.state.workspaceId,
        channelId: intent.room.state.channelId,
      };
      return run(auth, destination, async (held) => {
        const current = await authority(auth, destination, held);
        if (!binding.isConnected()) fail('CONFLICT');
        if (tickets.get(intent.digest) !== intent || intent.expiresAt <= clock())
          fail('VALIDATION_ERROR');
        if (intent.failed) fail('CONFLICT');
        if (
          intent.authority.auth.userId !== auth.userId ||
          intent.authority.auth.authSessionId !== auth.authSessionId
        )
          fail('FORBIDDEN');
        usable(intent.room);
        const owned = ownerships.get(auth.userId);
        if (intent.consumed) {
          if (
            intent.consumed.ownership !== owned ||
            owned.binding.socketId !== binding.socketId ||
            intent.consumed.requestId !== input.requestId ||
            input.takeover
          )
            fail('CONFLICT');
          return delivery(owned, input.requestId, held);
        }
        if (!sameStamp(intent.authority.access, current.access)) fail('CONFLICT');
        // Full takeover waits for old-generation cleanup/end (SCRUM-83/86).
        // A confirmation never bypasses that barrier in this minimal registry.
        if (owned) {
          // A fresh ticket may recover the SAME socket/epoch after an earlier ack
          // failed and its replay ticket expired. Never transfer a different call.
          if (
            input.takeover ||
            owned.room !== intent.room ||
            owned.binding.socketId !== binding.socketId ||
            owned.participant.auth.authSessionId !== auth.authSessionId
          )
            fail('CALL_ALREADY_ACTIVE');
          intent.consumed = { ownership: owned, requestId: input.requestId };
          return delivery(owned, input.requestId, held);
        }
        if (input.takeover) fail('CONFLICT');
        if (
          ownerships.size + joiningUsers.size >= limits.maxOwnerships ||
          nextGeneration >= Number.MAX_SAFE_INTEGER ||
          intent.room.state.policyRevision >= Number.MAX_SAFE_INTEGER
        )
          fail('SERVER_BUSY');
        joiningUsers.add(auth.userId);
        try {
          const room = intent.room;
          const reservedHost =
            room.hostUserId === auth.userId && reservedHostCurrent(room, current, held);
          if (room.hostUserId === auth.userId && room.hostReservation && !reservedHost)
            clearHostReservation(room);
          const participantId = reservedHost
            ? room.hostParticipantId
            : new Types.ObjectId().toHexString();
          let participant: PolicyParticipant = {
            participantId,
            displayName: current.displayName,
            auth: current.auth,
            access: current.access,
            currentAccess: current.access,
            callGeneration: ++nextGeneration,
            audienceEpoch: 0,
            connected: true,
            blocked: false,
            scope: { type: 'MAIN' as const },
          };
          const owner: Ownership = {
            binding,
            room,
            participant,
            resumeTicket: randomBytes(32).toString('base64url'),
          };
          // Persist first. No runtime rights are exposed by metadata alone.
          room.joinAttempted = true;
          try {
            const saved = await metadataResult(
              room,
              createSessionMetadataWrite(options.repository, {
                kind: 'join',
                input: {
                  sessionId: new Types.ObjectId(room.state.sessionId),
                  epoch: room.state.epoch,
                  expectedRevision: room.revision,
                  userId: new Types.ObjectId(auth.userId),
                  participantId: new Types.ObjectId(participantId),
                  at: new Date(clock()),
                },
              }),
            );
            room.revision = saved.revision;
            participant = { ...participant, participantId: saved.participantId!.toHexString() };
            owner.participant = participant;
          } catch {
            intent.failed = true;
            room.uncertain = true;
            fail('DEPENDENCY_UNAVAILABLE');
          }
          // Keep this intent spent even when authority disappears after commit.
          intent.consumed = { ownership: owner, requestId: input.requestId };
          const confirmed = await authority(auth, destination, held);
          usable(room);
          if (
            !sameStamp(current.access, confirmed.access) ||
            !binding.isConnected() ||
            intent.expiresAt <= clock()
          )
            fail('CONFLICT');
          participant.auth = confirmed.auth;
          if (reservedHost && !reservedHostCurrent(room, confirmed, held)) {
            clearHostReservation(room);
            fail('CONFLICT');
          }
          const participants = new Map(room.state.participants);
          if (room.state.policyRevision >= Number.MAX_SAFE_INTEGER) fail('SERVER_BUSY');
          participants.set(participant.participantId, participant);
          const previous = room.state;
          room.state = { ...previous, participants, policyRevision: previous.policyRevision + 1 };
          ownerships.set(auth.userId, owner);
          if (participant.participantId === room.hostParticipantId) room.hostReservation = null;
          // Snapshot/provider failures do not revoke the committed ownership. Retry the
          // same consumed intent revalidates all authority without writing DB again.
          return await delivery(owner, input.requestId, held);
        } finally {
          joiningUsers.delete(auth.userId);
        }
      });
    },

    // Trusted M1 -> M4 port, never a socket event. M1 commits its own deny/version
    // fence before calling; the local record also fences I/O already in flight.
    async revoke(raw: unknown) {
      assertRunning();
      const parsed = liveAccessRevocationSchema.parse(raw);
      const event = liveAccessRevocationSchema.parse(
        Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            typeof value === 'string' && key.endsWith('Id') ? value.toLowerCase() : value,
          ]),
        ),
      );
      const command = JSON.stringify(event);
      sweep();
      const previous = revocations.get(event.operationId);
      if (previous) {
        if (previous.command !== command) fail('CONFLICT');
        return structuredClone(await previous.task!);
      }
      const adapters = options.revocationCleanup;
      if (
        !adapters ||
        typeof adapters.messaging !== 'function' ||
        typeof adapters.board !== 'function' ||
        !(
          typeof adapters.media === 'function' ||
          (adapters.media && typeof adapters.media.revoke === 'function')
        )
      )
        fail('DEPENDENCY_UNAVAILABLE');
      if (revocations.size >= limits.maxRevocations) fail('SERVER_BUSY');
      const authSessions = new Set<string>();
      if (event.kind === 'USER_AUTH_SESSIONS') {
        try {
          const cohort = options.revokedAuthSessions?.(event);
          if (!Array.isArray(cohort) || cohort.length > limits.maxIntents)
            fail('DEPENDENCY_UNAVAILABLE');
          for (const value of cohort)
            authSessions.add(workspaceDocumentIdSchema.parse(value).toLowerCase());
        } catch {
          fail('DEPENDENCY_UNAVAILABLE');
        }
      }
      const record: Revocation = {
        event,
        authSessions,
        command,
        expiresAt: Number.POSITIVE_INFINITY,
      };
      const outstanding = new Set(
        [...inFlight]
          .filter(([, binding]) => mayMatchMainRevocation(event, binding.auth, binding.target))
          .map(([key]) => key),
      );
      const timing = createSessionTransitionTiming();
      const token = randomUUID();
      revocations.set(event.operationId, record);
      const matches = (auth: AuthenticatedContext, access: ChannelAccessStamp) =>
        matchesMainRevocation(event, auth, access, authSessions);
      const execute = async (): Promise<AccessCleanupResult> => {
        const captured: {
          owner: Ownership;
          generation: number;
          participantId: string;
          epoch: string;
          handle: ReturnType<typeof beginSessionTransition>;
        }[] = [];
        const workspaces = [
          ...new Set([
            ...[...ownerships.values()]
              .filter((owner) => matches(owner.participant.auth, owner.participant.access))
              .map((owner) => owner.room.state.workspaceId),
            ...[...intents.values()]
              .filter((intent) => matches(intent.authority.auth, intent.authority.access))
              .map((intent) => intent.room.state.workspaceId),
            ...[...rooms.values()]
              .filter(
                (room) =>
                  room.hostReservation &&
                  matches(room.hostReservation.auth, room.hostReservation.access),
              )
              .map((room) => room.state.workspaceId),
          ]),
        ].sort();
        const preparations = await Promise.allSettled(
          workspaces.map((workspaceId) =>
            options.coordinator.run(
              { workspaceId },
              async (held) => {
                assertRunning();
                for (const intent of [...intents.values()]) {
                  if (
                    intent.room.state.workspaceId !== workspaceId ||
                    !matches(intent.authority.auth, intent.authority.access)
                  )
                    continue;
                  forget(intent);
                }
                for (const room of rooms.values()) {
                  if (
                    room.state.workspaceId !== workspaceId ||
                    !room.hostReservation ||
                    !matches(room.hostReservation.auth, room.hostReservation.access)
                  )
                    continue;
                  room.hostReservation = null;
                  room.state.hostParticipantId = null;
                  if (room.state.policyRevision < Number.MAX_SAFE_INTEGER)
                    room.state.policyRevision++;
                  else room.uncertain = true;
                }
                for (const owner of ownerships.values()) {
                  const { participant, room } = owner;
                  if (
                    room.state.workspaceId !== workspaceId ||
                    !matches(participant.auth, participant.access)
                  )
                    continue;
                  participant.blocked = true;
                  participant.currentAccess = {
                    ...participant.currentAccess,
                    canReadContent: false,
                  };
                  if (room.state.policyRevision < Number.MAX_SAFE_INTEGER)
                    room.state.policyRevision++;
                  else room.uncertain = true;
                  if (room.state.hostParticipantId === participant.participantId)
                    room.state.hostParticipantId = null;
                  const request = {
                    operationId: event.operationId,
                    sessionId: room.state.sessionId,
                    epoch: room.state.epoch,
                    transitionToken: token,
                    callGeneration: participant.callGeneration,
                    target: {
                      type: 'PARTICIPANT' as const,
                      participantId: participant.participantId,
                    },
                    reason: 'ACCESS_REVOKED' as const,
                  };
                  const handle = beginSessionTransition(
                    request,
                    {
                      assertHeld: () => held.assertHeld({ workspaceId }),
                      isCurrent: () =>
                        !closed &&
                        ownerships.get(participant.auth.userId) === owner &&
                        participant.callGeneration === request.callGeneration &&
                        participant.participantId === request.target.participantId &&
                        room.state.epoch === request.epoch &&
                        participant.blocked,
                    },
                    adapters,
                    { userId: participant.auth.userId, timing },
                  );
                  captured.push({
                    owner,
                    handle,
                    generation: request.callGeneration,
                    participantId: request.target.participantId,
                    epoch: request.epoch,
                  });
                }
              },
              {
                waitTimeoutMs: Math.max(
                  1,
                  Math.min(2000, Math.floor(timing.deadlineMs - performance.now())),
                ),
              },
            ),
          ),
        );
        const outcomes = await Promise.all(captured.map((value) => value.handle.runForeground()));
        let permissionRevoked =
          preparations.every((value) => value.status === 'fulfilled') &&
          outcomes.every((value) => value.permissionRevoked && value.pendingInvalidated);
        if (permissionRevoked && !closed && performance.now() < timing.deadlineMs) {
          await Promise.all(
            workspaces.map((workspaceId) =>
              options.coordinator.run(
                { workspaceId },
                async () => {
                  if (closed || performance.now() >= timing.deadlineMs)
                    throw new MainJoinError('DEPENDENCY_UNAVAILABLE');
                  for (const { owner, generation, participantId, epoch } of captured) {
                    if (
                      owner.room.state.workspaceId !== workspaceId ||
                      ownerships.get(owner.participant.auth.userId) !== owner ||
                      owner.participant.callGeneration !== generation ||
                      owner.participant.participantId !== participantId ||
                      owner.room.state.epoch !== epoch
                    )
                      continue;
                    ownerships.delete(owner.participant.auth.userId);
                    const participants = new Map(owner.room.state.participants);
                    participants.delete(owner.participant.participantId);
                    owner.room.state.participants = participants;
                  }
                },
                {
                  waitTimeoutMs: Math.max(
                    1,
                    Math.min(2000, Math.floor(timing.deadlineMs - performance.now())),
                  ),
                },
              ),
            ),
          );
        } else permissionRevoked = false;
        if (closed) permissionRevoked = false;
        return {
          operationId: event.operationId,
          permissionRevoked,
          pendingInvalidated: permissionRevoked,
          cleanupPending:
            !permissionRevoked ||
            outcomes.some((value) => value.cleanupPending) ||
            [...outstanding].some((key) => inFlight.has(key)),
        };
      };
      record.task = execute()
        .catch(() => ({
          operationId: event.operationId,
          permissionRevoked: false,
          pendingInvalidated: false,
          cleanupPending: true,
        }))
        .then((value) => {
          if (value.permissionRevoked && value.pendingInvalidated)
            record.expiresAt = clock() + limits.revocationReplayTtlMs;
          return accessCleanupResultSchema.parse(value);
        });
      return structuredClone(await record.task);
    },

    async end(rawBinding: Binding, raw: unknown) {
      const timing = createSessionTransitionTiming();
      const input = sessionEndInputSchema.parse(raw);
      const auth = identity(rawBinding.auth);
      if (!rawBinding.socketId || rawBinding.socketId.length > 256) fail('VALIDATION_ERROR');
      const key = JSON.stringify([input.sessionId, input.epoch]);
      const owned = ownerships.get(auth.userId);
      const replay = endRecords.get(key);
      const room = owned?.room;
      // Replay after completion has no ownership; retain only bounded operation metadata.
      const destination =
        room?.state.sessionId === input.sessionId && room.state.epoch === input.epoch
          ? { workspaceId: room.state.workspaceId, channelId: room.state.channelId }
          : replay
            ? replay.destination
            : undefined;
      if (!destination) fail('CONFLICT');
      const record = await run(auth, destination, async (held) => {
        sweep();
        await authority(auth, destination, held);
        if (!rawBinding.isConnected()) fail('CONFLICT');
        const previous = endRecords.get(key);
        if (previous) {
          if (previous.expiresAt <= clock()) {
            endRecords.delete(key);
            fail('CONFLICT');
          }
          if (
            !previous.binding ||
            previous.binding.auth.userId !== auth.userId ||
            previous.binding.auth.authSessionId !== auth.authSessionId ||
            previous.binding.socketId !== rawBinding.socketId ||
            previous.command !== JSON.stringify(input)
          )
            fail('CONFLICT');
          return previous;
        }
        const owner = ownerships.get(auth.userId);
        if (
          !owner ||
          owner.binding.socketId !== rawBinding.socketId ||
          owner.participant.auth.authSessionId !== auth.authSessionId ||
          owner.room.state.sessionId !== input.sessionId ||
          owner.room.state.epoch !== input.epoch ||
          owner.participant.callGeneration !== input.callGeneration
        )
          fail('CONFLICT');
        const currentRoom = owner.room;
        usable(currentRoom);
        await refreshPeers(currentRoom, held);
        const current = await authority(auth, destination, held);
        usable(currentRoom);
        fencePeers(currentRoom, held);
        const policy = resolveSessionPolicyContext(policyInput(owner, current));
        if (!policy.ok) fail(policy.errorCode);
        if (policy.context.role !== 'HOST') fail('FORBIDDEN');
        if (currentRoom.state.policyRevision !== input.expectedPolicyRevision) fail('CONFLICT');
        const adapters = options.endCleanup;
        if (
          !adapters ||
          typeof adapters.messaging !== 'function' ||
          typeof adapters.board !== 'function' ||
          !(
            typeof adapters.media === 'function' ||
            (adapters.media && typeof adapters.media.revoke === 'function')
          )
        )
          fail('DEPENDENCY_UNAVAILABLE');
        if (
          endRecords.size >= limits.maxEndRecords ||
          currentRoom.state.policyRevision >= Number.MAX_SAFE_INTEGER
        )
          fail('SERVER_BUSY');
        return acceptRoomEnd(currentRoom, { ...rawBinding, auth }, input, timing, held, adapters);
      });
      const result = await record.operation.run();
      if (
        'data' in result &&
        result.data.status === 'completed' &&
        record.expiresAt === Number.POSITIVE_INFINITY
      )
        record.expiresAt = clock() + limits.endReplayTtlMs;
      return structuredClone(result);
    },

    // Trusted worker lifecycle port. Install deny synchronously, before any gate await.
    // The caller supplies IDs from the failed runtime, never from a client payload.
    handleRouterFailure: registryFailure,

    async withContext<T>(
      socketId: string,
      input: Omit<LiveContextRequest, 'auth'>,
      use: (
        resolved: LiveContextResult,
        router?: MediaTypes.Router,
        policy?: SessionPolicyInput,
      ) => T,
    ): Promise<T> {
      const owner = [...ownerships.values()].find((value) => value.binding.socketId === socketId);
      if (!owner) return use({ ok: false, errorCode: 'CONFLICT' });
      return run(
        owner.participant.auth,
        { workspaceId: owner.room.state.workspaceId, channelId: owner.room.state.channelId },
        async (held) => {
          if (
            ownerships.get(owner.participant.auth.userId) !== owner ||
            input.sessionId !== owner.room.state.sessionId ||
            input.epoch !== owner.room.state.epoch ||
            input.callGeneration !== owner.participant.callGeneration
          )
            return use({ ok: false, errorCode: 'CONFLICT' });
          usable(owner.room);
          await refreshPeers(owner.room, held);
          const current = await authority(
            owner.participant.auth,
            { workspaceId: owner.room.state.workspaceId, channelId: owner.room.state.channelId },
            held,
          );
          usable(owner.room);
          fencePeers(owner.room, held);
          const policy = policyInput(owner, current);
          const resolved = resolveSessionPolicyContext(policy);
          const result = use(
            resolved,
            resolved.ok ? owner.room.router : undefined,
            resolved.ok ? policy : undefined,
          );
          if (result && typeof (result as { then?: unknown }).then === 'function')
            throw new TypeError('Context use must be synchronous');
          return result;
        },
      );
    },

    // Composition calls periodically. Workspace-only cleanup never acquires a User gate.
    async sweepExpired() {
      sweep();
      for (const room of [...rooms.values()]) {
        if (room.state.state === 'ACTIVE' && room.metadata) {
          try {
            await options.coordinator.run({ workspaceId: room.state.workspaceId }, async () => {
              await settleMetadata(room, () => {
                if (closed || rooms.get(room.state.channelId) !== room) fail('CONFLICT');
              });
            });
          } catch {
            continue;
          }
        }
        // A socket may emit disconnect only once. Recover preparation failures
        // through the periodic sweep, including after grace, without awaiting
        // cleanup I/O under a Workspace gate or renewing the resume deadline.
        for (const owner of [...ownerships.values()]) {
          const record = owner.reconnect;
          if (
            closed ||
            owner.room !== room ||
            room.state.state !== 'ACTIVE' ||
            !record ||
            record.handle ||
            record.task ||
            !record.retryCleanup
          )
            continue;
          try {
            await record.retryCleanup();
          } catch (error) {
            if (error instanceof CoordinationError && ['BUSY', 'TIMEOUT'].includes(error.code))
              continue;
            if (
              error instanceof MainJoinError &&
              error.code === 'CONFLICT' &&
              (ownerships.get(owner.participant.auth.userId) !== owner ||
                owner.reconnect !== record ||
                owner.participant.callGeneration !== record.generation ||
                room.state.state !== 'ACTIVE')
            )
              continue;
            throw error;
          }
        }
        let ending: EndRecord | undefined;
        try {
          ending = await options.coordinator.run(
            { workspaceId: room.state.workspaceId },
            async (held) => {
              held.assertHeld({ workspaceId: room.state.workspaceId });
              expireConnections(room);
              if (!closed && rooms.get(room.state.channelId) === room)
                return retireOrphan(room, held);
              return undefined;
            },
          );
        } catch (error) {
          // Admission for this orphan must not starve already accepted end
          // records later in the sweep. Their replay slots keep the same TTL.
          if (error instanceof MainJoinError && error.code === 'SERVER_BUSY') continue;
          throw error;
        }
        const record =
          ending ?? endRecords.get(JSON.stringify([room.state.sessionId, room.state.epoch]));
        if (record) {
          const result = ending ? await record.operation.run() : await record.operation.reconcile();
          if (
            'data' in result &&
            result.data.status === 'completed' &&
            record.expiresAt === Number.POSITIVE_INFINITY
          )
            record.expiresAt = clock() + limits.endReplayTtlMs;
        }
      }
    },

    // Shutdown only: do not reuse this as leave, revoke, takeover or metadata recovery.
    close() {
      closed = true;
      for (const room of rooms.values()) room.router.close();
      for (const intent of intents.values()) intent.token = '';
      tickets.clear();
      intents.clear();
      revocations.clear();
      endRecords.clear();
      ownerships.clear();
      rooms.clear();
      failedRouters.clear();
    },
  };
}
