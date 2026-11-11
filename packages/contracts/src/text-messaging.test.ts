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
