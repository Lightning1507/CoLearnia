import { z } from 'zod';
import { commandAckSchema, resourceIdSchema } from './common.js';
import { routerRtpCapabilitiesSchema, rtpHeaderExtensionUriSchema } from './media-bootstrap.js';
import { mediaSourceDescriptorSchema } from './media-source.js';
import { mediaSourceSchema, sessionCommandEnvelopeSchema } from './session.js';

const integer = z.number().int().nonnegative();
const parameters = z.record(z.string(), z.union([z.string(), z.number()]));
const rtpParametersSchema = z.strictObject({
  mid: z.string().optional(),
  msid: z.string().optional(),
  codecs: z
    .array(
      z.strictObject({
        mimeType: z.string().min(1),
        payloadType: integer.max(127),
        clockRate: z.number().int().positive(),
        channels: z.number().int().positive().optional(),
        parameters: parameters.optional(),
        rtcpFeedback: z
          .array(z.strictObject({ type: z.string().min(1), parameter: z.string().optional() }))
          .optional(),
      }),
    )
    .min(1),
  headerExtensions: z
    .array(
      z.strictObject({
        uri: rtpHeaderExtensionUriSchema,
        id: integer,
        encrypt: z.boolean().optional(),
        parameters: parameters.optional(),
      }),
    )
    .optional(),
  encodings: z
    .array(
      z.strictObject({
        ssrc: integer.optional(),
        rid: z.string().optional(),
        codecPayloadType: integer.max(127).optional(),
        rtx: z.strictObject({ ssrc: integer }).optional(),
        dtx: z.boolean().optional(),
        scalabilityMode: z.string().optional(),
        maxBitrate: integer.optional(),
      }),
    )
    .optional(),
  rtcp: z
    .strictObject({ cname: z.string().optional(), reducedSize: z.boolean().optional() })
    .optional(),
});
const sourceVersion = {
  sourceId: resourceIdSchema,
  sourceGeneration: z.number().int().positive(),
};
const sourceBinding = { ...sourceVersion, expectedSourceRevision: integer };

export const mediaProducerCreateInputSchema = sessionCommandEnvelopeSchema({
  transportId: resourceIdSchema,
  sourceKind: mediaSourceSchema,
  rtpParameters: rtpParametersSchema,
  lease: z
    .strictObject({ leaseId: z.uuid(), leaseGeneration: z.number().int().positive() })
    .optional(),
});
export const mediaConsumerCreateInputSchema = sessionCommandEnvelopeSchema({
  ...sourceBinding,
  transportId: resourceIdSchema,
  producerId: resourceIdSchema,
  rtpCapabilities: routerRtpCapabilitiesSchema,
});
export const mediaConsumerReadyInputSchema = sessionCommandEnvelopeSchema({
  ...sourceBinding,
  consumerId: resourceIdSchema,
});
export const mediaProducerCreateAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ producerId: resourceIdSchema, source: mediaSourceDescriptorSchema }),
  }),
);
export const mediaConsumerCreateAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({
      ...sourceVersion,
      sourceRevision: integer,
      consumerId: resourceIdSchema,
      producerId: resourceIdSchema,
      kind: z.enum(['audio', 'video']),
      rtpParameters: rtpParametersSchema,
    }),
  }),
);
export const mediaConsumerReadyAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ consumerId: resourceIdSchema, ready: z.literal(true) }),
  }),
);
