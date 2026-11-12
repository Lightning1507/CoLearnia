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
      resumeTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      snapshot: sessionSnapshotDescriptorSchema,
    }),
  }),
);
export type SessionJoinInput = z.infer<typeof sessionJoinInputSchema>;
export type SessionJoinTicketInput = z.infer<typeof sessionJoinTicketInputSchema>;
export type SessionJoinAck = z.infer<typeof sessionJoinAckSchema>;

export const sessionResumeInputSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: z.number().int().positive(),
  resumeTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type SessionResumeInput = z.infer<typeof sessionResumeInputSchema>;
