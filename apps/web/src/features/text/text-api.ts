import {
  apiErrorSchema,
  textConversationSubscribeAckSchema,
  textMessageSendBodySchema,
  textMessageSendResponseSchema,
  textSenderNamesHeader,
} from '@colearnia/contracts';
import type { TextMessageSendBody } from '@colearnia/contracts';
import type { Socket } from 'socket.io-client';
import type { TextSyncPort } from './text-sync';

export class TextApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function createTextApi(
  socket: Socket,
  channelId: string,
  csrfToken: string,
  base = '/api/v1',
  fetcher: typeof fetch = fetch,
) {
  async function request(path: string, signal: AbortSignal, payload?: TextMessageSendBody) {
    const response = await fetcher(`${base}/channels/${encodeURIComponent(channelId)}/${path}`, {
      method: payload ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      headers: {
        [textSenderNamesHeader]: '1',
        ...(payload && { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }),
      },
      ...(payload && {
        body: JSON.stringify(textMessageSendBodySchema.parse(payload)),
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      const denial: Record<number, string> = {
        401: 'AUTH_REQUIRED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
      };
      throw new TextApiError(
        error.success
          ? error.data.error.code
          : (denial[response.status] ?? 'DEPENDENCY_UNAVAILABLE'),
      );
    }
    return body;
  }

  const sync: TextSyncPort = {
    listen(message, invalidated, disconnected) {
      socket.on('message.created', message);
      socket.on('conversation.invalidated', invalidated);
      socket.on('disconnect', disconnected);
      return () => {
        socket.off('message.created', message);
        socket.off('conversation.invalidated', invalidated);
        socket.off('disconnect', disconnected);
      };
    },
    subscribe(payload, signal) {
      return new Promise<unknown>((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (!socket.connected) {
          signal.removeEventListener('abort', abort);
          reject(new TextApiError('DEPENDENCY_UNAVAILABLE'));
          return;
        }
        socket.timeout(8000).emit(
          'conversation.subscribe',
          {
            requestId: crypto.randomUUID(),
            payload,
          },
          (error: Error | null, body: unknown) => {
            signal.removeEventListener('abort', abort);
            if (signal.aborted) {
              const ack = textConversationSubscribeAckSchema.safeParse(body);
              if (ack.success && 'data' in ack.data) sync.unsubscribe(ack.data.data.subscriptionId);
              return;
            }
            if (error) reject(error);
            else resolve(body);
          },
        );
      });
    },
    history(target, query, signal) {
      if (target !== channelId) throw new TextApiError('FORBIDDEN');
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return request('messages?' + params.toString(), signal);
    },
    unsubscribe(subscriptionId) {
      if (socket.connected)
        socket.emit(
          'conversation.unsubscribe',
          {
            requestId: crypto.randomUUID(),
            payload: { subscriptionId },
          },
          () => {},
        );
    },
  };
  return {
    sync,
    async send(payload: TextMessageSendBody, signal: AbortSignal) {
      const body = await request('messages', signal, payload);
      const message = textMessageSendResponseSchema.parse(body).data.message;
      if (message.channelId !== channelId || message.rootMessageId !== null)
        throw new TextApiError('CONFLICT');
      return message;
    },
  };
}
