import { describe, expect, it } from 'vitest';
import {
  groupJoinAckSchema,
  groupJoinInputSchema,
  hostTransferAckSchema,
  hostTransferInputSchema,
  sessionRoundIdSchema,
  sessionScopeRefSchema,
} from './session.js';

const requestId = '1c3b90f0-0c26-4e98-9a60-000000000001';
const sessionId = '507f1f77bcf86cd799439011';
const epoch = '1c3b90f0-0c26-4e98-9a60-000000000002';
const targetParticipantId = '507f1f77bcf86cd799439012';
const groupId = '1c3b90f0-0c26-4e98-9a60-000000000003';

const hostTransfer = {
  requestId,
  sessionId,
  epoch,
  callGeneration: 1,
  expectedPolicyRevision: 0,
  payload: { targetParticipantId },
};

describe('session commands', () => {
  it('parses a MAIN host transfer and its completed ack', () => {
    expect(hostTransferInputSchema.parse(hostTransfer)).toEqual(hostTransfer);
    const ack = {
      data: {
        status: 'completed',
        result: { hostParticipantId: targetParticipantId, policyRevision: 1 },
      },
      requestId,
    };
    expect(hostTransferAckSchema.parse(ack)).toEqual(ack);
  });

  it.each([
    { sessionId: epoch },
    { sessionId: '507f1f77bcf86cd79943901z' },
    { epoch: sessionId },
    { requestId: 'request-1' },
    { callGeneration: 0 },
    { callGeneration: '1' },
    { expectedPolicyRevision: -1 },
    { expectedPolicyRevision: 0.5 },
    { payload: { targetParticipantId: groupId } },
    { payload: {} },
  ])('rejects an invalid ID, counter or payload (%j)', (override) => {
    expect(hostTransferInputSchema.safeParse({ ...hostTransfer, ...override }).success).toBe(false);
  });

  it('rejects client-supplied actor and role fields at either level', () => {
    expect(
      hostTransferInputSchema.safeParse({ ...hostTransfer, actorId: targetParticipantId }).success,
    ).toBe(false);
    expect(
      hostTransferInputSchema.safeParse({
        ...hostTransfer,
        payload: { targetParticipantId, role: 'HOST' },
      }).success,
    ).toBe(false);
  });

  it('accepts common error acks and rejects malformed or ambiguous acks', () => {
    const conflict = {
      error: { code: 'CONFLICT', message: 'Trạng thái phiên đã thay đổi.' },
      requestId,
    };
    expect(hostTransferAckSchema.parse(conflict)).toEqual(conflict);
    expect(hostTransferAckSchema.safeParse({ ...conflict, requestId: 'request-1' }).success).toBe(
      false,
    );
    expect(hostTransferAckSchema.safeParse({ ...conflict, data: {} }).success).toBe(false);
    expect(
      hostTransferAckSchema.safeParse({ data: { status: 'completed' }, requestId }).success,
    ).toBe(false);
  });

  it('requires runtime UUIDs for group join and a GROUP scope in its result', () => {
    const input = { ...hostTransfer, payload: { groupId } };
    expect(groupJoinInputSchema.parse(input)).toEqual(input);
    expect(
      groupJoinInputSchema.safeParse({ ...input, payload: { groupId: sessionId } }).success,
    ).toBe(false);
    const ack = {
      data: {
        status: 'completed',
        result: { scope: { type: 'GROUP', groupId }, audienceEpoch: 1, policyRevision: 1 },
      },
      requestId,
    };
    expect(groupJoinAckSchema.parse(ack)).toEqual(ack);
    expect(
      groupJoinAckSchema.safeParse({
        ...ack,
        data: { ...ack.data, result: { ...ack.data.result, scope: { type: 'MAIN' } } },
      }).success,
    ).toBe(false);
  });

  it('distinguishes MAIN and GROUP references without accepting a client-supplied mode', () => {
    expect(sessionScopeRefSchema.parse({ type: 'MAIN' })).toEqual({ type: 'MAIN' });
    expect(sessionScopeRefSchema.parse({ type: 'GROUP', groupId })).toEqual({
      type: 'GROUP',
      groupId,
    });
    expect(sessionScopeRefSchema.safeParse({ type: 'MAIN', groupId }).success).toBe(false);
    expect(
      sessionScopeRefSchema.safeParse({ type: 'GROUP', groupId, mode: 'ACTIVITY' }).success,
    ).toBe(false);
    expect(sessionRoundIdSchema.safeParse(epoch).success).toBe(true);
    expect(sessionRoundIdSchema.safeParse(sessionId).success).toBe(false);
  });
});
