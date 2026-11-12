import { describe, expect, it } from 'vitest';
import {
  committedTextMessageSchema,
  textConversationInvalidatedEventSchema,
  textConversationSubscribeAckSchema,
  textConversationSubscribeInputSchema,
  textConversationUnsubscribeAckSchema,
  textConversationUnsubscribeInputSchema,
  textMessageCreatedEventSchema,
  textMessageHistoryQuerySchema,
  textMessageHistoryResponseSchema,
  textMessageSendAckSchema,
  textMessageSendBodySchema,
  textMessageSendInputSchema,
  textMessageSendResponseSchema,
  textThreadParamsSchema,
  textThreadReplyCountsQuerySchema,
  textThreadReplyCountsResponseSchema,
  textThreadReplyCountUpdatedEventSchema,
} from './index.js';

const requestId = '10000000-0000-4000-8000-000000000001';
const clientMessageId = '10000000-0000-4000-8000-000000000002';
const subscriptionId = '10000000-0000-4000-8000-000000000003';
const channelId = '507f1f77bcf86cd799439011';
const conversationId = '507f1f77bcf86cd799439012';
const senderId = '507f1f77bcf86cd799439013';
const id = '507f1f77bcf86cd799439014';
const channelScope = { channelId, rootMessageId: null };
const scope = { ...channelScope, conversationId };
const body = { clientMessageId, text: '  Chào nhóm 👋  ' };
const messageFields = {
  ...scope,
  ...body,
  senderId,
  id,
  createdAt: '2026-11-11T06:00:00Z',
};
const legacyMessage = { ...messageFields, replyCount: 0 };
const message = { ...legacyMessage, commitSeq: 10 };
const snapshotQuery = {
  mode: 'snapshot',
  syncToken: 'sync.token',
  throughCheckpoint: 'checkpoint.H',
};
const catchUpQuery = { ...snapshotQuery, mode: 'catch-up', afterCheckpoint: 'checkpoint.L' };
const subscription = {
  scope,
  subscriptionId,
  syncToken: 'sync.token',
  throughCheckpoint: 'checkpoint.H',
};

