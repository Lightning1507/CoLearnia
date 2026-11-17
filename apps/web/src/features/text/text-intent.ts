import {
  textHistoryMessageSchema,
  textMessageSendBodySchema,
  type TextHistoryMessage,
  type TextMessageSendBody,
} from '@colearnia/contracts';

export type OutgoingText = {
  payload: TextMessageSendBody;
  status: 'sending' | 'failed';
};

export function newTextIntent(text: string): OutgoingText {
  return {
    payload: textMessageSendBodySchema.parse({ clientMessageId: crypto.randomUUID(), text }),
    status: 'sending',
  };
}

export function mergeTextMessage(
  messages: TextHistoryMessage[],
  incoming: TextHistoryMessage,
): TextHistoryMessage[] {
  const parsed = textHistoryMessageSchema.parse(incoming);
  return [...messages.filter((message) => message.id !== parsed.id), parsed].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
