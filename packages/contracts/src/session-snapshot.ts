import { requestIdSchema } from './common.js';
import { sessionControlBudget } from './session-context.js';
import {
  sameSessionScope,
  sessionProjectionCursorSchema,
  sessionSnapshotPartSchema,
  sessionSnapshotSchema,
} from './session-projection.js';
import type {
  SessionProjectionCursor,
  SessionProjectionEvent,
  SessionSnapshotPart,
} from './session-projection.js';

// Call after strict event parsing. A new audience invalidates the old private context.
export function classifySessionProjectionEvent(
  event: SessionProjectionEvent,
  current: SessionProjectionCursor,
): 'APPLY' | 'IGNORE' | 'RESYNC' {
  if (
    event.sessionId !== current.sessionId ||
    event.epoch !== current.epoch ||
    event.participantId !== current.participantId ||
    event.callGeneration !== current.callGeneration
  ) {
    return 'IGNORE';
  }
  if (event.audienceEpoch > current.audienceEpoch) return 'RESYNC';
  if (
    event.audienceEpoch < current.audienceEpoch ||
    event.projectionSequence <= current.projectionSequence
  ) {
    return 'IGNORE';
  }
  if (
    !sameSessionScope(event.scope, current.scope) ||
    event.projectionSequence !== current.projectionSequence + 1 ||
    event.policyRevision < current.policyRevision
  ) {
    return 'RESYNC';
  }
  return 'APPLY';
}

// Ordering/identity only; this never replaces server authentication or content ACL.
export function isSessionProjectionCurrent(
  candidate: SessionProjectionCursor,
  minimum: SessionProjectionCursor,
): boolean {
  return (
    candidate.sessionId === minimum.sessionId &&
    candidate.epoch === minimum.epoch &&
    candidate.participantId === minimum.participantId &&
    candidate.callGeneration === minimum.callGeneration &&
    candidate.audienceEpoch >= minimum.audienceEpoch &&
    candidate.projectionSequence >= minimum.projectionSequence &&
    candidate.policyRevision >= minimum.policyRevision &&
    (candidate.audienceEpoch > minimum.audienceEpoch ||
      sameSessionScope(candidate.scope, minimum.scope))
  );
}

const fail = (
  errorCode: 'VALIDATION_ERROR' | 'INVALID_JSON' | 'CONFLICT' | 'PAYLOAD_TOO_LARGE',
) => ({
  ok: false as const,
  errorCode,
});

// Keep this package independent from DOM and Node APIs. JSON.stringify escapes lone surrogates.
function jsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) return 0;
  let bytes = 0;
  for (const character of json) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function assembleSessionSnapshot(
  values: readonly unknown[],
  expected: { requestId: string; cursor: SessionProjectionCursor },
) {
  if (
    !sessionProjectionCursorSchema.safeParse(expected.cursor).success ||
    !requestIdSchema.safeParse(expected.requestId).success ||
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return fail('VALIDATION_ERROR');
  }
  if (values.length > sessionControlBudget.maxSnapshotParts) return fail('PAYLOAD_TOO_LARGE');
  const parts: SessionSnapshotPart[] = [];
  let totalBytes = 0;
  for (const value of values) {
    let bytes: number;
    try {
      bytes = jsonBytes(value);
    } catch {
      return fail('INVALID_JSON');
    }
    totalBytes += bytes;
    if (
      bytes > sessionControlBudget.maxSnapshotPartBytes ||
      totalBytes > sessionControlBudget.maxSnapshotBytes
    ) {
      return fail('PAYLOAD_TOO_LARGE');
    }
    const parsed = sessionSnapshotPartSchema.safeParse(value);
    if (!parsed.success) return fail('VALIDATION_ERROR');
    parts.push(parsed.data);
  }
  parts.sort((left, right) => left.partIndex - right.partIndex);
  const first = parts[0]!;
  const header = snapshotHeader(first);
  const contextKey = JSON.stringify(header);
  for (const [index, part] of parts.entries()) {
    const partHeader = snapshotHeader(part);
    if (
      part.partIndex !== index ||
      part.partCount !== parts.length ||
      JSON.stringify(partHeader) !== contextKey
    ) {
      return fail('CONFLICT');
    }
  }
  if (
    header.requestId !== expected.requestId ||
    !isSessionProjectionCurrent(first, expected.cursor)
  ) {
    return fail('CONFLICT');
  }
  let projection: unknown;
  try {
    projection = JSON.parse(parts.map((part) => part.fragment).join(''));
  } catch {
    return fail('INVALID_JSON');
  }
  const result = sessionSnapshotSchema.safeParse({ ...header, projection });
  if (!result.success) return fail('VALIDATION_ERROR');
  return { ok: true as const, snapshot: result.data };
}

function snapshotHeader(part: SessionSnapshotPart) {
  return {
    event: part.event,
    sessionId: part.sessionId,
    epoch: part.epoch,
    participantId: part.participantId,
    callGeneration: part.callGeneration,
    audienceEpoch: part.audienceEpoch,
    projectionSequence: part.projectionSequence,
    policyRevision: part.policyRevision,
    scope: part.scope,
    requestId: part.requestId,
    snapshotId: part.snapshotId,
  };
}
