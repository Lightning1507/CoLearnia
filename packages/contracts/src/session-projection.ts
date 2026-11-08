import { z } from 'zod';
import { requestIdSchema } from './common.js';
import { liveContextSchema, sessionControlBudget } from './session-context.js';
import {
  sessionEpochSchema,
  sessionGroupIdSchema,
  sessionIdSchema,
  sessionParticipantIdSchema,
  sessionScopeRefSchema,
} from './session.js';

const counter = z.number().int().nonnegative();
const role = z.enum(['HOST', 'MEMBER']);

// Public metadata only. Never extend this with internal auth/access or media objects.
export const sessionProjectionSchema = z.strictObject({
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  phase: z.enum(['GUIDANCE', 'ACTIVITY_STARTING', 'ACTIVITY', 'ACTIVITY_ENDING']),
  policyRevision: counter,
  hostParticipantId: sessionParticipantIdSchema.nullable(),
  viewer: z.strictObject({
    participantId: sessionParticipantIdSchema,
    role,
    callGeneration: z.number().int().positive(),
    audienceEpoch: counter,
    scope: liveContextSchema.shape.scope,
  }),
  participants: z.array(
    z.strictObject({ participantId: sessionParticipantIdSchema, displayName: z.string(), role }),
  ),
  groups: z.array(
    z.strictObject({
      groupId: sessionGroupIdSchema,
      name: z.string(),
      mode: z.enum(['DISCUSSION', 'ACTIVITY']),
      memberCount: counter,
      canJoin: z.boolean(),
    }),
  ),
  permissions: z.strictObject({
    publishMic: z.boolean(),
    publishCamera: z.boolean(),
    publishScreen: z.boolean(),
    readBoard: z.boolean(),
    drawBoard: z.boolean(),
    freezeBoard: z.boolean(),
  }),
});

export const sessionProjectionCursorSchema = z.strictObject({
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  participantId: sessionParticipantIdSchema,
  callGeneration: z.number().int().positive(),
  audienceEpoch: counter,
  projectionSequence: counter,
  policyRevision: counter,
  scope: sessionScopeRefSchema,
});

export const sessionResyncInputSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: z.number().int().positive(),
  payload: z.strictObject({
    lastProjectionSequence: counter.optional(),
    lastPolicyRevision: counter.optional(),
  }),
});

export const sessionProjectionEventNameSchema = z.enum([
  'session.changed',
  'host.changed',
  'group.changed',
  'activity.changed',
  'participant.scopeChanged',
]);

const metadata = sessionProjectionCursorSchema.shape;
const snapshotIdentity = { requestId: requestIdSchema, snapshotId: z.uuid() };

function matchesProjection(
  value: SessionProjectionCursor & { projection: SessionProjection },
): boolean {
  const { projection, ...header } = value;
  const viewer = projection.viewer;
  return (
    header.sessionId === projection.sessionId &&
    header.epoch === projection.epoch &&
    header.policyRevision === projection.policyRevision &&
    header.participantId === viewer.participantId &&
    header.callGeneration === viewer.callGeneration &&
    header.audienceEpoch === viewer.audienceEpoch &&
    sameSessionScope(header.scope, viewer.scope)
  );
}

export const sessionSnapshotSchema = z
  .strictObject({
    event: z.literal('session.snapshot'),
    ...metadata,
    ...snapshotIdentity,
    projection: sessionProjectionSchema,
  })
  .refine(matchesProjection, 'Snapshot metadata must match its projection');

export const sessionSnapshotPartSchema = z
  .strictObject({
    event: z.literal('session.snapshot'),
    ...metadata,
    ...snapshotIdentity,
    partIndex: counter.max(sessionControlBudget.maxSnapshotParts - 1),
    partCount: z.number().int().min(1).max(sessionControlBudget.maxSnapshotParts),
    // Consecutive fragments of one JSON-serialized projection, not independent projections.
    fragment: z.string().min(1),
  })
  .refine((part) => part.partIndex < part.partCount, 'partIndex must be less than partCount');

export const sessionProjectionEventSchema = z
  .strictObject({
    event: sessionProjectionEventNameSchema,
    ...metadata,
    projection: sessionProjectionSchema,
  })
  .refine(matchesProjection, 'Event metadata must match its projection');

// Terminal notice has no old private projection; its emission belongs to end/cleanup.
export const sessionEndedEventSchema = z.strictObject({
  event: z.literal('session.ended'),
  ...metadata,
});

export function sameSessionScope(
  left: z.infer<typeof sessionScopeRefSchema>,
  right: z.infer<typeof sessionScopeRefSchema>,
): boolean {
  return (
    left.type === right.type &&
    (left.type === 'MAIN' || (right.type === 'GROUP' && left.groupId === right.groupId))
  );
}

export type SessionProjection = z.infer<typeof sessionProjectionSchema>;
export type SessionProjectionCursor = z.infer<typeof sessionProjectionCursorSchema>;
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
export type SessionSnapshotPart = z.infer<typeof sessionSnapshotPartSchema>;
export type SessionProjectionEvent = z.infer<typeof sessionProjectionEventSchema>;
export type SessionProjectionEventName = z.infer<typeof sessionProjectionEventNameSchema>;
export type SessionEndedEvent = z.infer<typeof sessionEndedEventSchema>;
export type SessionResyncInput = z.infer<typeof sessionResyncInputSchema>;
