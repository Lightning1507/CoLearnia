import {
  requestIdSchema,
  isSessionProjectionCurrent,
  sessionControlBudget,
  sessionProjectionCursorSchema,
  sessionProjectionEventNameSchema,
  sessionProjectionEventSchema,
  sessionProjectionSchema,
  sessionSnapshotSchema,
} from '@colearnia/contracts';
import type {
  CommonErrorCode,
  SessionProjection,
  SessionProjectionCursor,
  SessionProjectionEventName,
  SessionSnapshotPart,
} from '@colearnia/contracts';
import { projectSessionFor } from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';

type Failure = { ok: false; errorCode: CommonErrorCode };
const fail = (errorCode: CommonErrorCode): Failure => ({ ok: false, errorCode });
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function cursorFor(
  projection: SessionProjection,
  projectionSequence: number,
): SessionProjectionCursor {
  const { viewer } = projection;
  return {
    sessionId: projection.sessionId,
    epoch: projection.epoch,
    participantId: viewer.participantId,
    callGeneration: viewer.callGeneration,
    audienceEpoch: viewer.audienceEpoch,
    projectionSequence,
    policyRevision: projection.policyRevision,
    scope:
      viewer.scope.type === 'MAIN'
        ? { type: 'MAIN' }
        : { type: 'GROUP', groupId: viewer.scope.groupId },
  };
}

export function createSessionProjectionCursor(input: SessionPolicyInput) {
  const result = projectSessionFor(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    cursor: cursorFor(sessionProjectionSchema.parse(result.projection), 0),
  };
}

function capture(input: SessionPolicyInput, cursor: SessionProjectionCursor) {
  const result = projectSessionFor(input);
  if (!result.ok) return result;
  if (!sessionProjectionCursorSchema.safeParse(cursor).success) return fail('VALIDATION_ERROR');
  const projection = sessionProjectionSchema.parse(result.projection);
  const next = cursorFor(projection, cursor.projectionSequence);
  if (!isSessionProjectionCurrent(next, cursor)) {
    return fail('CONFLICT');
  }
  return { ok: true as const, projection, nextCursor: next };
}

// Pure preparation: caller commits nextCursor only when enqueue succeeds under its gate.
export function prepareSessionProjectionEvent(
  input: SessionPolicyInput,
  cursor: SessionProjectionCursor,
  eventName: SessionProjectionEventName,
) {
  const result = capture(input, cursor);
  if (!result.ok) return result;
  if (!sessionProjectionEventNameSchema.safeParse(eventName).success)
    return fail('VALIDATION_ERROR');
  if (cursor.projectionSequence === Number.MAX_SAFE_INTEGER) return fail('CONFLICT');
  const nextCursor = { ...result.nextCursor, projectionSequence: cursor.projectionSequence + 1 };
  const event = sessionProjectionEventSchema.parse({
    event: eventName,
    ...nextCursor,
    projection: result.projection,
  });
  if (bytes(event) > sessionControlBudget.maxControlBytes) return fail('PAYLOAD_TOO_LARGE');
  return { ok: true as const, event, nextCursor };
}

export function prepareSessionSnapshot(
  input: SessionPolicyInput,
  cursor: SessionProjectionCursor,
  identity: { requestId: string; snapshotId: string },
) {
  const result = capture(input, cursor);
  if (!result.ok) return result;
  if (
    !requestIdSchema.safeParse(identity.requestId).success ||
    !requestIdSchema.safeParse(identity.snapshotId).success
  ) {
    return fail('VALIDATION_ERROR');
  }
  // Capture and serialize exactly once; parts cannot observe later runtime mutations.
  const snapshot = sessionSnapshotSchema.parse({
    event: 'session.snapshot',
    ...result.nextCursor,
    ...identity,
    projection: result.projection,
  });
  const serialized = JSON.stringify(snapshot.projection);
  if (Buffer.byteLength(serialized, 'utf8') > sessionControlBudget.maxSnapshotBytes) {
    return fail('PAYLOAD_TOO_LARGE');
  }
  const header = { event: snapshot.event, ...result.nextCursor, ...identity };
  const parts: SessionSnapshotPart[] = [];
  let offset = 0;
  let totalBytes = 0;
  while (offset < serialized.length) {
    if (parts.length === sessionControlBudget.maxSnapshotParts) return fail('PAYLOAD_TOO_LARGE');
    let low = 1;
    let high = Math.min(serialized.length - offset, sessionControlBudget.maxSnapshotPartBytes);
    let length = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const size = bytes({
        ...header,
        partIndex: parts.length,
        // Reserve the largest valid header. Final partCount is at most this value.
        partCount: sessionControlBudget.maxSnapshotParts,
        fragment: serialized.slice(offset, offset + middle),
      });
      if (size <= sessionControlBudget.maxSnapshotPartBytes) {
        length = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    // Keep a UTF-16 surrogate pair together across fragment boundaries.
    const last = serialized.charCodeAt(offset + length - 1);
    if (last >= 0xd800 && last <= 0xdbff) length--;
    if (length <= 0) return fail('PAYLOAD_TOO_LARGE');
    const part = {
      ...header,
      scope: { ...header.scope },
      partIndex: parts.length,
      partCount: sessionControlBudget.maxSnapshotParts,
      fragment: serialized.slice(offset, offset + length),
    };
    totalBytes += bytes(part);
    if (totalBytes > sessionControlBudget.maxSnapshotBytes) return fail('PAYLOAD_TOO_LARGE');
    parts.push(part);
    offset += length;
  }
  for (const part of parts) part.partCount = parts.length;
  return { ok: true as const, parts, nextCursor: result.nextCursor };
}
