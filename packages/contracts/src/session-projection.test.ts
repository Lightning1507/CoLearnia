import { describe, expect, it } from 'vitest';
import {
  sessionEndedEventSchema,
  sessionProjectionEventSchema,
  sessionProjectionSchema,
  sessionResyncInputSchema,
  sessionResyncAckSchema,
  sessionSnapshotPartSchema,
  sessionSnapshotSchema,
} from './session-projection.js';
import type { SessionProjection } from './session-projection.js';
import {
  assembleSessionSnapshot,
  classifySessionProjectionEvent,
  isSessionProjectionCurrent,
  isSessionEndedNoticeCurrent,
} from './session-snapshot.js';
import { commonErrorCodeSchema, commonErrorHttpStatus } from './errors.js';

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const header = {
  sessionId: '1'.repeat(24),
  epoch: uuid(1),
  participantId: '2'.repeat(24),
  callGeneration: 1,
  audienceEpoch: 0,
  projectionSequence: 0,
  policyRevision: 8,
  scope: { type: 'MAIN' as const },
};
const projection: SessionProjection = {
  sessionId: header.sessionId,
  epoch: header.epoch,
  phase: 'GUIDANCE',
  policyRevision: header.policyRevision,
  hostParticipantId: header.participantId,
  viewer: {
    participantId: header.participantId,
    role: 'HOST',
    callGeneration: 1,
    audienceEpoch: 0,
    scope: header.scope,
  },
  participants: [{ participantId: header.participantId, displayName: 'Host', role: 'HOST' }],
  groups: [],
  permissions: {
    publishMic: true,
    publishCamera: true,
    publishScreen: true,
    readBoard: true,
    drawBoard: true,
    freezeBoard: false,
  },
};
const snapshot = () => ({
  event: 'session.snapshot',
  ...structuredClone(header),
  requestId: uuid(2),
  snapshotId: uuid(3),
  projection: structuredClone(projection),
});

