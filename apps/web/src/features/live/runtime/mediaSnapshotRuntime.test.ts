import { describe, expect, it, vi } from 'vitest';
import { sessionControlBudget } from '@colearnia/contracts';
import type { MediaSourcesSnapshot, SessionProjectionCursor } from '@colearnia/contracts';
import { CallControllerOwner } from './callController';
import { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import type { ConsumerBinding } from './mediaSnapshot';

const uuid = (suffix: number) => `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const context = {
  sessionId: '1'.repeat(24),
  epoch: uuid(1),
  participantId: '2'.repeat(24),
  callGeneration: 2,
  audienceEpoch: 4,
  policyRevision: 9,
  projectionSequence: 12,
  scope: { type: 'MAIN' },
} satisfies SessionProjectionCursor;
const requestId = uuid(2);
const descriptor = {
  mediaStreamId: uuid(3),
  snapshotId: uuid(4),
  mediaSequence: 12,
  audienceEpoch: context.audienceEpoch,
  policyRevision: context.policyRevision,
  partCount: 1,
};
const mic = {
  sourceId: 'mic',
  producerId: 'producer',
  sourceGeneration: 1,
  sourceRevision: 2,
  sourceKind: 'MIC',
  kind: 'audio',
  scope: { type: 'MAIN' },
  ownerParticipantId: '3'.repeat(24),
  publicationState: 'PUBLISHING',
} as const;
const binding = {
  sourceId: mic.sourceId,
  producerId: mic.producerId,
  sourceGeneration: mic.sourceGeneration,
  sourceRevision: mic.sourceRevision,
  consumerId: 'consumer',
  ready: true,
  paused: false,
} satisfies ConsumerBinding;
const empty = { sources: [], ownTransports: [], ownProducers: [], ownConsumers: [] };

function part(
  payload: MediaSourcesSnapshot['payload'] = empty,
  options: Partial<MediaSourcesSnapshot> = {},
): MediaSourcesSnapshot {
  return {
    requestId,
    sessionId: context.sessionId,
    epoch: context.epoch,
    callGeneration: context.callGeneration,
    ...descriptor,
    partIndex: 0,
    payload,
    ...options,
  };
}

function ack(options: Partial<typeof descriptor> = {}, id = requestId) {
  return { requestId: id, data: { status: 'completed', result: { ...descriptor, ...options } } };
}

function setup() {
  const runtime = new MediaSnapshotRuntime(context, new AbortController().signal);
  expect(runtime.updateContext(context)).toBe(true);
  return runtime;
}

async function apply(
  runtime: MediaSnapshotRuntime,
  payload: MediaSourcesSnapshot['payload'],
  options: Partial<typeof descriptor> = {},
) {
  const request = runtime.begin(requestId)!;
  request.acceptAck(ack(options));
  request.acceptPart(part(payload, options));
  const result = await request.result;
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('Missing snapshot');
  return result.snapshot;
}

describe('SCRUM-67 media snapshot runtime', () => {
  it('accepts a late Consumer after equivalent replay and rejects completion for an old revision', async () => {
    const runtime = setup();
    const payload = { ...empty, sources: [mic] };
    const original = await apply(runtime, payload);
    await apply(runtime, payload, { snapshotId: uuid(20) });
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(original, binding, handle)).toBe(true);
    expect(runtime.attachConsumer(original, binding, handle)).toBe(true);
    expect(handle.attach).toHaveBeenCalledOnce();
    await apply(
      runtime,
      {
        ...payload,
        sources: [{ ...mic, sourceRevision: 3 }],
        ownConsumers: [{ ...binding, sourceRevision: 3 }],
      },
      { mediaSequence: 13 },
    );
    const stale = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(original, binding, stale)).toBe(false);
    expect(stale.attach).not.toHaveBeenCalled();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(handle.close).not.toHaveBeenCalled();
  });

  it('retains matching own native handles and cancels an obsolete replacement without resuming media', async () => {
    const runtime = setup();
    const own = {
      source: { ...mic, ownerParticipantId: context.participantId, publicationState: 'SWITCHING' },
      replacement: {
        replacementId: uuid(21),
        sourceRevision: 2,
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      },
    } as const;
    const transport = {
      transportId: 'send',
      direction: 'SEND',
      iceGeneration: 4,
      restartPending: true,
    } as const;
    const payload = { ...empty, ownProducers: [own], ownTransports: [transport] };
    const initial = await apply(runtime, payload);
    const producerHandle = { close: vi.fn(), resume: vi.fn() };
    const transportHandle = { close: vi.fn(), restartIce: vi.fn() };
    const cancel = vi.fn();
    expect(runtime.trackOwnProducer(initial, own.source, producerHandle)).toBe(true);
    expect(runtime.trackOwnTransport(initial, transport, transportHandle)).toBe(true);
    expect(
      runtime.trackReplacement(initial, own.source.producerId, own.replacement, cancel),
    ).toBeTypeOf('function');
    await apply(runtime, payload, { snapshotId: uuid(22) });
    expect(cancel).not.toHaveBeenCalled();
    expect(producerHandle.close).not.toHaveBeenCalled();
    expect(transportHandle.close).not.toHaveBeenCalled();

    await apply(
      runtime,
      {
        ...payload,
        ownProducers: [
          {
            source: { ...own.source, sourceRevision: 3, publicationState: 'PAUSED' },
            replacement: null,
          },
        ],
        ownTransports: [{ ...transport, iceGeneration: 5, restartPending: false }],
      },
      { mediaSequence: 13 },
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(producerHandle.close).not.toHaveBeenCalled();
    expect(transportHandle.close).not.toHaveBeenCalled();
    expect(producerHandle.resume).not.toHaveBeenCalled();
    expect(transportHandle.restartIce).not.toHaveBeenCalled();

    await apply(runtime, empty, { mediaSequence: 14 });
    await apply(runtime, empty, { mediaSequence: 15 });
    expect(producerHandle.close).toHaveBeenCalledOnce();
    expect(transportHandle.close).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    const staleProducer = { close: vi.fn() };
    expect(runtime.trackOwnProducer(initial, own.source, staleProducer)).toBe(false);
    expect(staleProducer.close).toHaveBeenCalledOnce();
  });

  it('expires a pending replacement and closes own resources on call end', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const runtime = new MediaSnapshotRuntime(context, controller.signal);
      runtime.updateContext(context);
      const own = {
        source: {
          ...mic,
          ownerParticipantId: context.participantId,
          publicationState: 'SWITCHING',
        },
        replacement: {
          replacementId: uuid(23),
          sourceRevision: 2,
          expiresAt: new Date(Date.now() + 50).toISOString(),
        },
      } as const;
      const transport = {
        transportId: 'send',
        direction: 'SEND',
        iceGeneration: 0,
        restartPending: false,
      } as const;
      const snapshot = await apply(runtime, {
        ...empty,
        ownProducers: [own],
        ownTransports: [transport],
      });
      const producerHandle = { close: vi.fn() };
      const transportHandle = { close: vi.fn() };
      const cancel = vi.fn();
      runtime.trackOwnProducer(snapshot, own.source, producerHandle);
      runtime.trackOwnTransport(snapshot, transport, transportHandle);
      runtime.trackReplacement(snapshot, own.source.producerId, own.replacement, cancel);
      await vi.advanceTimersByTimeAsync(50);
      expect(cancel).toHaveBeenCalledOnce();
      expect(producerHandle.close).not.toHaveBeenCalled();
      controller.abort();
      expect(producerHandle.close).toHaveBeenCalledOnce();
      expect(transportHandle.close).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for all parts and the ack, retaining own PAUSED and SWITCHING with no visible sources', async () => {
    const runtime = setup();
    const request = runtime.begin(requestId)!;
    const ownMic = {
      source: { ...mic, ownerParticipantId: context.participantId, publicationState: 'PAUSED' },
      replacement: null,
    } as const;
    const ownCamera = {
      source: {
        ...ownMic.source,
        sourceId: 'camera',
        producerId: 'camera-producer',
        sourceKind: 'CAMERA',
        kind: 'video',
        publicationState: 'SWITCHING',
      },
      replacement: { replacementId: uuid(5), sourceRevision: 2, expiresAt: '2026-11-09T10:00:05Z' },
    } as const;
    const transport = {
      transportId: 'send',
      direction: 'SEND',
      iceGeneration: 4,
      restartPending: true,
    } as const;
    const second = part({ ...empty, ownProducers: [ownCamera] }, { partCount: 2, partIndex: 1 });
    request.acceptPart(second);
    request.acceptPart(second);
    request.acceptPart(
      part({ ...empty, ownProducers: [ownMic], ownTransports: [transport] }, { partCount: 2 }),
    );
    expect(runtime.getSnapshot()).toBeUndefined();
    request.acceptAck(ack({ partCount: 2 }));
    await expect(request.result).resolves.toMatchObject({
      status: 'applied',
      snapshot: {
        payload: { ...empty, ownProducers: [ownMic, ownCamera], ownTransports: [transport] },
      },
    });
  });

  it('keeps a single audio attachment across identical and newer snapshots, then closes the old binding', async () => {
    const runtime = setup();
    const payload = { ...empty, sources: [mic], ownConsumers: [binding] };
    const first = await apply(runtime, payload);
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(first, binding, handle)).toBe(true);
    const replay = await apply(runtime, payload, { snapshotId: uuid(6) });
    expect(runtime.attachConsumer(replay, binding, handle)).toBe(true);
    const duplicate = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(replay, binding, duplicate)).toBe(false);
    expect(duplicate.attach).not.toHaveBeenCalled();
    expect(duplicate.close).toHaveBeenCalledOnce();
    const revised = { ...binding, sourceRevision: 3 };
    await apply(
      runtime,
      {
        ...payload,
        sources: [{ ...mic, sourceRevision: 3 }],
        ownConsumers: [revised],
      },
      { mediaSequence: 13 },
    );
    expect(handle.attach).toHaveBeenCalledOnce();
    expect(handle.close).not.toHaveBeenCalled();
    await apply(runtime, empty, { mediaSequence: 14 });
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it('rejects conflicting parts, IDs and stale Consumer revisions without publishing partial state', async () => {
    const runtime = setup();
    const previous = await apply(runtime, empty);
    const conflicting = runtime.begin(requestId)!;
    conflicting.acceptPart(part(empty, { partCount: 2 }));
    conflicting.acceptPart(part({ ...empty, sources: [mic] }, { partCount: 2 }));
    await expect(conflicting.result).resolves.toEqual({ status: 'invalid' });
    const duplicate = runtime.begin(requestId)!;
    duplicate.acceptAck(ack({ partCount: 2 }));
    duplicate.acceptPart(part({ ...empty, sources: [mic] }, { partCount: 2, partIndex: 1 }));
    duplicate.acceptPart(part({ ...empty, sources: [mic] }, { partCount: 2 }));
    await expect(duplicate.result).resolves.toEqual({ status: 'invalid' });
    const stale = runtime.begin(requestId)!;
    stale.acceptAck(ack());
    stale.acceptPart(
      part({ ...empty, sources: [mic], ownConsumers: [{ ...binding, sourceRevision: 1 }] }),
    );
    await expect(stale.result).resolves.toEqual({ status: 'invalid' });
    expect(runtime.getSnapshot()).toBe(previous);
  });

  it('rejects a mixed descriptor, an oversized part and a regressing watermark', async () => {
    const runtime = setup();
    const previous = await apply(runtime, empty);
    const mixed = runtime.begin(requestId)!;
    mixed.acceptPart(part());
    mixed.acceptAck(ack({ snapshotId: uuid(8) }));
    await expect(mixed.result).resolves.toEqual({ status: 'invalid' });
    const large = runtime.begin(requestId)!;
    large.acceptPart(
      part({
        ...empty,
        sources: Array.from({ length: 100 }, (_, index) => ({
          ...mic,
          sourceId: `nguồn-${index}`,
        })),
      }),
    );
    await expect(large.result).resolves.toEqual({ status: 'invalid' });
    const stale = runtime.begin(requestId)!;
    stale.acceptAck(ack({ mediaSequence: 11 }));
    await expect(stale.result).resolves.toEqual({ status: 'invalid' });
    expect(runtime.getSnapshot()).toBe(previous);
  });

  it('uses one deadline and ignores late packets from a superseded request', async () => {
    vi.useFakeTimers();
    try {
      const runtime = setup();
      const old = runtime.begin(requestId)!;
      const current = runtime.begin(uuid(9))!;
      old.acceptAck(ack());
      old.acceptPart(part());
      await expect(old.result).resolves.toEqual({ status: 'cancelled' });
      await vi.advanceTimersByTimeAsync(sessionControlBudget.snapshotTimeoutMs - 1);
      current.acceptAck(ack({ partCount: 2 }, uuid(9)));
      current.acceptPart(part(empty, { requestId: uuid(9), partCount: 2 }));
      await vi.advanceTimersByTimeAsync(1);
      current.acceptPart(part(empty, { requestId: uuid(9), partCount: 2, partIndex: 1 }));
      await expect(current.result).resolves.toEqual({ status: 'timeout' });
      expect(runtime.getSnapshot()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a previously valid snapshot and audio binding when the server revokes access', async () => {
    const runtime = setup();
    const snapshot = await apply(runtime, { ...empty, sources: [mic], ownConsumers: [binding] });
    const handle = { attach: vi.fn(), close: vi.fn() };
    runtime.attachConsumer(snapshot, binding, handle);
    const request = runtime.begin(requestId)!;
    request.acceptAck({ requestId, error: { code: 'FORBIDDEN', message: 'Access revoked' } });
    await expect(request.result).resolves.toEqual({ status: 'denied', code: 'FORBIDDEN' });
    expect(handle.close).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toBeUndefined();
    expect(runtime.updateContext(context)).toBe(false);
  });

  it('clears attachments on audience change and rejects stale callbacks across scope and call end', async () => {
    const owner = new CallControllerOwner();
    let runtime!: MediaSnapshotRuntime;
    await owner.acquire(context, (_identity, _signal, mediaSnapshots) => {
      runtime = mediaSnapshots;
      return () => {};
    });
    runtime.updateContext(context);
    const first = await apply(runtime, { ...empty, sources: [mic], ownConsumers: [binding] });
    const handle = { attach: vi.fn(), close: vi.fn() };
    runtime.attachConsumer(first, binding, handle);
    const old = runtime.begin(requestId)!;
    const next = {
      ...context,
      audienceEpoch: 5,
      policyRevision: 10,
      projectionSequence: 13,
      scope: { type: 'GROUP', groupId: uuid(10) },
    } satisfies SessionProjectionCursor;
    runtime.updateContext(next);
    expect(handle.close).toHaveBeenCalledOnce();
    await expect(old.result).resolves.toEqual({ status: 'cancelled' });
    expect(runtime.updateContext(context)).toBe(false);
    // A DISCUSSION can receive a MAIN source that M4 still allows.
    const current = await apply(
      runtime,
      { ...empty, sources: [mic], ownConsumers: [binding] },
      {
        audienceEpoch: next.audienceEpoch,
        policyRevision: next.policyRevision,
        mediaStreamId: uuid(11),
        mediaSequence: 0,
      },
    );
    const late = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(first, binding, late)).toBe(false);
    expect(late.close).toHaveBeenCalledOnce();
    const currentHandle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(current, binding, currentHandle)).toBe(true);
    const pending = runtime.begin(requestId)!;
    owner.end(context);
    await expect(pending.result).resolves.toEqual({ status: 'cancelled' });
    expect(currentHandle.close).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toBeUndefined();
    expect(runtime.begin(requestId)).toBeUndefined();
  });
});