describe('TEXT messaging contract', () => {
  it('uses the same send body and success DTO over REST and Socket.IO', () => {
    expect(textMessageSendBodySchema.parse(body)).toEqual(body);
    expect(
      textMessageSendInputSchema.parse({ requestId, payload: { channelId, ...body } }),
    ).toEqual({
      requestId,
      payload: { channelId, ...body },
    });
    const response = { requestId, data: { outcome: 'created', message } };
    expect(textMessageSendResponseSchema.parse(response)).toEqual(response);
    expect(textMessageSendAckSchema.parse(response)).toEqual(response);
  });

  it('counts Unicode code points and rejects blank text, malformed IDs and extra input fields', () => {
    expect(textMessageSendBodySchema.safeParse({ ...body, text: '👋'.repeat(4000) }).success).toBe(
      true,
    );
    for (const patch of [
      { text: '  \n ' },
      { text: '👋'.repeat(4001) },
      { clientMessageId: 'old-key' },
      { rootMessageId: 'bad-id' },
      { senderId },
      { actorId: senderId },
      { attachmentIds: [] },
      { callGeneration: 1 },
    ]) {
      expect(textMessageSendBodySchema.safeParse({ ...body, ...patch }).success).toBe(false);
    }
    expect(
      textMessageSendInputSchema.safeParse({ requestId: 'bad', payload: { channelId, ...body } })
        .success,
    ).toBe(false);
  });

  it('parses page limits explicitly and keeps history, snapshot and catch-up input distinct', () => {
    expect(textMessageHistoryQuerySchema.parse({})).toEqual({ mode: 'history', limit: 30 });
    expect(textMessageHistoryQuerySchema.parse({ limit: '50', cursor: 'older.page' })).toEqual({
      mode: 'history',
      limit: 50,
      cursor: 'older.page',
    });
    expect(textMessageHistoryQuerySchema.safeParse(snapshotQuery).success).toBe(true);
    expect(
      textMessageHistoryQuerySchema.safeParse({ ...catchUpQuery, cursor: 'sync.next' }).success,
    ).toBe(true);
    for (const query of [
      { limit: '51' },
      { limit: '1e1' },
      { limit: '30.0' },
      { limit: ' 30' },
      { limit: ['30', '40'] },
      { limit: true },
      { cursor: '' },
      { cursor: 'x'.repeat(2049) },
      { cursor: 'token with spaces' },
      { mode: 'catch-up', syncToken: 'sync.token', throughCheckpoint: 'checkpoint.H' },
      { mode: 'history', syncToken: 'sync.token' },
      { ...snapshotQuery, cursor: 'sync.next' },
      { ...catchUpQuery, rootMessageId: id },
    ]) {
      expect(textMessageHistoryQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it('accepts legacy messages in history and first snapshot, and requires commitSeq for catch-up and live', () => {
    const page = { scope, items: [legacyMessage], nextCursor: null };
    const response = (data: unknown) =>
      textMessageHistoryResponseSchema.safeParse({ requestId, data }).success;
    expect(response({ ...page, mode: 'history' })).toBe(true);
    expect(response({ ...page, mode: 'snapshot', throughCheckpoint: 'checkpoint.H' })).toBe(true);
    const catchUp = { ...page, mode: 'catch-up', throughCheckpoint: 'checkpoint.H' };
    expect(response(catchUp)).toBe(false);
    expect(response({ ...catchUp, items: [message], nextCursor: 'sync.next' })).toBe(true);
    expect(response({ ...catchUp, items: [] })).toBe(true);
    expect(
      textMessageCreatedEventSchema.safeParse({ subscriptionId, message: legacyMessage }).success,
    ).toBe(false);
    expect(committedTextMessageSchema.safeParse({ ...message, commitSeq: 0 }).success).toBe(false);
    expect(
      committedTextMessageSchema.safeParse({ ...message, commitSeq: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false);
    expect(
      textMessageSendAckSchema.safeParse({
        requestId,
        data: { outcome: 'created', message: legacyMessage },
      }).success,
    ).toBe(false);
    expect(
      textMessageSendAckSchema.safeParse({
        requestId,
        data: { outcome: 'existing', message: legacyMessage },
      }).success,
    ).toBe(true);
  });

  it('keeps timeline and thread pages separate and rejects a mismatched response scope', () => {
    const thread = { ...scope, rootMessageId: id };
    const reply = { ...messageFields, id: '507f1f77bcf86cd799439015', rootMessageId: id };
    const history = { mode: 'history', items: [reply], nextCursor: null };
    expect(textThreadParamsSchema.safeParse({ channelId, rootMessageId: id }).success).toBe(true);
    expect(
      textMessageHistoryResponseSchema.safeParse({ requestId, data: { ...history, scope: thread } })
        .success,
    ).toBe(true);
    expect(
      textMessageHistoryResponseSchema.safeParse({ requestId, data: { ...history, scope } })
        .success,
    ).toBe(false);
    expect(
      textMessageHistoryResponseSchema.safeParse({
        requestId,
        data: { ...history, scope: { ...thread, conversationId: id } },
      }).success,
    ).toBe(false);
    expect(
      committedTextMessageSchema.safeParse({ ...reply, commitSeq: 11, replyCount: 0 }).success,
    ).toBe(false);
  });

  it('parses subscription, events and ACL/stale error examples using the shared envelopes', () => {
    expect(
      textConversationSubscribeInputSchema.safeParse({ requestId, payload: channelScope }).success,
    ).toBe(true);
    expect(
      textConversationSubscribeInputSchema.safeParse({
        requestId,
        payload: { ...channelScope, afterCheckpoint: 'checkpoint.L' },
      }).success,
    ).toBe(true);
    expect(
      textConversationSubscribeInputSchema.safeParse({
        requestId,
        payload: { ...channelScope, canReadContent: true },
      }).success,
    ).toBe(false);
    expect(
      textConversationSubscribeInputSchema.safeParse({ requestId, payload: scope }).success,
    ).toBe(false);
    expect(
      textConversationSubscribeAckSchema.safeParse({ requestId, data: subscription }).success,
    ).toBe(true);
    expect(
      textConversationUnsubscribeInputSchema.safeParse({ requestId, payload: { subscriptionId } })
        .success,
    ).toBe(true);
    expect(textConversationUnsubscribeAckSchema.safeParse({ requestId, data: null }).success).toBe(
      true,
    );
    expect(textMessageCreatedEventSchema.safeParse({ subscriptionId, message }).success).toBe(true);
    for (const reason of ['ACCESS_REVOKED', 'RESYNC_REQUIRED']) {
      expect(
        textConversationInvalidatedEventSchema.safeParse({ subscriptionId, reason }).success,
      ).toBe(true);
    }
    for (const code of [
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION_ERROR',
      'CONFLICT',
    ]) {
      const error = { requestId, error: { code, message: 'Không thể tiếp tục thao tác.' } };
      expect(textConversationSubscribeAckSchema.safeParse(error).success).toBe(true);
      expect(textMessageSendAckSchema.safeParse(error).success).toBe(true);
    }
  });
});

describe('timeline reply count consumer fixture', () => {
  const root = { channelId, conversationId, rootMessageId: id };

  function timeline() {
    const ack = textConversationSubscribeAckSchema.parse({ requestId, data: subscription });
    let count = { replyCount: legacyMessage.replyCount, revision: -1 };
    function apply(update: typeof count) {
      if (update.revision > count.revision) count = update;
    }
    return {
      get replyCount() {
        return count.replyCount;
      },
      receive(payload: unknown) {
        const event = textThreadReplyCountUpdatedEventSchema.parse(payload);
        if (
          ack.data?.subscriptionId === event.subscriptionId &&
          event.channelId === channelId &&
          event.conversationId === conversationId &&
          event.rootMessageId === id
        ) {
          apply(event);
        }
      },
      reconcile(payload: unknown) {
        const response = textThreadReplyCountsResponseSchema.parse(payload);
        if (
          response.data?.channelId !== channelId ||
          response.data.conversationId !== conversationId
        ) {
          return;
        }
        for (const update of response.data.counts) {
          if (update.rootMessageId === id) apply(update);
        }
      },
    };
  }

  const first = { ...root, subscriptionId, replyCount: 1, revision: 11 };
  const second = { ...first, replyCount: 2, revision: 14 };

  it('updates a timeline-only subscriber without a thread message event', () => {
    const consumer = timeline();
    expect(consumer.replyCount).toBe(0);
    consumer.receive({ ...first, subscriptionId: requestId });
    expect(consumer.replyCount).toBe(0);
    consumer.receive(first);
    expect(consumer.replyCount).toBe(1);
  });

  it('keeps the absolute count for a retried reply and a duplicate event', () => {
    const consumer = timeline();
    const reply = {
      ...messageFields,
      id: '507f1f77bcf86cd799439015',
      rootMessageId: id,
      commitSeq: first.revision,
    };
    consumer.receive(first);
    const retry = textMessageSendAckSchema.parse({
      requestId,
      data: { outcome: 'existing', message: reply },
    });
    expect(retry.data?.message.clientMessageId).toBe(clientMessageId);
    expect(retry.data?.outcome).toBe('existing');
    consumer.receive(first);
    expect(consumer.replyCount).toBe(1);
  });

  it('recovers a missed update for an old root and ignores delayed events and reads', () => {
    const consumer = timeline();
    consumer.receive(first);
    const emptyCatchUp = textMessageHistoryResponseSchema.parse({
      requestId,
      data: {
        mode: 'catch-up',
        scope,
        throughCheckpoint: 'checkpoint.H',
        items: [],
        nextCursor: null,
      },
    });
    expect(emptyCatchUp.data?.items).toEqual([]);
    expect(textThreadReplyCountsQuerySchema.parse({ rootMessageIds: [id] }).rootMessageIds).toEqual(
      [id],
    );
    expect(textThreadReplyCountsQuerySchema.safeParse({ rootMessageIds: [id, id] }).success).toBe(
      false,
    );
    const result = (replyCount: number, revision: number) => ({
      requestId,
      data: { channelId, conversationId, counts: [{ rootMessageId: id, replyCount, revision }] },
    });
    consumer.reconcile(result(second.replyCount, second.revision));
    consumer.receive(first);
    consumer.reconcile(result(first.replyCount, first.revision));
    expect(consumer.replyCount).toBe(2);
  });
});
