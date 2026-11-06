import { z } from 'zod';
import { commandAckSchema, requestIdSchema } from './common.js';

export const mediaSourceSchema = z.enum(['MIC', 'CAMERA', 'SCREEN', 'SCREEN_AUDIO']);

const documentIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/);

export const sessionIdSchema = documentIdSchema;
export const sessionParticipantIdSchema = documentIdSchema;
export const sessionEpochSchema = z.uuid();
export const sessionGroupIdSchema = z.uuid();
export const sessionRoundIdSchema = z.uuid();

const policyRevisionSchema = z.number().int().nonnegative();
const groupScopeSchema = z.strictObject({
  type: z.literal('GROUP'),
  groupId: sessionGroupIdSchema,
});

export const sessionScopeRefSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MAIN') }),
  groupScopeSchema,
]);

const sessionMutationContextSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: z.number().int().positive(),
  expectedPolicyRevision: policyRevisionSchema,
});

// These fields identify the intended call state. The server still resolves actor and policy.
export const sessionCommandEnvelopeSchema = <Shape extends z.ZodRawShape>(payload: Shape) =>
  sessionMutationContextSchema.extend({ payload: z.strictObject(payload) });

const completedSessionAckSchema = <Result extends z.ZodType>(result: Result) =>
  commandAckSchema(z.strictObject({ status: z.literal('completed'), result }));

export const hostTransferInputSchema = sessionCommandEnvelopeSchema({
  targetParticipantId: sessionParticipantIdSchema,
});
export const hostTransferAckSchema = completedSessionAckSchema(
  z.strictObject({
    hostParticipantId: sessionParticipantIdSchema,
    policyRevision: policyRevisionSchema,
  }),
);

export const groupJoinInputSchema = sessionCommandEnvelopeSchema({ groupId: sessionGroupIdSchema });
export const groupJoinAckSchema = completedSessionAckSchema(
  z.strictObject({
    scope: groupScopeSchema,
    audienceEpoch: z.number().int().nonnegative(),
    policyRevision: policyRevisionSchema,
  }),
);

export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type SessionScopeRef = z.infer<typeof sessionScopeRefSchema>;
export type HostTransferInput = z.infer<typeof hostTransferInputSchema>;
export type HostTransferAck = z.infer<typeof hostTransferAckSchema>;
export type GroupJoinInput = z.infer<typeof groupJoinInputSchema>;
export type GroupJoinAck = z.infer<typeof groupJoinAckSchema>;
