import { describe, expect, it, vi } from 'vitest';
import { sessionControlBudget } from '@colearnia/contracts';
import type { MediaSourcesSnapshot, SessionProjectionCursor } from '@colearnia/contracts';
import { CallControllerOwner } from './callController';
import { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import { bindMediaSourceSocket } from './mediaSourceSocket';
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

describe('SCRUM-68 media delta and resync', () => {
  function delta(sequence: number, revision = 3) {
    return {
      sessionId: context.sessionId,
      epoch: context.epoch,
      callGeneration: context.callGeneration,
      mediaStreamId: descriptor.mediaStreamId,
      audienceEpoch: context.audienceEpoch,
      mediaSequence: sequence,
      policyRevision: context.policyRevision + 5,
      payload: { source: { ...mic, sourceRevision: revision } },
    };
  }

  it.each(['media.source.changed', 'media.producer.stateChanged'] as const)(
    'resyncs %s when an own SWITCHING delta arrives before the matching prepare ACK',
    async (event) => {
      const runtime = setup();
      const source = { ...mic, ownerParticipantId: context.participantId };
      const oldReplacement = {
        replacementId: uuid(81),
        sourceRevision: source.sourceRevision,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const initialPayload = {
        ...empty,
        ownProducers: [
          {
            source: { ...source, publicationState: 'SWITCHING' as const },
            replacement: oldReplacement,
          },
        ],
      };
      type Port = Parameters<MediaSnapshotRuntime['bindResync']>[0];
      const send = vi.fn<Port>();
      const disconnect = runtime.bindResync(send);
      try {
        await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
        const [firstInput, first] = send.mock.calls[0]!;
        first.acceptAck(ack({}, firstInput.requestId));
        first.acceptPart(part(initialPayload, { requestId: firstInput.requestId }));
        const before = runtime.getSnapshot()!;
        expect(before.mediaSequence).toBe(12);
        const handle = { close: vi.fn() };
        expect(
          runtime.trackOwnProducer(before, initialPayload.ownProducers[0]!.source, handle),
        ).toBe(true);

        const switching = { ...source, sourceRevision: 3, publicationState: 'SWITCHING' } as const;
        const payload =
          event === 'media.source.changed'
            ? { source: switching }
            : {
                sourceId: switching.sourceId,
                sourceGeneration: switching.sourceGeneration,
                sourceRevision: switching.sourceRevision,
                producerId: switching.producerId,
                state: 'SWITCHING',
              };
        runtime.acceptEvent(event, { ...delta(13), payload });
        expect(runtime.getSnapshot()).toBe(before);
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        const [input, response] = send.mock.calls[1]!;
        expect(input.payload.lastMediaSequence).toBe(12);
        const replacement = { ...oldReplacement, replacementId: uuid(82), sourceRevision: 3 };
        const snapshot = { snapshotId: uuid(83), mediaSequence: 13 };
        response.acceptAck(ack(snapshot, input.requestId));
        response.acceptPart(
          part(
            { ...empty, ownProducers: [{ source: switching, replacement }] },
            { ...snapshot, requestId: input.requestId },
          ),
        );
        const cancel = vi.fn();
        const finish = runtime.trackReplacement(before, switching.producerId, replacement, cancel);
        expect(finish).toBeTypeOf('function');
        runtime.acceptEvent(event, { ...delta(14), payload });
        expect(runtime.getSnapshot()).toMatchObject({
          mediaSequence: 14,
          payload: { ownProducers: [{ source: switching, replacement }] },
        });
        expect(cancel).not.toHaveBeenCalled();
        expect(handle.close).not.toHaveBeenCalled();
        finish?.();
      } finally {
        disconnect();
      }
    },
  );

  it('drops duplicates and replays contiguous buffered deltas after the watermark', async () => {
    const runtime = setup();
    const request = runtime.begin(requestId)!;
    runtime.acceptEvent('media.source.changed', delta(14, 4));
    runtime.acceptEvent('media.source.changed', delta(12, 1));
    runtime.acceptEvent('media.source.changed', delta(13, 3));
    runtime.acceptEvent('media.source.changed', delta(13, 3));
    request.acceptPart(part({ ...empty, sources: [mic] }));
    request.acceptAck(ack());
    await expect(request.result).resolves.toMatchObject({
      status: 'applied',
      snapshot: { mediaSequence: 14, payload: { sources: [{ sourceRevision: 4 }] } },
    });
    runtime.acceptEvent('media.source.changed', delta(14, 4));
    expect(runtime.getSnapshot()?.mediaSequence).toBe(14);
  });

  it('requests one full resync for gaps and refuses conflicting replay', async () => {
    const runtime = setup();
    await apply(runtime, { ...empty, sources: [mic] });
    type Port = Parameters<MediaSnapshotRuntime['bindResync']>[0];
    const send = vi.fn<Port>();
    const disconnect = runtime.bindResync(send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const [input, receive] = send.mock.calls[0]!;
    receive.acceptAck(ack({}, input.requestId));
    receive.acceptPart(part({ ...empty, sources: [mic] }, { requestId: input.requestId }));
    await Promise.resolve();
    runtime.acceptEvent('media.source.changed', delta(13));
    runtime.acceptEvent('media.source.changed', delta(13, 4));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]![0].payload.lastMediaSequence).toBe(13);
    runtime.acceptEvent('media.source.changed', delta(15, 5));
    const [retry, response] = send.mock.calls[1]!;
    response.acceptPart(
      part({ ...empty, sources: [mic] }, { requestId: retry.requestId, mediaSequence: 13 }),
    );
    response.acceptAck(ack({ mediaSequence: 13 }, retry.requestId));
    expect(runtime.getSnapshot()?.mediaSequence).toBe(13);
    disconnect();
  });

  it('bounds buffered events and aborts the snapshot on overflow', async () => {
    const runtime = setup();
    const request = runtime.begin(requestId)!;
    for (let seq = 1; seq <= sessionControlBudget.maxBufferedEvents + 1; seq++) {
      runtime.acceptEvent('media.source.changed', delta(seq));
    }
    await expect(request.result).resolves.toEqual({ status: 'cancelled' });
    request.acceptAck(ack());
    request.acceptPart(part());
    expect(runtime.getSnapshot()).toBeUndefined();
  });

  it('discards old audience data and closes local consumers immediately on audience change', async () => {
    const runtime = setup();
    const initial = await apply(runtime, { ...empty, sources: [mic], ownConsumers: [binding] });
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(initial, binding, handle)).toBe(true);
    const pending = runtime.begin(uuid(31))!;
    runtime.acceptEvent('media.source.changed', delta(13));
    runtime.updateContext({
      ...context,
      audienceEpoch: 5,
      policyRevision: 10,
      projectionSequence: 13,
    });
    await expect(pending.result).resolves.toEqual({ status: 'cancelled' });
    expect(handle.close).toHaveBeenCalledOnce();
    const next = runtime.begin(uuid(32))!;
    runtime.acceptEvent('media.source.changed', delta(13));
    const fresh = {
      audienceEpoch: 5,
      policyRevision: 10,
      mediaStreamId: uuid(33),
      mediaSequence: 0,
    };
    next.acceptAck(ack(fresh, next.input.requestId));
    next.acceptPart(part(empty, { ...fresh, requestId: next.input.requestId }));
    await expect(next.result).resolves.toMatchObject({
      status: 'applied',
      snapshot: { payload: empty },
    });
  });

  it('closes only the matching consumer and never resurrects a source from an ended generation', async () => {
    const runtime = setup();
    const initial = await apply(runtime, { ...empty, sources: [mic], ownConsumers: [binding] });
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(initial, binding, handle)).toBe(true);
    runtime.acceptEvent('media.consumer.closed', {
      ...delta(13),
      payload: {
        consumerId: 'older-consumer',
        sourceId: mic.sourceId,
        sourceGeneration: 1,
        reason: 'USER_STOP',
      },
    });
    expect(handle.close).not.toHaveBeenCalled();
    runtime.acceptEvent('media.source.ended', {
      ...delta(14),
      payload: {
        sourceId: mic.sourceId,
        sourceGeneration: 1,
        sourceRevision: 3,
        reason: 'SOURCE_ENDED',
      },
    });
    runtime.acceptEvent('media.source.changed', delta(15));
    expect(handle.close).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()?.payload.sources).toEqual([]);
    expect(runtime.getSnapshot()?.mediaSequence).toBe(15);
  });

  it('closes the current receive transport and its local consumer without removing the source', async () => {
    const runtime = setup();
    const transport = {
      transportId: 'recv',
      direction: 'RECV',
      iceGeneration: 0,
      restartPending: false,
    } as const;
    const initial = await apply(runtime, {
      ...empty,
      sources: [mic],
      ownTransports: [transport],
      ownConsumers: [binding],
    });
    const consumer = { attach: vi.fn(), close: vi.fn() };
    const handle = { close: vi.fn() };
    expect(runtime.attachConsumer(initial, binding, consumer)).toBe(true);
    expect(runtime.trackOwnTransport(initial, transport, handle)).toBe(true);
    runtime.acceptEvent('media.transport.closed', {
      ...delta(13),
      payload: { transportId: 'recv', reason: 'TRANSPORT_FAILED' },
    });
    expect(consumer.close).toHaveBeenCalledOnce();
    expect(handle.close).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()?.payload).toEqual({ ...empty, sources: [mic] });
  });

  it.each([false, true])(
    'resyncs a Transport close after snapshot and fences the Consumer, already attached=%s',
    async (attached) => {
      const runtime = setup();
      const payload = { ...empty, sources: [mic] };
      const initial = await apply(runtime, payload);
      const local = { attach: vi.fn(), close: vi.fn() };
      if (attached) expect(runtime.attachConsumer(initial, binding, local)).toBe(true);

      runtime.acceptEvent('media.transport.closed', {
        ...delta(13),
        payload: { transportId: 'recv-created-after-snapshot', reason: 'TRANSPORT_FAILED' },
      });
      expect(runtime.getSnapshot()).toBe(initial);
      if (!attached) expect(runtime.attachConsumer(initial, binding, local)).toBe(false);

      const stale = runtime.begin(requestId)!;
      stale.acceptAck(ack());
      stale.acceptPart(part(payload));
      await expect(stale.result).resolves.toEqual({ status: 'invalid' });

      await apply(runtime, payload, { snapshotId: uuid(84), mediaSequence: 13 });
      const late = { attach: vi.fn(), close: vi.fn() };
      expect(runtime.attachConsumer(initial, binding, late)).toBe(false);
      expect(late.attach).not.toHaveBeenCalled();
      expect(late.close).toHaveBeenCalledOnce();
      expect(local.close).toHaveBeenCalledOnce();
    },
  );

  it('preserves the new receive transport and its Consumer when resync confirms them', async () => {
    const runtime = setup();
    const transport = {
      transportId: 'new-recv',
      direction: 'RECV',
      iceGeneration: 0,
      restartPending: false,
    } as const;
    const payload = {
      ...empty,
      sources: [mic],
      ownTransports: [transport],
      ownConsumers: [binding],
    };
    const initial = await apply(runtime, payload);
    const consumer = { attach: vi.fn(), close: vi.fn() };
    const handle = { close: vi.fn() };
    expect(runtime.attachConsumer(initial, binding, consumer)).toBe(true);
    expect(runtime.trackOwnTransport(initial, transport, handle)).toBe(true);

    runtime.acceptEvent('media.transport.closed', {
      ...delta(13),
      payload: { transportId: 'old-recv', reason: 'TRANSPORT_FAILED' },
    });
    await apply(runtime, payload, { snapshotId: uuid(85), mediaSequence: 13 });
    expect(consumer.close).not.toHaveBeenCalled();
    expect(handle.close).not.toHaveBeenCalled();
  });

  it.each(['consumer', 'transport'] as const)(
    'rejects a late Consumer callback after its %s was closed',
    async (resource) => {
      const runtime = setup();
      const transport = {
        transportId: 'recv',
        direction: 'RECV',
        iceGeneration: 0,
        restartPending: false,
      } as const;
      const initial = await apply(runtime, {
        ...empty,
        sources: [mic],
        ownTransports: [transport],
      });
      if (resource === 'consumer') {
        runtime.acceptEvent('media.consumer.closed', {
          ...delta(13),
          payload: {
            consumerId: binding.consumerId,
            sourceId: binding.sourceId,
            sourceGeneration: binding.sourceGeneration,
            reason: 'USER_STOP',
          },
        });
      } else {
        runtime.acceptEvent('media.transport.closed', {
          ...delta(13),
          payload: { transportId: transport.transportId, reason: 'TRANSPORT_FAILED' },
        });
      }
      const handle = { attach: vi.fn(), close: vi.fn() };
      expect(runtime.attachConsumer(initial, binding, handle)).toBe(false);
      expect(handle.attach).not.toHaveBeenCalled();
      expect(handle.close).toHaveBeenCalledOnce();
    },
  );

  it('keeps the prior snapshot and bindings when a buffered delta conflicts', async () => {
    const runtime = setup();
    const initial = await apply(runtime, { ...empty, sources: [mic], ownConsumers: [binding] });
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(initial, binding, handle)).toBe(true);
    const request = runtime.begin(uuid(80))!;
    runtime.acceptEvent('media.source.changed', delta(13, 3));
    runtime.acceptEvent('media.source.changed', {
      ...delta(14, 3),
      payload: { source: { ...mic, sourceRevision: 3, publicationState: 'PAUSED' } },
    });
    request.acceptAck(ack({ snapshotId: uuid(81) }, request.input.requestId));
    request.acceptPart(
      part(
        { ...empty, sources: [mic] },
        { snapshotId: uuid(81), requestId: request.input.requestId },
      ),
    );
    await expect(request.result).resolves.toEqual({ status: 'invalid' });
    expect(runtime.getSnapshot()).toBe(initial);
    expect(handle.close).not.toHaveBeenCalled();
  });

  it('stops after three retries and permits a new explicit resync', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const runtime = setup();
    const send = vi.fn(() => Promise.reject(new Error('Offline')));
    const disconnect = runtime.bindResync(send);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(send).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(2000);
      expect(send).toHaveBeenCalledTimes(4);
      runtime.acceptEvent('media.source.changed', delta(13));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(send).toHaveBeenCalledTimes(4);
      runtime.resync();
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(5);
    } finally {
      disconnect();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('routes socket packets to the current request and stops on an authority denial or abort', async () => {
    const owner = new CallControllerOwner();
    type Socket = Parameters<typeof bindMediaSourceSocket>[1];
    const listeners = new Map<string, (value: unknown) => void>();
    const emit = vi.fn<Socket['emit']>();
    const socket = {
      connected: true,
      on: vi.fn<Socket['on']>((event, listener) => listeners.set(event, listener)),
      off: vi.fn<Socket['off']>((event) => listeners.delete(event)),
      emit,
    };
    const initialized = vi.fn((runtime: MediaSnapshotRuntime) => runtime);
    await owner.acquire(context, (_identity, signal, runtime) => {
      initialized(runtime);
      runtime.updateContext(context);
      return bindMediaSourceSocket(runtime, socket, signal);
    });
    const runtime = initialized.mock.results[0]!.value;
    expect(emit).toHaveBeenCalledOnce();
    const [, input, receiveAck] = emit.mock.calls[0]!;
    listeners.get('media.sources.snapshot')?.(part({ ...empty, sources: [mic] }));
    receiveAck(ack({}, input.requestId));
    expect(runtime.getSnapshot()).toBeUndefined();
    listeners.get('media.sources.snapshot')?.(
      part({ ...empty, sources: [mic], ownConsumers: [binding] }, { requestId: input.requestId }),
    );
    const current = runtime.getSnapshot()!;
    const handle = { attach: vi.fn(), close: vi.fn() };
    expect(runtime.attachConsumer(current, binding, handle)).toBe(true);
    listeners.get('media.source.changed')?.(delta(14));
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
    const [, retry, deny] = emit.mock.calls[1]!;
    deny({ requestId: retry.requestId, error: { code: 'FORBIDDEN', message: 'Denied' } });
    expect(runtime.getSnapshot()).toBeUndefined();
    expect(handle.close).toHaveBeenCalledOnce();
    listeners.get('media.source.changed')?.(delta(15));
    owner.end(context);
    expect(listeners.size).toBe(0);
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
