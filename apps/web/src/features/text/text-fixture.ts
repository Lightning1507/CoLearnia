import {
  textMessageHistoryResponseSchema,
  textMessageSendBodySchema,
  textMessageSendResponseSchema,
  type TextHistoryMessage,
  type TextMessageSendBody,
} from '@colearnia/contracts';

export type FixtureSendMode = 'success' | 'failure' | 'lost-ack';
export type TextPort = {
  history(signal: AbortSignal): Promise<TextHistoryMessage[]>;
  send(payload: TextMessageSendBody, signal: AbortSignal): Promise<TextHistoryMessage>;
};

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 700);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// This provider is used only by the labelled /workspace fixture route.
export function createTextFixture(channelId: string, senderId: string) {
  const conversationId = '200000000000000000000001';
  const scope = { channelId, conversationId, rootMessageId: null };
  const saved = new Map<string, TextHistoryMessage>();
  const failed = new Set<string>();
  let sequence = 2;
  let mode: FixtureSendMode = 'success';
  const initial: TextHistoryMessage[] = [
    {
      ...scope,
      id: '200000000000000000000002',
      senderId: '200000000000000000000003',
      clientMessageId: '20000000-0000-4000-8000-000000000001',
      text: 'Mình đã tổng hợp các câu hỏi ôn tập. Mọi người cùng trao đổi ở đây nhé.',
      createdAt: '2026-11-17T02:00:00.000Z',
      replyCount: 0,
      commitSeq: 1,
    },
    {
      ...scope,
      id: '200000000000000000000004',
      senderId,
      clientMessageId: '20000000-0000-4000-8000-000000000002',
      text: 'Mình sẽ bắt đầu với phần kiến thức tuần này.',
      createdAt: '2026-11-17T02:02:00.000Z',
      replyCount: 0,
      commitSeq: 2,
    },
  ];
  return {
    setMode(next: FixtureSendMode) {
      mode = next;
    },
    port(view: 'messages' | 'empty' | 'error'): TextPort {
      return {
        async history(signal) {
          await pause(signal);
          if (view === 'error') throw new Error('Fixture history failure');
          const response = textMessageHistoryResponseSchema.parse({
            data: {
              mode: 'history',
              scope,
              items: view === 'empty' ? [] : [...initial, ...saved.values()],
              nextCursor: null,
            },
            requestId: crypto.randomUUID(),
          });
          if (!response.data) throw new Error('Invalid history fixture');
          return response.data.items;
        },
        async send(input, signal) {
          const payload = textMessageSendBodySchema.parse(input);
          const selectedMode = mode;
          await pause(signal);
          const previous = saved.get(payload.clientMessageId);
          if (previous && (previous.text !== payload.text || payload.rootMessageId)) {
            throw new Error('CONFLICT');
          }
          if (!previous && selectedMode === 'failure' && !failed.has(payload.clientMessageId)) {
            failed.add(payload.clientMessageId);
            throw new Error('Fixture send failure');
          }
          const message = previous ?? {
            ...scope,
            senderId,
            clientMessageId: payload.clientMessageId,
            text: payload.text,
            id: (++sequence).toString(16).padStart(24, '0'),
            createdAt: new Date().toISOString(),
            replyCount: 0,
            commitSeq: sequence,
          };
          saved.set(payload.clientMessageId, message);
          if (!previous && selectedMode === 'lost-ack') throw new Error('Fixture ACK lost');
          const response = textMessageSendResponseSchema.parse({
            data: { outcome: previous ? 'existing' : 'created', message },
            requestId: crypto.randomUUID(),
          });
          if (!response.data) throw new Error('Invalid send fixture');
          return response.data.message;
        },
      };
    },
  };
}
