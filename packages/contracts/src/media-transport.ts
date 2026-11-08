import { z } from 'zod';
import { commandAckSchema, resourceIdSchema } from './common.js';
import { mediaIceParametersSchema } from './media-bootstrap.js';
import { sessionCommandEnvelopeSchema } from './session.js';

const direction = z.enum(['SEND', 'RECV']);
const dtlsParameters = z.strictObject({
  role: z.enum(['auto', 'client', 'server']).optional(),
  fingerprints: z
    .array(
      z.strictObject({
        algorithm: z.enum(['sha-1', 'sha-224', 'sha-256', 'sha-384', 'sha-512']),
        value: z
          .string()
          .max(191)
          .regex(/^[a-f0-9]{2}(?::[a-f0-9]{2})+$/i),
      }),
    )
    .min(1)
    .max(5),
});
const iceCandidate = z.strictObject({
  foundation: z.string().min(1),
  priority: z.number().int().nonnegative(),
  ip: z.string().min(1),
  address: z.string().min(1),
  protocol: z.enum(['udp', 'tcp']),
  port: z.number().int().min(1).max(65535),
  type: z.literal('host'),
  tcpType: z.literal('passive').optional(),
});

export const mediaTransportCreateInputSchema = sessionCommandEnvelopeSchema({ direction });
export const mediaTransportConnectInputSchema = sessionCommandEnvelopeSchema({
  transportId: resourceIdSchema,
  dtlsParameters,
});
export const mediaTransportCreateResultSchema = z.strictObject({
  transportId: resourceIdSchema,
  iceGeneration: z.literal(0),
  iceParameters: mediaIceParametersSchema,
  iceCandidates: z.array(iceCandidate).min(1),
  dtlsParameters,
});
export const mediaTransportCreateAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: mediaTransportCreateResultSchema,
  }),
);
export const mediaTransportConnectAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ transportId: resourceIdSchema, connected: z.literal(true) }),
  }),
);

export type MediaTransportCreateInput = z.infer<typeof mediaTransportCreateInputSchema>;
export type MediaTransportConnectInput = z.infer<typeof mediaTransportConnectInputSchema>;
export type MediaTransportCreateResult = z.infer<typeof mediaTransportCreateResultSchema>;
