import { z } from 'zod';
import { commandAckSchema, requestIdSchema, resourceIdSchema } from './common.js';
import { sessionControlBudget } from './session-context.js';
import {
  mediaSourceSchema,
  sessionEpochSchema,
  sessionIdSchema,
  sessionParticipantIdSchema,
  sessionScopeRefSchema,
} from './session.js';

const generationSchema = z.number().int().positive();
const revisionSchema = z.number().int().nonnegative();
const mediaStreamIdSchema = z.uuid();
const snapshotIdSchema = z.uuid();
const partCountSchema = generationSchema.max(sessionControlBudget.maxSnapshotParts);
const publicationStateSchema = z.enum(['PUBLISHING', 'PAUSED', 'SWITCHING']);

const sourceIdentity = {
  sourceId: resourceIdSchema,
  sourceGeneration: generationSchema,
};
const sourceVersion = { ...sourceIdentity, sourceRevision: revisionSchema };

export const mediaSourceDescriptorSchema = z
  .strictObject({
    ...sourceVersion,
    producerId: resourceIdSchema,
    ownerParticipantId: sessionParticipantIdSchema,
    sourceKind: mediaSourceSchema,
    scope: sessionScopeRefSchema,
    kind: z.enum(['audio', 'video']),
    publicationState: publicationStateSchema,
  })
  .refine(
    ({ sourceKind, kind }) =>
      kind === (sourceKind === 'MIC' || sourceKind === 'SCREEN_AUDIO' ? 'audio' : 'video'),
    { path: ['kind'], message: 'Media kind must match source kind.' },
  );

const ownProducerSchema = z
  .strictObject({
    source: mediaSourceDescriptorSchema,
    replacement: z
      .strictObject({
        replacementId: z.uuid(),
        sourceRevision: revisionSchema,
        expiresAt: z.iso.datetime(),
      })
      .nullable(),
  })
  .refine(
    ({ source, replacement }) => {
      if (source.publicationState !== 'SWITCHING') return replacement === null;
      return (
        (source.sourceKind === 'MIC' || source.sourceKind === 'CAMERA') &&
        replacement !== null &&
        replacement.sourceRevision === source.sourceRevision
      );
    },
    { path: ['replacement'], message: 'Replacement must match the switching MIC/CAMERA revision.' },
  );

const recipientContext = {
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: generationSchema,
};
const mediaWatermark = {
  audienceEpoch: revisionSchema,
  policyRevision: revisionSchema,
  mediaStreamId: mediaStreamIdSchema,
  mediaSequence: revisionSchema,
};

// Resync is a read against current authority, so it has no expectedPolicyRevision.
export const mediaSourcesResyncInputSchema = z.strictObject({
  ...recipientContext,
  requestId: requestIdSchema,
  payload: z.strictObject({
    lastMediaStreamId: mediaStreamIdSchema.optional(),
    lastMediaSequence: revisionSchema.optional(),
  }),
});

const snapshotDescriptor = {
  ...mediaWatermark,
  snapshotId: snapshotIdSchema,
  partCount: partCountSchema,
};

export const mediaSourcesResyncAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject(snapshotDescriptor),
  }),
);

export const mediaSourcesSnapshotSchema = z
  .strictObject({
    ...recipientContext,
    ...snapshotDescriptor,
    requestId: requestIdSchema,
    partIndex: revisionSchema,
    payload: z.strictObject({
      sources: z.array(mediaSourceDescriptorSchema),
      ownTransports: z.array(
        z.strictObject({
          transportId: resourceIdSchema,
          direction: z.enum(['SEND', 'RECV']),
          iceGeneration: revisionSchema,
          restartPending: z.boolean(),
        }),
      ),
      ownProducers: z.array(ownProducerSchema),
      ownConsumers: z.array(
        z.strictObject({
          ...sourceVersion,
          consumerId: resourceIdSchema,
          producerId: resourceIdSchema,
          ready: z.boolean(),
          paused: z.boolean(),
        }),
      ),
    }),
  })
  .refine(({ partIndex, partCount }) => partIndex < partCount, {
    path: ['partIndex'],
    message: 'Part index must be smaller than part count.',
  });

const resourceCloseReasons = [
  'USER_STOP',
  'SCOPE_CHANGED',
  'PERMISSION_REVOKED',
  'TRANSPORT_FAILED',
  'SESSION_ENDED',
  'DEADLINE',
] as const;
const sourceCloseReasonSchema = z.enum([
  ...resourceCloseReasons,
  'SOURCE_ENDED',
  'SOURCE_REPLACED',
]);

function mediaDeltaSchema<Payload extends z.ZodType>(payload: Payload) {
  return z.strictObject({
    ...recipientContext,
    ...mediaWatermark,
    mediaSequence: generationSchema,
    payload,
  });
}

// Socket event name selects the schema. It is separate from the wire envelope.
export const mediaSourceEventSchemas = {
  'media.source.changed': mediaDeltaSchema(z.strictObject({ source: mediaSourceDescriptorSchema })),
  'media.source.ended': mediaDeltaSchema(
    z.strictObject({ ...sourceVersion, reason: sourceCloseReasonSchema }),
  ),
  'media.producer.stateChanged': mediaDeltaSchema(
    z.discriminatedUnion('state', [
      z.strictObject({
        ...sourceVersion,
        producerId: resourceIdSchema,
        state: publicationStateSchema,
      }),
      z.strictObject({
        ...sourceVersion,
        producerId: resourceIdSchema,
        state: z.literal('CLOSED'),
        reason: sourceCloseReasonSchema,
      }),
    ]),
  ),
  'media.consumer.closed': mediaDeltaSchema(
    z.strictObject({
      ...sourceIdentity,
      consumerId: resourceIdSchema,
      reason: sourceCloseReasonSchema,
    }),
  ),
  'media.transport.closed': mediaDeltaSchema(
    z.strictObject({ transportId: resourceIdSchema, reason: z.enum(resourceCloseReasons) }),
  ),
} as const;

export type MediaSourceDescriptor = z.infer<typeof mediaSourceDescriptorSchema>;
export type MediaSourcesResyncInput = z.infer<typeof mediaSourcesResyncInputSchema>;
export type MediaSourcesResyncAck = z.infer<typeof mediaSourcesResyncAckSchema>;
export type MediaSourcesSnapshot = z.infer<typeof mediaSourcesSnapshotSchema>;
export type MediaSourceEventName = keyof typeof mediaSourceEventSchemas;
export type MediaSourceEvent<Name extends MediaSourceEventName = MediaSourceEventName> = z.infer<
  (typeof mediaSourceEventSchemas)[Name]
>;
