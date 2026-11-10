import { z } from 'zod';
import { apiResponseSchema, commandAckSchema, requestIdSchema } from './common.js';
import { sessionEpochSchema, sessionIdSchema, sessionParticipantIdSchema } from './session.js';
import { sessionSnapshotDescriptorSchema } from './session-projection.js';

export const sessionJoinTicketInputSchema = z.strictObject({ requestId: requestIdSchema });
export const sessionJoinTicketResponseSchema = apiResponseSchema(
  z.strictObject({
    sessionId: sessionIdSchema,
    epoch: sessionEpochSchema,
    ticket: z.string().min(1).max(512),
    expiresAt: z.iso.datetime(),
  }),
);
export const sessionJoinInputSchema = z.strictObject({
  requestId: requestIdSchema,
  ticket: z.string().min(1).max(512),
  takeover: z
    .strictObject({
      confirmed: z.literal(true),
      expectedCallGeneration: z.number().int().positive(),
    })
    .optional(),
});
export const sessionJoinAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({
      participantId: sessionParticipantIdSchema,
      callGeneration: z.number().int().positive(),
      snapshot: sessionSnapshotDescriptorSchema,
    }),
  }),
);
export type SessionJoinInput = z.infer<typeof sessionJoinInputSchema>;
export type SessionJoinTicketInput = z.infer<typeof sessionJoinTicketInputSchema>;
export type SessionJoinAck = z.infer<typeof sessionJoinAckSchema>;
