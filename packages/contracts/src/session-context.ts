import { z } from 'zod';
import { authenticatedContextSchema } from './auth.js';
import { commonErrorCodeSchema } from './errors.js';
import { accessRevocationSchema } from './workspace.js';
import {
  sessionEpochSchema,
  sessionGroupIdSchema,
  sessionIdSchema,
  sessionParticipantIdSchema,
  sessionRoundIdSchema,
  sessionScopeRefSchema,
} from './session.js';

const documentIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/);
const revisionSchema = z.number().int().nonnegative();
const generationSchema = z.number().int().positive();

export const channelAccessStampSchema = z.strictObject({
  workspaceId: documentIdSchema,
  channelId: documentIdSchema,
  channelType: z.enum(['TEXT', 'LIVE']),
  membershipId: documentIdSchema,
  membershipIncarnation: generationSchema,
  membershipRevision: revisionSchema,
  channelRevision: revisionSchema,
  canReadContent: z.boolean(),
});

// Internal DTOs. The resolver validates the current server-side ownership and access.
export const liveContextRequestSchema = z.strictObject({
  auth: authenticatedContextSchema,
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: generationSchema,
});

const liveContextScopeSchema = z.union([
  z.strictObject({ type: z.literal('MAIN') }),
  z.strictObject({
    type: z.literal('GROUP'),
    groupId: sessionGroupIdSchema,
    mode: z.literal('DISCUSSION'),
  }),
  z.strictObject({
    type: z.literal('GROUP'),
    groupId: sessionGroupIdSchema,
    mode: z.literal('ACTIVITY'),
    roundId: sessionRoundIdSchema,
    deadline: z.iso.datetime(),
  }),
]);

export const liveContextSchema = liveContextRequestSchema.extend({
  access: channelAccessStampSchema.extend({
    channelType: z.literal('LIVE'),
    canReadContent: z.literal(true),
  }),
  participantId: sessionParticipantIdSchema,
  role: z.enum(['HOST', 'MEMBER']),
  scope: liveContextScopeSchema,
  audienceEpoch: revisionSchema,
  policyRevision: revisionSchema,
});

export const liveContextResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), context: liveContextSchema }),
  z.strictObject({
    ok: z.literal(false),
    errorCode: z.enum(['AUTH_REQUIRED', 'FORBIDDEN', 'CONFLICT', 'DEPENDENCY_UNAVAILABLE']),
  }),
]);

export const liveAccessRevocationSchema = accessRevocationSchema;

const cleanupFields = {
  operationId: z.uuid(),
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  transitionToken: z.uuid(),
};

const participantCleanupTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PARTICIPANT'), participantId: sessionParticipantIdSchema }),
  z.strictObject({
    type: z.literal('PARTICIPANT_SCOPE'),
    participantId: sessionParticipantIdSchema,
    scope: sessionScopeRefSchema,
    audienceEpoch: revisionSchema,
  }),
]);

const participantCleanupIdentitySchema = z.strictObject({
  ...cleanupFields,
  callGeneration: generationSchema,
  target: participantCleanupTargetSchema,
});
const scopeCleanupIdentitySchema = z.strictObject({
  ...cleanupFields,
  target: z.strictObject({ type: z.literal('SCOPE'), scope: sessionScopeRefSchema }),
});
const cleanupReasonSchema = z.enum([
  'ACCESS_REVOKED',
  'SCOPE_CHANGED',
  'SESSION_ENDED',
  'DISCONNECTED',
  'CONTROL_LEASE_EXPIRED',
  'SCOPE_CLOSED',
  'TRANSITION_CANCELLED',
]);

export const sessionCleanupRequestSchema = z.union([
  participantCleanupIdentitySchema.extend({ reason: cleanupReasonSchema }),
  scopeCleanupIdentitySchema.extend({ reason: cleanupReasonSchema }),
]);

const cleanupOutcomeSchema = z.discriminatedUnion('permissionRevoked', [
  z.strictObject({
    permissionRevoked: z.literal(true),
    pendingInvalidated: z.literal(true),
    cleanupPending: z.boolean(),
  }),
  z.strictObject({
    permissionRevoked: z.literal(false),
    pendingInvalidated: z.boolean(),
    cleanupPending: z.literal(true),
    errorCode: commonErrorCodeSchema,
    retryable: z.boolean(),
  }),
]);

// Echo the exact target and operation identity so the coordinator can reject stale completions.
export const sessionCleanupResultSchema = z.union([
  participantCleanupIdentitySchema.extend({ outcome: cleanupOutcomeSchema }),
  scopeCleanupIdentitySchema.extend({ outcome: cleanupOutcomeSchema }),
]);

// Proposed starting values for review and measurement in the single-process PoC.
export const sessionControlBudget = {
  maxControlBytes: 16 * 1024,
  maxSnapshotPartBytes: 16 * 1024,
  maxSnapshotParts: 64,
  maxSnapshotBytes: 1024 * 1024,
  snapshotTimeoutMs: 5_000,
  maxBufferedEvents: 64,
  maxBufferedEventBytes: 256 * 1024,
  bufferedEventTimeoutMs: 5_000,
  cleanupAttemptTimeoutMs: 2_000,
  cleanupRetryDelaysMs: [250, 750],
  foregroundTransitionTimeoutMs: 10_000,
  cleanupReconcileDelaysMs: [1_000, 3_000, 10_000],
} as const;

export type ChannelAccessStamp = z.infer<typeof channelAccessStampSchema>;
export type LiveContextRequest = z.infer<typeof liveContextRequestSchema>;
export type LiveContext = z.infer<typeof liveContextSchema>;
export type LiveContextResult = z.infer<typeof liveContextResultSchema>;
export type LiveAccessRevocation = z.infer<typeof liveAccessRevocationSchema>;
export type SessionCleanupRequest = z.infer<typeof sessionCleanupRequestSchema>;
export type SessionCleanupResult = z.infer<typeof sessionCleanupResultSchema>;

export type ResolveLiveContext = (request: LiveContextRequest) => Promise<LiveContextResult>;
export type CleanupSessionResources = (
  request: SessionCleanupRequest,
) => Promise<SessionCleanupResult>;
