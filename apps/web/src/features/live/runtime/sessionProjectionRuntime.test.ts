import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SessionProjection,
  SessionProjectionCursor,
  SessionProjectionEvent,
} from '@colearnia/contracts';
import { sessionControlBudget } from '@colearnia/contracts';
import { SessionProjectionRuntime } from './sessionProjectionRuntime';
import type { SessionResyncPort } from './sessionProjectionRuntime';

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const identity = {
  sessionId: '1'.repeat(24),
  epoch: uuid(1),
  participantId: '2'.repeat(24),
  callGeneration: 1,
};
const header = (sequence = 0, audience = 0, group?: number): SessionProjectionCursor => ({
  ...identity,
  projectionSequence: sequence,
  audienceEpoch: audience,
  policyRevision: sequence,
  scope: group ? { type: 'GROUP', groupId: uuid(group) } : { type: 'MAIN' },
});
function projection(cursor: SessionProjectionCursor): SessionProjection {
  return {
    sessionId: cursor.sessionId,
    epoch: cursor.epoch,
    policyRevision: cursor.policyRevision,
    phase: 'GUIDANCE',
    hostParticipantId: cursor.participantId,
    viewer: {
      participantId: cursor.participantId,
      callGeneration: cursor.callGeneration,
      audienceEpoch: cursor.audienceEpoch,
      role: 'HOST',
      scope: cursor.scope.type === 'MAIN' ? cursor.scope : { ...cursor.scope, mode: 'DISCUSSION' },
    },
    participants: [
      {
        participantId: cursor.participantId,
        role: 'HOST',
        displayName: `State ${cursor.projectionSequence}`,
      },
    ],
    groups: [],
    permissions: {
      publishMic: true,
      publishCamera: true,
      publishScreen: cursor.scope.type === 'MAIN',
      readBoard: true,
      drawBoard: true,
      freezeBoard: false,
    },
  };
}
function event(cursor: SessionProjectionCursor): SessionProjectionEvent {
  return { event: 'participant.scopeChanged', ...cursor, projection: projection(cursor) };
}
function setup() {
  const abort = new AbortController();
  const media = { updateContext: vi.fn(() => true) };
  const ended = vi.fn();
  const runtime = new SessionProjectionRuntime(identity, abort.signal, media, ended);
  const requests: {
    input: Parameters<SessionResyncPort>[0];
    receive: Parameters<SessionResyncPort>[1];
  }[] = [];
  runtime.bindResync((input, receive) => {
    requests.push({ input, receive });
  });
  function packets(cursor: SessionProjectionCursor, index = requests.length - 1, count = 1) {
    const request = requests[index]!;
    const json = JSON.stringify(projection(cursor));
    const split = Math.ceil(json.length / count);
    return {
      receive: request.receive,
      ack: {
        requestId: request.input.requestId,
        data: { status: 'completed', result: { snapshotId: uuid(20 + index), partCount: count } },
      },
      parts: Array.from({ length: count }, (_, partIndex) => ({
        event: 'session.snapshot',
        ...cursor,
        requestId: request.input.requestId,
        snapshotId: uuid(20 + index),
        partIndex,
        partCount: count,
        fragment: json.slice(partIndex * split, (partIndex + 1) * split),
      })),
    };
  }
  function apply(cursor: SessionProjectionCursor, index = requests.length - 1) {
    const p = packets(cursor, index);
    p.receive.acceptPart(p.parts[0]);
    p.receive.acceptAck(p.ack);
  }
  return { runtime, abort, media, ended, requests, packets, apply };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('SessionProjectionRuntime', () => {
  it('fences a newer audience even when its sequence/revision regress', () => {
    const s = setup();
    s.apply(header(5, 1, 10));
    const old = s.runtime.cache.capture()!;
    s.runtime.acceptEvent(event(header(4, 2)));
    expect(old.signal.aborted).toBe(true);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(500);
    s.apply(header(99, 1, 10));
    expect(s.runtime.getSnapshot().projection).toBeNull();
    s.apply(header(6, 2));
    expect(s.runtime.getSnapshot().cursor).toEqual(header(6, 2));
    s.abort.abort();
  });

  it('removes private data on policy changes within the same audience without resetting event sequence', () => {
    const s = setup();
    s.apply(header(1));
    const old = s.runtime.cache.capture()!;
    const cleanup = vi.fn();
    const survivingCleanup = vi.fn();
    s.runtime.cache.retain(old, () => {
      cleanup();
      throw new Error('Fixture cleanup failure');
    });
    s.runtime.cache.retain(old, survivingCleanup);
    s.runtime.acceptEvent(event(header(2)));
    expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(2);
    expect(old.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(survivingCleanup).toHaveBeenCalledOnce();
    s.abort.abort();
  });

  it('rejects oversized snapshot parts and conflicting same-sequence buffered events', () => {
    const s = setup();
    const p = s.packets(header(0));
    p.receive.acceptPart({
      ...p.parts[0],
      fragment: 'x'.repeat(sessionControlBudget.maxSnapshotPartBytes),
    });
    p.receive.acceptAck(p.ack);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(500);
    const a = event(header(1));
    s.runtime.acceptEvent(a);
    const conflict = structuredClone(a);
    conflict.projection.participants[0]!.displayName = 'Conflicting packet';
    s.runtime.acceptEvent(conflict);
    s.apply(header(1));
    expect(s.runtime.getSnapshot().projection).toBeNull();
    s.abort.abort();
  });

  it('assembles reversed parts before ACK and publishes only once after descriptor validation', () => {
    const s = setup();
    expect(s.runtime.cache.isCurrent(s.runtime.cache.capture())).toBe(false);
    const publish = vi.fn();
    s.runtime.subscribe(publish);
    const p = s.packets(header(4), 0, 3);
    for (const part of [...p.parts].reverse()) p.receive.acceptPart(part);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    p.receive.acceptAck(p.ack);
    expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(4);
    expect(s.media.updateContext).toHaveBeenLastCalledWith(header(4));
    expect(publish).toHaveBeenCalledTimes(1);
    s.abort.abort();
  });

  it('fences A → MAIN → B immediately and ignores late A snapshots/events/images and older resync ACKs', () => {
    const s = setup();
    s.apply(header(1, 1, 10));
    const a = s.runtime.cache.capture()!;
    const revokeA = vi.fn();
    s.runtime.cache.write(a, 'chat', 'private A');
    s.runtime.cache.retain(a, revokeA);
    s.runtime.acceptEvent(event(header(2, 2)));
    expect(a.signal.aborted).toBe(true);
    expect(revokeA).toHaveBeenCalledOnce();
    expect(s.runtime.getSnapshot().projection).toBeNull();
    const main = s.packets(header(2, 2));
    s.runtime.acceptEvent(event(header(3, 3, 11)));
    s.apply(header(3, 3, 11));
    const b = s.runtime.cache.capture()!;
    s.runtime.cache.write(b, 'chat', 'private B');
    main.receive.acceptAck(main.ack);
    main.receive.acceptPart(main.parts[0]);
    s.apply(header(1, 1, 10), 0);
    s.runtime.acceptEvent(event(header(50, 1, 10)));
    const lateImage = vi.fn();
    expect(s.runtime.cache.retain(a, lateImage)).toBe(false);
    expect(lateImage).toHaveBeenCalledOnce();
    expect(s.runtime.cache.write(a, 'chat', 'late A')).toBe(false);
    expect(s.runtime.cache.read(a, 'chat')).toBeUndefined();
    expect(s.runtime.cache.read(b, 'chat')).toBe('private B');
    expect(s.runtime.getSnapshot().cursor).toEqual(header(3, 3, 11));
    s.abort.abort();
  });

  it('observes a newer audience from an incomplete part before ACK; returning to A gets a fresh cache', () => {
    const s = setup();
    s.apply(header(1, 1, 10));
    const oldA = s.runtime.cache.capture()!;
    s.runtime.resync();
    const p = s.packets(header(2, 2), 1, 2);
    p.receive.acceptPart(p.parts[0]);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    expect(s.media.updateContext).toHaveBeenLastCalledWith(null);
    s.runtime.acceptEvent(event(header(99, 1, 10)));
    p.receive.acceptAck(p.ack);
    p.receive.acceptPart(p.parts[1]);
    s.runtime.acceptEvent(event(header(3, 3, 10)));
    s.apply(header(3, 3, 10));
    expect(s.runtime.cache.capture()?.key).not.toEqual(oldA.key);
    expect(s.runtime.cache.write(oldA, 'frame', 'stale')).toBe(false);
    s.abort.abort();
  });

  it('replays contiguous buffered events atomically and drops events covered by snapshot watermark', () => {
    const s = setup();
    s.runtime.acceptEvent(event(header(7)));
    s.runtime.acceptEvent(event(header(6)));
    s.runtime.acceptEvent(event(header(5)));
    s.apply(header(5));
    expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(7);
    expect(s.runtime.getSnapshot().projection?.participants[0]?.displayName).toBe('State 7');
    s.runtime.acceptEvent(event(header(6)));
    expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(7);
    s.abort.abort();
  });

  it('does not let a gap or a retry forget an observed newer sequence', () => {
    const s = setup();
    s.apply(header(1));
    s.runtime.acceptEvent(event(header(3)));
    s.apply(header(1));
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(500);
    s.apply(header(2));
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(1000);
    s.apply(header(3));
    expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(3);
    s.abort.abort();
  });

  it.each(['event', 'snapshot'])(
    'rejects a %s missing sequence and retains no partial state',
    (kind) => {
      const s = setup();
      const malformed: Record<string, unknown> =
        kind === 'event' ? { ...event(header(1)) } : { ...s.packets(header(1)).parts[0] };
      delete malformed.projectionSequence;
      if (kind === 'event') s.runtime.acceptEvent(malformed);
      else s.requests[0]!.receive.acceptPart(malformed);
      s.apply(header(0), 0);
      expect(s.runtime.getSnapshot().projection).toBeNull();
      vi.advanceTimersByTime(500);
      expect(s.requests).toHaveLength(2);
      s.abort.abort();
    },
  );

  it.each(['count', 'bytes'])(
    'drops a buffer overflowing its %s cap, and old callbacks cannot commit',
    (limit) => {
      const s = setup();
      for (let i = 1; i <= 65; i++) {
        const packet = event(header(i));
        if (limit === 'bytes') packet.projection.participants[0]!.displayName = 'x'.repeat(10_000);
        s.runtime.acceptEvent(packet);
      }
      s.apply(header(0), 0);
      expect(s.runtime.getSnapshot().projection).toBeNull();
      vi.advanceTimersByTime(500);
      expect(s.requests).toHaveLength(2);
      s.apply(header(65));
      expect(s.runtime.getSnapshot().cursor?.projectionSequence).toBe(65);
      s.abort.abort();
    },
  );

  it('keeps the original 5s assembly deadline across parts and ACK, then stops after three retries', () => {
    const s = setup();
    const p = s.packets(header(0), 0, 2);
    p.receive.acceptPart(p.parts[0]);
    vi.advanceTimersByTime(4900);
    p.receive.acceptAck(p.ack);
    vi.advanceTimersByTime(100);
    p.receive.acceptPart(p.parts[1]);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(500 + 5000 + 1000 + 5000 + 2000 + 5000);
    expect(s.requests).toHaveLength(4);
    expect(s.runtime.getSnapshot().status).toBe('error');
    vi.advanceTimersByTime(60_000);
    expect(s.requests).toHaveLength(4);
    s.runtime.resync();
    expect(s.requests).toHaveLength(5);
    s.abort.abort();
  });

  it('rejects conflicting duplicate parts and mismatched ACK descriptors', () => {
    const s = setup();
    const p = s.packets(header(0), 0, 2);
    p.receive.acceptPart(p.parts[0]);
    p.receive.acceptPart({ ...p.parts[0], fragment: 'different' });
    p.receive.acceptAck(p.ack);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    vi.advanceTimersByTime(500);
    const next = s.packets(header(0));
    next.receive.acceptPart(next.parts[0]);
    next.receive.acceptAck({
      ...next.ack,
      data: { status: 'completed', result: { snapshotId: uuid(99), partCount: 1 } },
    });
    expect(s.runtime.getSnapshot().projection).toBeNull();
    s.abort.abort();
  });

  it('ignores foreign ownership and old ended notices; terminal notice crosses a gap and clears timers/cache', () => {
    const s = setup();
    s.apply(header(1));
    const lease = s.runtime.cache.capture()!;
    const notice = { event: 'session.ended', ...header(4, 3, 11) };
    s.runtime.acceptEnded({ ...notice, callGeneration: 2 });
    s.runtime.acceptEvent({ ...event(header(5)), epoch: uuid(99) });
    s.runtime.acceptEnded({ ...notice, projectionSequence: 1 });
    expect(s.runtime.getSnapshot().status).toBe('ready');
    s.runtime.acceptEnded(notice);
    expect(s.runtime.getSnapshot().status).toBe('closed');
    expect(lease.signal.aborted).toBe(true);
    expect(s.ended).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    s.abort.abort();
  });

  it.each(['SESSION_ENDED', 'AUTH_REQUIRED', 'FORBIDDEN'])(
    'ends pending resync on %s without retry',
    (code) => {
      const s = setup();
      s.requests[0]!.receive.acceptAck({
        requestId: s.requests[0]!.input.requestId,
        error: { code, message: 'Denied' },
      });
      expect(s.runtime.getSnapshot().status).toBe('closed');
      expect(s.ended).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      s.abort.abort();
    },
  );

  it('cancels pending loads and revokes late image handles after abort', async () => {
    const s = setup();
    s.apply(header(0));
    const lease = s.runtime.cache.capture()!;
    let resolve!: (value: string) => void;
    let loadSignal!: AbortSignal;
    const pending = s.runtime.cache.load(lease, 'frame', (signal) => {
      loadSignal = signal;
      return new Promise<string>((done) => {
        resolve = done;
      });
    });
    s.abort.abort();
    expect(loadSignal.aborted).toBe(true);
    resolve('late frame');
    expect(await pending).toBeUndefined();
    expect(s.runtime.cache.read(lease, 'frame')).toBeUndefined();
    expect(s.runtime.getSnapshot().status).toBe('closed');
  });

  it('rejects oversized control packets before parsing or buffering', () => {
    const s = setup();
    const packet = event(header(1));
    packet.projection.participants[0]!.displayName = 'x'.repeat(
      sessionControlBudget.maxControlBytes,
    );
    s.runtime.acceptEvent(packet);
    s.apply(header(0), 0);
    expect(s.runtime.getSnapshot().projection).toBeNull();
    s.abort.abort();
  });
});
