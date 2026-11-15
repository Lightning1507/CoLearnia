import { z } from 'zod';
import { commandAckSchema } from './common.js';
import { sessionCommandEnvelopeSchema, sessionScopeRefSchema } from './session.js';

export const screenPickerLeaseMs = 30_000;

const leaseRef = {
  leaseId: z.uuid(),
  leaseGeneration: z.number().int().positive(),
};
export const screenAcquireInputSchema = sessionCommandEnvelopeSchema({
  scope: sessionScopeRefSchema,
});
export const screenReleaseInputSchema = sessionCommandEnvelopeSchema(leaseRef);
export const screenAcquireAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ ...leaseRef, expiresAt: z.iso.datetime() }),
  }),
);
export const screenReleaseAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ released: z.boolean() }),
  }),
);

export type ScreenAcquireInput = z.infer<typeof screenAcquireInputSchema>;
export type ScreenReleaseInput = z.infer<typeof screenReleaseInputSchema>;
export type ScreenPickerLease = Extract<
  z.infer<typeof screenAcquireAckSchema>,
  { data: unknown }
>['data']['result'];
