import { z } from 'zod';
import {
  apiResponseSchema,
  commandAckSchema,
  requestIdSchema,
  resourceIdSchema,
} from './common.js';
import { sessionCommandEnvelopeSchema, sessionEpochSchema, sessionIdSchema } from './session.js';

const callContext = { epoch: sessionEpochSchema, callGeneration: z.number().int().positive() };
const responseContext = { sessionId: sessionIdSchema, ...callContext };
const iceGenerationSchema = z.number().int().nonnegative();
const expiresAtSchema = z.iso.datetime();
const proofTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

export const mediaRestParamsSchema = z.strictObject({ sessionId: sessionIdSchema });
// Validate the extracted header value, separate from the HTTP framework's full header map.
export const mediaContextHeaderSchema = proofTokenSchema;
export const mediaBootstrapQuerySchema = z.strictObject({
  epoch: sessionEpochSchema,
  callGeneration: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(callContext.callGeneration),
});

const mediaKindSchema = z.enum(['audio', 'video']);
// URI values accepted by the pinned mediasoup server and client RTP capability types.
export const rtpHeaderExtensionUriSchema = z.enum([
  'urn:ietf:params:rtp-hdrext:sdes:mid',
  'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
  'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id',
  'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
  'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
  'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension',
  'urn:3gpp:video-orientation',
  'http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time',
  'http://www.webrtc.org/experiments/rtp-hdrext/playout-delay',
  'urn:mediasoup:params:rtp-hdrext:packet-id',
]);
export const routerRtpCapabilitiesSchema = z.strictObject({
  codecs: z.array(
    z.strictObject({
      kind: mediaKindSchema,
      mimeType: z.string().min(1),
      preferredPayloadType: z.number().int().min(0).max(127),
      clockRate: z.number().int().positive(),
      channels: z.number().int().positive().optional(),
      parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      rtcpFeedback: z
        .array(z.strictObject({ type: z.string().min(1), parameter: z.string().optional() }))
        .optional(),
    }),
  ),
  headerExtensions: z.array(
    z.strictObject({
      kind: mediaKindSchema,
      uri: rtpHeaderExtensionUriSchema,
      preferredId: z.number().int().positive(),
      preferredEncrypt: z.boolean().optional(),
      direction: z.enum(['sendrecv', 'sendonly', 'recvonly', 'inactive']).optional(),
    }),
  ),
});

export const mediaBootstrapResponseSchema = apiResponseSchema(
  z.strictObject({ ...responseContext, routerRtpCapabilities: routerRtpCapabilitiesSchema }),
);

export const mediaIceCredentialsBodySchema = z.strictObject({
  requestId: requestIdSchema,
  ...callContext,
});
const iceServerUrlSchema = z.string().regex(/^(?:stuns?|turns?):[^\s]+$/i);
const iceServerSchema = z
  .strictObject({
    urls: z.union([iceServerUrlSchema, z.array(iceServerUrlSchema).min(1)]),
    username: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
  })
  .refine(
    ({ urls, username, credential }) => {
      const usesTurn = [urls].flat().some((url) => /^turns?:/i.test(url));
      return usesTurn
        ? username !== undefined && credential !== undefined
        : username === undefined && credential === undefined;
    },
    {
      message:
        'TURN URLs require both username and credential. STUN-only entries omit credentials.',
    },
  );

export const mediaIceCredentialsResponseSchema = apiResponseSchema(
  z.strictObject({
    ...responseContext,
    iceServers: z.array(iceServerSchema),
    expiresAt: expiresAtSchema,
    serverTime: z.iso.datetime(),
  }),
);

export const mediaHttpContextIssueInputSchema = sessionCommandEnvelopeSchema({});
export const mediaHttpContextIssueAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({ token: proofTokenSchema, expiresAt: expiresAtSchema }),
  }),
);

export const mediaTransportRestartIceInputSchema = sessionCommandEnvelopeSchema({
  transportId: resourceIdSchema,
  expectedIceGeneration: iceGenerationSchema,
});
export const mediaIceParametersSchema = z.strictObject({
  usernameFragment: z.string().min(1),
  password: z.string().min(1),
  iceLite: z.boolean().optional(),
});
export const mediaTransportRestartIceAckSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({
      transportId: resourceIdSchema,
      iceGeneration: iceGenerationSchema.min(1),
      iceParameters: mediaIceParametersSchema,
    }),
  }),
);

export type MediaBootstrapQuery = z.infer<typeof mediaBootstrapQuerySchema>;
export type MediaBootstrapResponse = z.infer<typeof mediaBootstrapResponseSchema>;
export type MediaIceCredentialsBody = z.infer<typeof mediaIceCredentialsBodySchema>;
export type MediaIceCredentialsResponse = z.infer<typeof mediaIceCredentialsResponseSchema>;
export type MediaHttpContextIssueInput = z.infer<typeof mediaHttpContextIssueInputSchema>;
export type MediaHttpContextIssueAck = z.infer<typeof mediaHttpContextIssueAckSchema>;
export type MediaTransportRestartIceInput = z.infer<typeof mediaTransportRestartIceInputSchema>;
export type MediaTransportRestartIceAck = z.infer<typeof mediaTransportRestartIceAckSchema>;
