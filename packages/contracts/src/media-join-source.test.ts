import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  apiErrorSchema,
  apiResponseSchema,
  commandAckSchema,
  requestIdSchema,
  resourceIdSchema,
} from './common.js';
import { liveContextSchema } from './session-context.js';
import {
  mediaSourceSchema,
  sessionCommandEnvelopeSchema,
  sessionEpochSchema,
  sessionIdSchema,
  sessionParticipantIdSchema,
  sessionScopeRefSchema,
} from './session.js';

// Review-only shapes for SCRUM-44 examples. Public media schemas follow in SCRUM-57/58.
const callGenerationSchema = z.number().int().positive();
const joinExampleSchema = z.strictObject({
  requestId: requestIdSchema,
  ticket: z.string().min(1),
  takeover: z
    .strictObject({ confirmed: z.literal(true), expectedCallGeneration: callGenerationSchema })
    .optional(),
});
const joinAckExampleSchema = commandAckSchema(
  z.strictObject({
    status: z.literal('completed'),
    result: z.strictObject({
      participantId: sessionParticipantIdSchema,
      callGeneration: callGenerationSchema,
      snapshot: z.strictObject({
        requestId: requestIdSchema,
        sessionId: sessionIdSchema,
        epoch: sessionEpochSchema,
        callGeneration: callGenerationSchema,
        audienceEpoch: z.number().int().nonnegative(),
        projectionSequence: z.number().int().nonnegative(),
        policyRevision: z.number().int().nonnegative(),
        scope: sessionScopeRefSchema,
      }),
    }),
  }),
);
const ticketResponseExampleSchema = apiResponseSchema(
  z.strictObject({
    sessionId: sessionIdSchema,
    epoch: sessionEpochSchema,
    ticket: joinExampleSchema.shape.ticket,
    expiresAt: z.iso.datetime(),
  }),
);
const readyExampleSchema = sessionCommandEnvelopeSchema({
  consumerId: resourceIdSchema,
  sourceId: resourceIdSchema,
  sourceGeneration: z.number().int().positive(),
  expectedSourceRevision: z.number().int().nonnegative(),
});

const sessionId = '1'.repeat(24);
const participantId = '2'.repeat(24);
const epoch = '10000000-0000-4000-8000-000000000003';
const mainScope = sessionScopeRefSchema.parse({ type: 'MAIN' });
const firstJoin = {
  requestId: '10000000-0000-4000-8000-000000000001',
  ticket: 'fixture-join-ticket',
};
const context = liveContextSchema.parse({
  auth: {
    userId: '4'.repeat(24),
    authSessionId: '5'.repeat(24),
    expiresAt: '2026-11-07T12:30:00Z',
  },
  access: {
    workspaceId: '6'.repeat(24),
    channelId: '7'.repeat(24),
    channelType: 'LIVE',
    membershipId: '8'.repeat(24),
    membershipIncarnation: 1,
    membershipRevision: 0,
    channelRevision: 0,
    canReadContent: true,
    canManageChannel: false,
  },
  sessionId,
  participantId,
  epoch,
  callGeneration: 2,
  role: 'MEMBER',
  host: { participantId: '3'.repeat(24), userId: '9'.repeat(24) },
  scope: mainScope,
  audienceEpoch: 0,
  policyRevision: 9,
});

const source = {
  sourceId: 'fixture-screen-main',
  sourceGeneration: 1,
  sourceRevision: 3,
  producerId: 'fixture-producer-main',
  ownerParticipantId: sessionParticipantIdSchema.parse('3'.repeat(24)),
  sourceKind: mediaSourceSchema.parse('SCREEN'),
  scope: mainScope,
  kind: 'video',
  publicationState: 'PUBLISHING',
};

function completedJoin(requestId: string) {
  return {
    data: {
      status: 'completed',
      result: {
        participantId: context.participantId,
        callGeneration: context.callGeneration,
        snapshot: {
          requestId,
          sessionId: context.sessionId,
          epoch: context.epoch,
          callGeneration: context.callGeneration,
          audienceEpoch: context.audienceEpoch,
          projectionSequence: 0,
          policyRevision: context.policyRevision,
          scope: mainScope,
        },
      },
    },
    requestId,
  };
}

const ready = readyExampleSchema.parse({
  requestId: '10000000-0000-4000-8000-000000000002',
  sessionId,
  epoch,
  callGeneration: 2,
  expectedPolicyRevision: 9,
  payload: {
    consumerId: 'fixture-consumer-main',
    sourceId: source.sourceId,
    sourceGeneration: source.sourceGeneration,
    expectedSourceRevision: source.sourceRevision,
  },
});

type ReadyExample = z.infer<typeof readyExampleSchema>;
type SourceStamp = Pick<typeof source, 'sourceId' | 'sourceGeneration' | 'sourceRevision'>;
type SourceDecision = SourceStamp | 'NOT_FOUND' | 'FORBIDDEN';

// Fixture consumer only. M4 supplies a fresh authorized context and an audience verdict.
// Real adapters also verify socket binding, expiry, consumer ownership and resource lifecycle.
function reviewReady(
  command: ReadyExample,
  sourceDecision: SourceDecision,
  resume: (consumerId: string) => void,
) {
  if (typeof sourceDecision === 'string') return sourceDecision;
  if (
    command.sessionId !== context.sessionId ||
    command.epoch !== context.epoch ||
    command.callGeneration !== context.callGeneration ||
    command.expectedPolicyRevision !== context.policyRevision
  ) {
    return 'CONFLICT';
  }
  if (
    command.payload.sourceId !== sourceDecision.sourceId ||
    command.payload.sourceGeneration !== sourceDecision.sourceGeneration ||
    command.payload.expectedSourceRevision !== sourceDecision.sourceRevision
  ) {
    return 'SOURCE_CHANGED';
  }
  resume(command.payload.consumerId);
  return 'completed';
}

