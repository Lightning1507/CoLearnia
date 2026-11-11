import { z } from 'zod';
import { commandAckSchema, requestIdSchema } from './common.js';
import { sessionEpochSchema, sessionIdSchema } from './session.js';

export const sessionEndInputSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  epoch: sessionEpochSchema,
  callGeneration: z.number().int().positive(),
  expectedPolicyRevision: z.number().int().nonnegative(),
  action: z.enum(['END', 'HOST_LEAVE']),
});
const identity = { sessionId: sessionIdSchema, epoch: sessionEpochSchema };
export const sessionEndAckSchema = commandAckSchema(
  z.discriminatedUnion('status', [
    z.strictObject({
      status: z.literal('completed'),
      result: z.strictObject({
        ...identity,
        state: z.literal('ENDED'),
        cleanupPending: z.boolean(),
      }),
    }),
    z.strictObject({
      status: z.literal('pending'),
      result: z.strictObject({
        ...identity,
        state: z.literal('ENDING'),
        cleanupPending: z.literal(true),
      }),
    }),
  ]),
);
export type SessionEndInput = z.infer<typeof sessionEndInputSchema>;
export type SessionEndAck = z.infer<typeof sessionEndAckSchema>;
