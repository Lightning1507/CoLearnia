import { describe, expect, it } from 'vitest';
import {
  assembleSessionSnapshot,
  sessionControlBudget,
  sessionProjectionEventSchema,
  sessionResyncAckSchema,
  sessionSnapshotPartSchema,
} from '@colearnia/contracts';
import {
  createSessionProjectionCursor,
  prepareSessionProjectionEvent,
  prepareSessionSnapshot,
} from './session-projection.js';
import type {
  PolicyGroup,
  PolicyParticipant,
  SessionPolicyInput,
} from '../policy/session-policy.js';
import type { SessionProjectionCursor, SessionSnapshotDescriptor } from '@colearnia/contracts';

const id = (value: number) => String(value).padStart(24, '0');
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const identity = { requestId: uuid(2), snapshotId: uuid(3) };

function fixture() {
  const participants = new Map<string, PolicyParticipant>();
  for (const member of [1, 2]) {
    const access: PolicyParticipant['access'] = {
      workspaceId: id(90),
      channelId: id(91),
      channelType: 'LIVE',
      membershipId: id(member + 30),
      membershipIncarnation: 1,
      membershipRevision: 0,
      channelRevision: 0,
      canReadContent: true,
      canManageChannel: false,
    };
    participants.set(id(member), {
      participantId: id(member),
      displayName: `Member ${member}`,
      auth: {
        userId: id(member + 10),
        authSessionId: id(member + 20),
        expiresAt: '2026-11-08T11:00:00Z',
      },
      access,
      currentAccess: { ...access },
      callGeneration: 1,
      audienceEpoch: 0,
      connected: true,
      blocked: false,
      scope: { type: 'MAIN' },
    });
  }
  const groups = new Map<string, PolicyGroup>();
  const input: SessionPolicyInput = {
    request: {
      auth: participants.get(id(2))!.auth,
      sessionId: id(80),
      epoch: uuid(1),
      callGeneration: 1,
    },
    access: participants.get(id(2))!.currentAccess,
    nowMs: Date.parse('2026-11-08T10:00:00Z'),
    session: {
      sessionId: id(80),
      epoch: uuid(1),
      workspaceId: id(90),
      channelId: id(91),
      state: 'ACTIVE',
      phase: 'GUIDANCE',
      policyRevision: 0,
      hostParticipantId: id(1),
      helpingGroupId: null,
      round: null,
      participants,
      groups,
    },
  };
  function cursorFor(value = input): SessionProjectionCursor {
    const result = createSessionProjectionCursor(value);
    if (!result.ok) throw new Error('Expected initial cursor');
    return result.cursor;
  }
  return { input, participants, groups, cursorFor };
}

function assemble(
  parts: ReturnType<typeof sessionSnapshotPartSchema.parse>[],
  cursor: SessionProjectionCursor,
  snapshot: SessionSnapshotDescriptor,
) {
  const result = assembleSessionSnapshot(parts, {
    requestId: identity.requestId,
    cursor,
    snapshot,
  });
  if (!result.ok) throw new Error('Expected complete snapshot');
  return result.snapshot;
}

