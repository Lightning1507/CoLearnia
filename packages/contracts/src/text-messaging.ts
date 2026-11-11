import { z } from 'zod';
import { apiResponseSchema, commandAckSchema, requestIdSchema } from './common.js';
import { channelParamsSchema, workspaceDocumentIdSchema } from './workspace.js';

export const textMessageMaxCodePoints = 4000;
export const textHistoryMaxLimit = 50;
export const textHistoryDefaultLimit = 30;

// Preserve the submitted text, including whitespace around nonblank content.
const messageTextSchema = z.string().refine((value) => {
  if (value.trim().length === 0 || value.length > textMessageMaxCodePoints * 2) return false;
  return [...value].length <= textMessageMaxCodePoints;
});
const opaqueToken = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9._~-]+$/);
const historyLimit = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[1-9][0-9]?$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(1).max(textHistoryMaxLimit))
  .default(textHistoryDefaultLimit);

export const textThreadParamsSchema = channelParamsSchema.extend({
  rootMessageId: workspaceDocumentIdSchema,
});
const textChannelScopeSchema = channelParamsSchema.extend({
  rootMessageId: workspaceDocumentIdSchema.nullable(),
});
export const textMessageScopeSchema = textChannelScopeSchema.extend({
  conversationId: workspaceDocumentIdSchema,
});

export const textMessageSendBodySchema = z.strictObject({
  clientMessageId: z.uuid(),
  text: messageTextSchema,
  rootMessageId: workspaceDocumentIdSchema.optional(),
});
export const textMessageSendInputSchema = z.strictObject({
  requestId: requestIdSchema,
  payload: textMessageSendBodySchema.extend(channelParamsSchema.shape),
});

const committedSequenceSchema = z.number().int().positive();
export const textHistoryMessageSchema = textMessageScopeSchema
  .extend({
    id: workspaceDocumentIdSchema,
    senderId: workspaceDocumentIdSchema,
    clientMessageId: z.uuid(),
    text: messageTextSchema,
    createdAt: z.iso.datetime(),
    replyCount: z.number().int().nonnegative().optional(),
    commitSeq: committedSequenceSchema.optional(),
  })
  .refine((message) => (message.rootMessageId === null) === (message.replyCount !== undefined), {
    path: ['replyCount'],
  });

// Legacy rows can appear in ordinary history or the first snapshot.
export const committedTextMessageSchema = textHistoryMessageSchema.safeExtend({
  commitSeq: committedSequenceSchema,
});
const textMessageSendResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('created'), message: committedTextMessageSchema }),
  z.strictObject({ outcome: z.literal('existing'), message: textHistoryMessageSchema }),
]);
export const textMessageSendResponseSchema = apiResponseSchema(textMessageSendResultSchema);
export const textMessageSendAckSchema = commandAckSchema(textMessageSendResultSchema);

export const textMessageHistoryQuerySchema = z.union([
  z.strictObject({
    mode: z.literal('history').default('history'),
    cursor: opaqueToken.optional(),
    limit: historyLimit,
  }),
  z.strictObject({
    mode: z.literal('snapshot'),
    syncToken: opaqueToken,
    throughCheckpoint: opaqueToken,
    limit: historyLimit,
  }),
  z.strictObject({
    mode: z.literal('catch-up'),
    syncToken: opaqueToken,
    afterCheckpoint: opaqueToken,
    throughCheckpoint: opaqueToken,
    cursor: opaqueToken.optional(),
    limit: historyLimit,
  }),
]);

const historyPage = {
  scope: textMessageScopeSchema,
  nextCursor: opaqueToken.nullable(),
};
export const textMessageHistoryPageSchema = z
  .discriminatedUnion('mode', [
    z.strictObject({
      ...historyPage,
      mode: z.literal('history'),
      items: z.array(textHistoryMessageSchema).max(textHistoryMaxLimit),
    }),
    z.strictObject({
      ...historyPage,
      mode: z.literal('snapshot'),
      throughCheckpoint: opaqueToken,
      items: z.array(textHistoryMessageSchema).max(textHistoryMaxLimit),
    }),
    z.strictObject({
      ...historyPage,
      mode: z.literal('catch-up'),
      throughCheckpoint: opaqueToken,
      items: z.array(committedTextMessageSchema).max(textHistoryMaxLimit),
    }),
  ])
  .refine(
    ({ scope, items }) =>
      items.every(
        (item) =>
          item.channelId === scope.channelId &&
          item.conversationId === scope.conversationId &&
          item.rootMessageId === scope.rootMessageId,
      ),
    { path: ['items'] },
  );
export const textMessageHistoryResponseSchema = apiResponseSchema(textMessageHistoryPageSchema);

export const textConversationSubscribeInputSchema = z.strictObject({
  requestId: requestIdSchema,
  payload: textChannelScopeSchema.extend({ afterCheckpoint: opaqueToken.optional() }),
});
export const textConversationSubscriptionSchema = z.strictObject({
  scope: textMessageScopeSchema,
  subscriptionId: z.uuid(),
  syncToken: opaqueToken,
  throughCheckpoint: opaqueToken,
});
export const textConversationSubscribeAckSchema = commandAckSchema(
  textConversationSubscriptionSchema,
);
export const textConversationUnsubscribeInputSchema = z.strictObject({
  requestId: requestIdSchema,
  payload: z.strictObject({ subscriptionId: z.uuid() }),
});
export const textConversationUnsubscribeAckSchema = commandAckSchema(z.null());

export const textMessageCreatedEventSchema = z.strictObject({
  subscriptionId: z.uuid(),
  message: committedTextMessageSchema,
});
export const textConversationInvalidatedEventSchema = z.strictObject({
  subscriptionId: z.uuid(),
  reason: z.enum(['ACCESS_REVOKED', 'RESYNC_REQUIRED']),
});

export type TextMessageSendBody = z.infer<typeof textMessageSendBodySchema>;
export type TextMessageSendInput = z.infer<typeof textMessageSendInputSchema>;
export type TextMessageSendAck = z.infer<typeof textMessageSendAckSchema>;
export type TextHistoryMessage = z.infer<typeof textHistoryMessageSchema>;
export type CommittedTextMessage = z.infer<typeof committedTextMessageSchema>;
export type TextMessageScope = z.infer<typeof textMessageScopeSchema>;
export type TextMessageHistoryQuery = z.infer<typeof textMessageHistoryQuerySchema>;
export type TextMessageHistoryPage = z.infer<typeof textMessageHistoryPageSchema>;
export type TextConversationSubscribeInput = z.infer<typeof textConversationSubscribeInputSchema>;
export type TextConversationSubscribeAck = z.infer<typeof textConversationSubscribeAckSchema>;
export type TextConversationUnsubscribeInput = z.infer<
  typeof textConversationUnsubscribeInputSchema
>;
export type TextMessageCreatedEvent = z.infer<typeof textMessageCreatedEventSchema>;
export type TextConversationInvalidatedEvent = z.infer<
  typeof textConversationInvalidatedEventSchema
>;