describe('session projection wire contracts', () => {
  it('accepts a public snapshot, replacement event and terminal notice', () => {
    expect(sessionSnapshotSchema.parse(snapshot()).projection).toEqual(projection);
    expect(
      sessionProjectionEventSchema.safeParse({
        event: 'host.changed',
        ...header,
        projectionSequence: 1,
        projection,
      }).success,
    ).toBe(true);
    expect(sessionEndedEventSchema.safeParse({ event: 'session.ended', ...header }).success).toBe(
      true,
    );
    expect(
      sessionEndedEventSchema.safeParse({ event: 'session.ended', ...header, projection }).success,
    ).toBe(false);
  });

  it.each(['auth', 'access', 'rosterParticipantIds', 'producerId', 'frameUrl', 'messages'])(
    'rejects internal or private field %s in public projection',
    (key) => {
      expect(sessionProjectionSchema.safeParse({ ...projection, [key]: 'private' }).success).toBe(
        false,
      );
      expect(
        sessionProjectionSchema.safeParse({
          ...projection,
          participants: [{ ...projection.participants[0], [key]: 'private' }],
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['sessionId', '3'.repeat(24)],
    ['epoch', uuid(9)],
    ['participantId', '3'.repeat(24)],
    ['callGeneration', 2],
    ['audienceEpoch', 1],
    ['policyRevision', 9],
    ['scope', { type: 'GROUP', groupId: uuid(4) }],
  ])('rejects header/projection mismatch at %s', (key, value) => {
    const data = { ...snapshot(), [key as string]: value };
    expect(sessionSnapshotSchema.safeParse(data).success).toBe(false);
    expect(
      sessionProjectionEventSchema.safeParse({
        ...header,
        event: 'session.changed',
        projection,
        [key as string]: value,
      }).success,
    ).toBe(false);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sequence %s', (sequence) => {
    expect(
      sessionSnapshotSchema.safeParse({ ...snapshot(), projectionSequence: sequence }).success,
    ).toBe(false);
  });

  it('keeps resync independent from an expected mutation revision', () => {
    const resync = {
      requestId: uuid(2),
      sessionId: header.sessionId,
      epoch: header.epoch,
      callGeneration: 1,
      payload: { lastProjectionSequence: 1, lastPolicyRevision: 3 },
    };
    expect(sessionResyncInputSchema.safeParse(resync).success).toBe(true);
    expect(sessionResyncInputSchema.safeParse({ ...resync, payload: {} }).success).toBe(true);
    expect(
      sessionResyncInputSchema.safeParse({ ...resync, expectedPolicyRevision: 3 }).success,
    ).toBe(false);
  });

  it('validates part indexes, counts and required identity fields', () => {
    const base = { event: 'session.snapshot', ...header, requestId: uuid(2), snapshotId: uuid(3) };
    const part = { ...base, partIndex: 0, partCount: 1, fragment: JSON.stringify(projection) };
    expect(sessionSnapshotPartSchema.safeParse(part).success).toBe(true);
    for (const update of [
      { partIndex: 1 },
      { partIndex: -1 },
      { partCount: 0 },
      { partCount: 65 },
      { fragment: '' },
      { snapshotId: 'invalid' },
      { auth: 'private' },
    ]) {
      expect(sessionSnapshotPartSchema.safeParse({ ...part, ...update }).success).toBe(false);
    }
  });
});

describe('multipart snapshot assembly', () => {
  function parts() {
    const { projection, ...base } = snapshot();
    const json = JSON.stringify(projection);
    const middle = Math.floor(json.length / 2);
    return [json.slice(0, middle), json.slice(middle)].map((fragment, partIndex) => ({
      ...base,
      partIndex,
      partCount: 2,
      fragment,
    }));
  }
  const expected = {
    requestId: uuid(2),
    cursor: header,
    snapshot: { snapshotId: uuid(3), partCount: 2 },
  };

  it('assembles reversed parts once and validates the final projection', () => {
    const result = assembleSessionSnapshot(parts().reverse(), expected);
    expect(result.ok && result.snapshot.projection).toEqual(projection);
  });

  it('rejects missing, duplicated or mixed-context parts', () => {
    const data = parts();
    for (const values of [
      [data[0]],
      [data[0], data[0]],
      [data[0], { ...data[1], snapshotId: uuid(8) }],
      [data[0], { ...data[1], requestId: uuid(8) }],
      [data[0], { ...data[1], projectionSequence: 1 }],
      [data[0], { ...data[1], audienceEpoch: 1 }],
    ]) {
      expect(assembleSessionSnapshot(values, expected)).toEqual({
        ok: false,
        errorCode: 'CONFLICT',
      });
    }
  });

  it('rejects earlier resync responses, old audiences and sequence rollback', () => {
    for (const minimum of [
      { ...expected, requestId: uuid(9) },
      { ...expected, cursor: { ...header, audienceEpoch: 1 } },
      { ...expected, cursor: { ...header, projectionSequence: 1 } },
      { ...expected, cursor: { ...header, callGeneration: 2 } },
    ]) {
      expect(assembleSessionSnapshot(parts(), minimum)).toEqual({
        ok: false,
        errorCode: 'CONFLICT',
      });
    }
    expect(isSessionProjectionCurrent({ ...header, policyRevision: 99 }, header)).toBe(true);
  });

  it('rejects invalid JSON, an invalid final projection and oversized serialized parts', () => {
    const data = parts();
    const single = { ...expected, snapshot: { ...expected.snapshot, partCount: 1 } };
    expect(assembleSessionSnapshot([{ ...data[0], partCount: 1, fragment: '{' }], single)).toEqual({
      ok: false,
      errorCode: 'INVALID_JSON',
    });
    expect(assembleSessionSnapshot([{ ...data[0], partCount: 1, fragment: '{}' }], single)).toEqual(
      { ok: false, errorCode: 'VALIDATION_ERROR' },
    );
    expect(
      assembleSessionSnapshot([{ ...data[0], partCount: 1, fragment: '😀'.repeat(5000) }], single),
    ).toEqual({ ok: false, errorCode: 'PAYLOAD_TOO_LARGE' });
  });

  it('binds the assembled snapshot to the descriptor returned by the resync ack', () => {
    for (const descriptor of [
      { snapshotId: uuid(9), partCount: 2 },
      { snapshotId: uuid(3), partCount: 1 },
    ]) {
      expect(assembleSessionSnapshot(parts(), { ...expected, snapshot: descriptor })).toEqual({
        ok: false,
        errorCode: 'CONFLICT',
      });
    }
  });
});

describe('resync acknowledgements', () => {
  it('returns a completed descriptor with the requestId used by snapshot parts', () => {
    const ack = {
      requestId: uuid(2),
      data: { status: 'completed', result: { snapshotId: uuid(3), partCount: 2 } },
    };
    expect(sessionResyncAckSchema.parse(ack)).toEqual(ack);
    for (const result of [
      { snapshotId: 'bad', partCount: 2 },
      { snapshotId: uuid(3), partCount: 0 },
      { snapshotId: uuid(3), partCount: 65 },
    ]) {
      expect(
        sessionResyncAckSchema.safeParse({ ...ack, data: { ...ack.data, result } }).success,
      ).toBe(false);
    }
  });

  it('represents SESSION_ENDED as a terminal resync failure without a snapshot descriptor', () => {
    const ack = {
      requestId: uuid(2),
      error: { code: 'SESSION_ENDED', message: 'Phiên học đã kết thúc.' },
    };
    expect(sessionResyncAckSchema.parse(ack)).toEqual(ack);
    expect(commonErrorCodeSchema.parse(ack.error.code)).toBe('SESSION_ENDED');
    expect(commonErrorHttpStatus.SESSION_ENDED).toBe(410);
    expect(
      sessionResyncAckSchema.safeParse({
        ...ack,
        data: { status: 'completed', result: { snapshotId: uuid(3), partCount: 2 } },
      }).success,
    ).toBe(false);
  });
});

describe('terminal call notices', () => {
  const notice = sessionEndedEventSchema.parse({
    event: 'session.ended',
    ...header,
    projectionSequence: 3,
  });
  it.each([
    ['sessionId', '3'.repeat(24)],
    ['epoch', uuid(9)],
    ['participantId', '3'.repeat(24)],
    ['callGeneration', 2],
  ])('ignores a terminal notice from another %s', (key, value) => {
    const stale = sessionEndedEventSchema.parse({ ...notice, [key as string]: value });
    expect(isSessionEndedNoticeCurrent(stale, header)).toBe(false);
  });
  it('ends the matching call across a gap/scope change, but ignores duplicates', () => {
    const current = {
      ...header,
      audienceEpoch: 2,
      scope: { type: 'GROUP' as const, groupId: uuid(4) },
    };
    expect(isSessionEndedNoticeCurrent(notice, current)).toBe(true);
    expect(isSessionEndedNoticeCurrent(notice, { ...current, projectionSequence: 3 })).toBe(false);
    expect(isSessionEndedNoticeCurrent(notice, { ...current, projectionSequence: 4 })).toBe(false);
  });
});

describe('recipient event ordering', () => {
  const event = sessionProjectionEventSchema.parse({
    event: 'session.changed',
    ...header,
    projectionSequence: 1,
    projection,
  });
  it('applies only the next sequence and ignores duplicates or another ownership', () => {
    expect(classifySessionProjectionEvent(event, header)).toBe('APPLY');
    expect(classifySessionProjectionEvent(event, { ...header, projectionSequence: 1 })).toBe(
      'IGNORE',
    );
    expect(classifySessionProjectionEvent(event, { ...header, callGeneration: 2 })).toBe('IGNORE');
    expect(classifySessionProjectionEvent(event, { ...header, audienceEpoch: 1 })).toBe('IGNORE');
  });
  it('requests resync on gaps, new audiences or inconsistent scope/revision', () => {
    expect(classifySessionProjectionEvent({ ...event, projectionSequence: 2 }, header)).toBe(
      'RESYNC',
    );
    expect(classifySessionProjectionEvent({ ...event, audienceEpoch: 1 }, header)).toBe('RESYNC');
    expect(
      classifySessionProjectionEvent(
        { ...event, scope: { type: 'GROUP', groupId: uuid(5) } },
        header,
      ),
    ).toBe('RESYNC');
    expect(classifySessionProjectionEvent({ ...event, policyRevision: 7 }, header)).toBe('RESYNC');
    expect(classifySessionProjectionEvent({ ...event, policyRevision: 100 }, header)).toBe('APPLY');
  });
});