describe('SCRUM-44 join and media examples', () => {
  it('uses a ticket before join and the server-assigned context for a subsequent MAIN command', () => {
    const issued = ticketResponseExampleSchema.parse({
      data: { sessionId, epoch, ticket: firstJoin.ticket, expiresAt: '2026-11-07T12:01:00Z' },
      requestId: '10000000-0000-4000-8000-000000000004',
    });
    const join = joinExampleSchema.parse({ ...firstJoin, ticket: issued.data.ticket });
    expect(join).toEqual(firstJoin);
    expect(joinExampleSchema.safeParse({ ...join, callGeneration: 2 }).success).toBe(false);

    const ack = joinAckExampleSchema.parse(completedJoin(join.requestId));
    if (!('data' in ack)) throw new Error('Expected a completed join fixture');
    const { participantId: joinedParticipant, callGeneration, snapshot } = ack.data.result;
    expect(joinedParticipant).toBe(context.participantId);
    expect(snapshot).toMatchObject({
      requestId: join.requestId,
      sessionId: issued.data.sessionId,
      epoch: issued.data.epoch,
      callGeneration,
    });

    const command = readyExampleSchema.parse({
      ...ready,
      sessionId: snapshot.sessionId,
      epoch: snapshot.epoch,
      callGeneration,
      expectedPolicyRevision: snapshot.policyRevision,
    });
    const resume = vi.fn<(consumerId: string) => void>();
    expect(reviewReady(command, source, resume)).toBe('completed');
    expect(resume).toHaveBeenCalledExactlyOnceWith(command.payload.consumerId);
  });

  it('rejects internal auth and access fields in a public join snapshot', () => {
    const ack = completedJoin(firstJoin.requestId);
    for (const field of [{ auth: context.auth }, { access: context.access }]) {
      const result = { ...ack.data.result, snapshot: { ...ack.data.result.snapshot, ...field } };
      expect(
        joinAckExampleSchema.safeParse({ ...ack, data: { ...ack.data, result } }).success,
      ).toBe(false);
    }
  });

  it('uses a new intent and the same ticket after an explicit takeover confirmation', () => {
    const join = joinExampleSchema.parse(firstJoin);
    const conflict = {
      error: { code: 'CALL_ALREADY_ACTIVE', message: 'Bạn đang có một cuộc gọi khác.' },
      requestId: join.requestId,
    };
    expect(joinAckExampleSchema.parse(conflict)).toEqual(conflict);

    // The fixture injects the old ownership generation separately from the common error ack.
    const currentCallGeneration = 1;
    const confirmation = joinExampleSchema.parse({
      ticket: join.ticket,
      requestId: '10000000-0000-4000-8000-000000000006',
      takeover: { confirmed: true, expectedCallGeneration: currentCallGeneration },
    });
    expect(confirmation.requestId).not.toBe(conflict.requestId);
    expect(confirmation.ticket).toBe(join.ticket);
    expect(confirmation.takeover?.expectedCallGeneration).toBe(currentCallGeneration);
    expect(joinAckExampleSchema.parse(completedJoin(confirmation.requestId))).toMatchObject({
      requestId: confirmation.requestId,
      data: { result: { callGeneration: 2, snapshot: { requestId: confirmation.requestId } } },
    });

    for (const takeover of [{ confirmed: true }, { confirmed: false, expectedCallGeneration: 1 }]) {
      expect(joinExampleSchema.safeParse({ ...confirmation, takeover }).success).toBe(false);
    }
  });

  it('does not resume a private ACTIVITY source withheld by the audience projection', () => {
    const command = readyExampleSchema.parse({
      ...ready,
      payload: { ...ready.payload, sourceId: 'fixture-screen-activity' },
    });
    const resume = vi.fn<(consumerId: string) => void>();
    expect(reviewReady(command, 'NOT_FOUND', resume)).toBe('NOT_FOUND');
    expect(resume).not.toHaveBeenCalled();
  });

  it('does not resume a visible source when M4 denies the operation', () => {
    const resume = vi.fn<(consumerId: string) => void>();
    expect(reviewReady(ready, 'FORBIDDEN', resume)).toBe('FORBIDDEN');
    expect(resume).not.toHaveBeenCalled();
  });

  it.each([
    { epoch: '10000000-0000-4000-8000-000000000005' },
    { callGeneration: 1 },
    { expectedPolicyRevision: 8 },
  ])('rejects a valid-shaped command carrying old ownership or state (%j)', (stale) => {
    const command = readyExampleSchema.parse({ ...ready, ...stale });
    const resume = vi.fn<(consumerId: string) => void>();
    const code = reviewReady(command, source, resume);
    const ack = apiErrorSchema.parse({
      error: { code, message: 'Trạng thái cuộc gọi đã thay đổi.' },
      requestId: command.requestId,
    });
    expect(ack.error.code).toBe('CONFLICT');
    expect(ack.requestId).toBe(ready.requestId);
    expect(resume).not.toHaveBeenCalled();
  });

  it.each([{ sourceRevision: 4 }, { sourceGeneration: 2, sourceRevision: 0 }])(
    'does not resume a Consumer after its source changed (%j)',
    (changedSource) => {
      const resume = vi.fn<(consumerId: string) => void>();
      expect(reviewReady(ready, { ...source, ...changedSource }, resume)).toBe('SOURCE_CHANGED');
      expect(resume).not.toHaveBeenCalled();
    },
  );
});