describe('recipient projection preparation', () => {
  it('captures a detached snapshot at the current sequence without consuming an event', () => {
    const f = fixture();
    const cursor = { ...f.cursorFor(), projectionSequence: 4 };
    const before = structuredClone(f.input.session);
    const result = prepareSessionSnapshot(f.input, cursor, identity);
    if (!result.ok) throw new Error('Expected snapshot');
    expect(result.nextCursor.projectionSequence).toBe(4);
    expect(sessionResyncAckSchema.parse(result.ack)).toEqual({
      requestId: identity.requestId,
      data: {
        status: 'completed',
        result: { snapshotId: identity.snapshotId, partCount: result.parts.length },
      },
    });
    expect(assemble(result.parts, cursor, result.ack.data.result).projectionSequence).toBe(4);
    expect(f.input.session).toEqual(before);
    f.participants.get(id(1))!.displayName = 'Changed later';
    const projection = assemble(result.parts, cursor, result.ack.data.result).projection;
    expect(projection.participants[0]!.displayName).toBe('Member 1');
    expect(JSON.stringify(projection)).not.toContain('authSessionId');
    expect(cursor.projectionSequence).toBe(4);
    Object.assign(result.nextCursor.scope, { type: 'GROUP', groupId: uuid(8) });
    expect(assemble(result.parts, cursor, result.ack.data.result).projection.viewer.scope).toEqual({
      type: 'MAIN',
    });
  });

  it('uses independent recipient sequences and allows global policy revision jumps', () => {
    const f = fixture();
    const cursor = f.cursorFor();
    const other = f.participants.get(id(1))!;
    const hostInput = {
      ...f.input,
      request: { ...f.input.request, auth: other.auth },
      access: other.access,
    };
    const hostCursor = f.cursorFor(hostInput);
    const first = prepareSessionProjectionEvent(f.input, cursor, 'session.changed');
    if (!first.ok) throw new Error('Expected first event');
    expect(sessionProjectionEventSchema.parse(first.event).projectionSequence).toBe(1);
    const second = prepareSessionProjectionEvent(
      { ...f.input, session: { ...f.input.session, policyRevision: 19 } },
      first.nextCursor,
      'host.changed',
    );
    expect(second.ok && second.event.projectionSequence).toBe(2);
    expect(second.ok && second.event.policyRevision).toBe(19);
    const host = prepareSessionProjectionEvent(hostInput, hostCursor, 'session.changed');
    expect(host.ok && host.event.projectionSequence).toBe(1);
    // Merely preparing or retrying an enqueue does not commit the caller's cursor.
    expect(cursor.projectionSequence).toBe(0);
    expect(prepareSessionProjectionEvent(f.input, cursor, 'session.changed')).toEqual(first);
  });

  it.each(['participantId', 'sessionId', 'epoch', 'callGeneration'] as const)(
    'rejects a cursor for another %s',
    (field) => {
      const f = fixture();
      const cursor = {
        ...f.cursorFor(),
        [field]: field === 'callGeneration' ? 2 : field === 'epoch' ? uuid(9) : id(99),
      };
      expect(prepareSessionSnapshot(f.input, cursor, identity)).toEqual({
        ok: false,
        errorCode: 'CONFLICT',
      });
    },
  );

  it('requires a new audience for scope changes and never resets sequence on A → MAIN → A', () => {
    const f = fixture();
    const member = f.participants.get(id(2))!;
    f.groups.set(uuid(5), {
      groupId: uuid(5),
      name: 'A',
      mode: 'DISCUSSION',
      state: 'OPEN',
      rosterParticipantIds: [id(2)],
    });
    let cursor = f.cursorFor();
    member.scope = { type: 'GROUP', groupId: uuid(5) };
    expect(prepareSessionSnapshot(f.input, cursor, identity)).toEqual({
      ok: false,
      errorCode: 'CONFLICT',
    });
    for (const [index, scope] of [
      member.scope,
      { type: 'MAIN' as const },
      member.scope,
    ].entries()) {
      member.scope = scope;
      member.audienceEpoch = index + 1;
      const event = prepareSessionProjectionEvent(f.input, cursor, 'participant.scopeChanged');
      if (!event.ok) throw new Error('Expected changed audience');
      cursor = event.nextCursor;
      expect(cursor.projectionSequence).toBe(index + 1);
      expect(cursor.audienceEpoch).toBe(index + 1);
    }
    expect(prepareSessionSnapshot(f.input, { ...cursor, audienceEpoch: 4 }, identity)).toEqual({
      ok: false,
      errorCode: 'CONFLICT',
    });
    expect(prepareSessionSnapshot(f.input, { ...cursor, policyRevision: 1 }, identity)).toEqual({
      ok: false,
      errorCode: 'CONFLICT',
    });
  });

  it.each(['blocked', 'expired', 'no-access', 'new-incarnation'])(
    'does not produce a snapshot or advance sequence when %s',
    (reason) => {
      const f = fixture();
      const cursor = f.cursorFor();
      const member = f.participants.get(id(2))!;
      if (reason === 'blocked') member.blocked = true;
      if (reason === 'expired') f.input.nowMs = Date.parse(member.auth.expiresAt);
      if (reason === 'no-access') member.currentAccess.canReadContent = false;
      if (reason === 'new-incarnation') member.currentAccess.membershipIncarnation++;
      expect(prepareSessionSnapshot(f.input, cursor, identity).ok).toBe(false);
      expect(prepareSessionProjectionEvent(f.input, cursor, 'session.changed').ok).toBe(false);
      expect(cursor.projectionSequence).toBe(0);
    },
  );

  it('splits Unicode and escaped JSON within the serialized envelope byte limits', () => {
    const f = fixture();
    // Metadata can grow independently of any product group-count limit.
    for (let index = 10; index < 75; index++) {
      f.groups.set(uuid(index), {
        groupId: uuid(index),
        name: `${index}: tiếng Việt 😀 "\\\n`.repeat(18),
        mode: 'DISCUSSION',
        state: 'OPEN',
        rosterParticipantIds: [],
      });
    }
    const cursor = f.cursorFor();
    const result = prepareSessionSnapshot(f.input, cursor, identity);
    if (!result.ok) throw new Error('Expected multipart snapshot');
    expect(result.parts.length).toBeGreaterThan(1);
    let total = 0;
    for (const [index, part] of result.parts.entries()) {
      expect(sessionSnapshotPartSchema.safeParse(part).success).toBe(true);
      expect(part.partIndex).toBe(index);
      expect(part.partCount).toBe(result.parts.length);
      expect(part.projectionSequence).toBe(0);
      expect(part.requestId).toBe(result.ack.requestId);
      expect(part.snapshotId).toBe(result.ack.data.result.snapshotId);
      expect(part.partCount).toBe(result.ack.data.result.partCount);
      const size = Buffer.byteLength(JSON.stringify(part), 'utf8');
      expect(size).toBeLessThanOrEqual(sessionControlBudget.maxSnapshotPartBytes);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(sessionControlBudget.maxSnapshotBytes);
    const snapshot = assemble(result.parts, cursor, result.ack.data.result);
    expect(snapshot.projection.groups).toHaveLength(65);
    expect(snapshot.projection.groups[0]!.name).toBe(f.groups.get(uuid(10))!.name);
    expect(prepareSessionProjectionEvent(f.input, cursor, 'group.changed')).toEqual({
      ok: false,
      errorCode: 'PAYLOAD_TOO_LARGE',
    });
    expect(cursor.projectionSequence).toBe(0);
  });

  it('rejects total byte and part-count overflow without returning partial data', () => {
    const f = fixture();
    const cursor = f.cursorFor();
    const group: PolicyGroup = {
      groupId: uuid(5),
      name: 'x'.repeat(1024 * 1024),
      mode: 'DISCUSSION',
      state: 'OPEN',
      rosterParticipantIds: [],
    };
    f.groups.set(group.groupId, group);
    expect(prepareSessionSnapshot(f.input, cursor, identity)).toEqual({
      ok: false,
      errorCode: 'PAYLOAD_TOO_LARGE',
    });
    // Escaped fragments exceed the part limit even when the original JSON is below 1 MiB.
    group.name = '"'.repeat(520_000);
    expect(prepareSessionSnapshot(f.input, cursor, identity)).toEqual({
      ok: false,
      errorCode: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('rejects invalid snapshot identity and sequence overflow', () => {
    const f = fixture();
    expect(
      prepareSessionSnapshot(f.input, f.cursorFor(), { ...identity, snapshotId: 'bad' }),
    ).toEqual({ ok: false, errorCode: 'VALIDATION_ERROR' });
    expect(
      prepareSessionProjectionEvent(
        f.input,
        { ...f.cursorFor(), projectionSequence: Number.MAX_SAFE_INTEGER },
        'session.changed',
      ),
    ).toEqual({ ok: false, errorCode: 'CONFLICT' });
  });
});
