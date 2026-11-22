import { describe, expect, it, vi } from 'vitest';
import { receiveMainAudio } from './receiveMainAudio';
import { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import type { ConsumerBinding } from './mediaSnapshot';
import {
  applySnapshot,
  camera,
  context,
  event,
  provideSnapshot,
} from '../../../../test/browser/camera-tiles/fixtures';

type Input = Parameters<typeof receiveMainAudio>[0];

function fixture(replaySucceeds: boolean) {
  const source = {
    sourceId: 'mic',
    sourceGeneration: 1,
    sourceRevision: 1,
    producerId: 'producer',
    sourceKind: 'MIC',
    scope: { type: 'MAIN' },
  } as Input['source'];
  const consumer = {
    id: 'consumer',
    track: {} as MediaStreamTrack,
    closed: false,
    close: vi.fn(() => {
      consumer.closed = true;
    }),
    observer: { once: vi.fn(), off: vi.fn() },
  };
  const media = {
    attachConsumer: vi.fn(() => true),
    confirmConsumerReady: vi.fn(() => true),
    detachConsumer: vi.fn(),
  };
  const readyIds: string[] = [];
  const command = vi.fn<Input['command']>(async (event, { requestId }) => {
    let result: object;
    switch (event) {
      case 'media.consumer.create':
        result = {
          consumerId: consumer.id,
          producerId: source.producerId,
          sourceId: source.sourceId,
          sourceGeneration: source.sourceGeneration,
          sourceRevision: source.sourceRevision,
          kind: 'audio',
          rtpParameters: {
            codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000 }],
          },
        };
        break;
      case 'media.consumer.ready':
        readyIds.push(requestId);
        if (readyIds.length === 1 || !replaySucceeds) throw new Error('ACK timeout');
        result = { consumerId: consumer.id, ready: true };
        break;
      case 'media.consumer.close':
        result = { consumerId: consumer.id, closed: true };
        break;
    }
    return { requestId, data: { status: 'completed', result } };
  });
  const input: Input = {
    media: media as unknown as Input['media'],
    snapshot: {
      sessionId: '1'.repeat(24),
      epoch: crypto.randomUUID(),
      callGeneration: 1,
      policyRevision: 0,
      payload: { ownProducers: [] },
    } as unknown as Input['snapshot'],
    source,
    transport: {
      id: 'recv',
      consume: vi.fn(async () => consumer),
    } as unknown as Input['transport'],
    rtpCapabilities: {},
    command,
    signal: new AbortController().signal,
  };
  return { input, readyIds, consumer, command, media };
}

describe('MAIN audio ready acknowledgement', () => {
  it.each([false, true])(
    'keeps both real runtime bindings across ready resync, overlapping C event and pending B=%s',
    async (overlapping) => {
      const lifetime = new AbortController();
      const media = new MediaSnapshotRuntime(context, lifetime.signal);
      media.updateContext(context);
      const sources: Input['source'][] = [
        {
          ...camera,
          sourceId: 'mic-A',
          producerId: 'producer-A',
          kind: 'audio',
          sourceKind: 'MIC',
        },
        {
          ...camera,
          sourceId: 'mic-B',
          producerId: 'producer-B',
          kind: 'audio',
          sourceKind: 'MIC',
        },
      ];
      const consumers = sources.map((source, index) => {
        const consumer = {
          id: `consumer-${index}`,
          track: {} as MediaStreamTrack,
          closed: false,
          close: vi.fn(() => {
            consumer.closed = true;
          }),
          observer: { once: vi.fn(), off: vi.fn() },
        };
        const binding: ConsumerBinding = {
          sourceId: source.sourceId,
          sourceGeneration: 1,
          sourceRevision: 1,
          producerId: source.producerId,
          consumerId: consumer.id,
          ready: false,
          paused: true,
        };
        return { consumer, binding };
      });
      const responses: ((bindings: ConsumerBinding[]) => void)[] = [];
      const third = { ...camera, sourceId: 'camera-C', producerId: 'producer-C' };
      let responseSequence = 0;
      let responseSources = sources;
      const resync = vi.fn<Parameters<MediaSnapshotRuntime['bindResync']>[0]>((input, receive) => {
        responses.push((bindings) =>
          provideSnapshot(
            input.requestId,
            receive,
            responseSources,
            false,
            responseSequence,
            bindings,
          ),
        );
      });
      const unbind = media.bindResync(resync);
      try {
        await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(1));
        responses.shift()!([]);
        const snapshot = media.getSnapshot()!;
        const ready = new Map<string, () => void>();
        const command = vi.fn<Input['command']>(async (event, input) => {
          const payload = input.payload as { sourceId?: string; consumerId?: string };
          if (event === 'media.consumer.ready')
            return new Promise((resolve) => {
              ready.set(payload.consumerId!, () =>
                resolve({
                  requestId: input.requestId,
                  data: {
                    status: 'completed',
                    result: { consumerId: payload.consumerId, ready: true },
                  },
                }),
              );
            });
          const entry = consumers.find(({ binding }) => binding.sourceId === payload.sourceId)!;
          const result =
            event === 'media.consumer.close'
              ? { consumerId: entry.consumer.id, closed: true }
              : {
                  consumerId: entry.binding.consumerId,
                  producerId: entry.binding.producerId,
                  sourceId: entry.binding.sourceId,
                  sourceGeneration: entry.binding.sourceGeneration,
                  sourceRevision: entry.binding.sourceRevision,
                  kind: 'audio',
                  rtpParameters: {
                    codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000 }],
                  },
                };
          return { requestId: input.requestId, data: { status: 'completed', result } };
        });
        const transport = {
          id: 'recv',
          consume: vi.fn(
            async ({ id }: { id: string }) =>
              consumers.find((entry) => entry.consumer.id === id)!.consumer,
          ),
        } as unknown as Input['transport'];
        const completed = Promise.allSettled(
          sources.map((source) =>
            receiveMainAudio({
              media,
              snapshot,
              source,
              transport,
              command,
              rtpCapabilities: {},
              signal: lifetime.signal,
            }),
          ),
        );
        await vi.waitFor(() => expect(ready.size).toBe(2));
        await applySnapshot(
          media,
          sources,
          false,
          0,
          consumers.map((entry) => entry.binding),
        );
        ready.get(consumers[0]!.consumer.id)!();
        await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
        if (overlapping) media.acceptEvent('media.source.changed', event({ source: third }, 1));
        ready.get(consumers[1]!.consumer.id)!();
        const results = await completed;
        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(command.mock.calls.map(([event]) => event)).not.toContain('media.consumer.close');
        expect(responses).toHaveLength(1);
        if (overlapping) {
          responses.shift()!([
            { ...consumers[0]!.binding, ready: true, paused: false },
            consumers[1]!.binding,
          ]);
          expect(media.getCameraSnapshot().synchronized).toBe(false);
          responseSources = [...sources, third];
          responseSequence = 1;
          await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(3), { timeout: 1500 });
        }
        responses.shift()!(
          consumers.map((entry, index) => ({ ...entry.binding, ready: true, paused: index === 1 })),
        );
        expect(media.getSnapshot()!.payload.ownConsumers.map((binding) => binding.paused)).toEqual([
          false,
          true,
        ]);
        for (const { consumer } of consumers) expect(consumer.close).not.toHaveBeenCalled();
      } finally {
        unbind();
        lifetime.abort();
      }
    },
  );

  it('recovers a lost ACK with the same ready request', async () => {
    const { input, readyIds, consumer, command } = fixture(true);
    await expect(receiveMainAudio(input)).resolves.toBe(consumer);
    expect(readyIds).toHaveLength(2);
    expect(readyIds[0]).toBe(readyIds[1]);
    expect(command.mock.calls.map(([event]) => event)).not.toContain('media.consumer.close');
  });

  it('closes the exact remote Consumer when ready cannot be confirmed', async () => {
    const { input, readyIds, consumer, command, media } = fixture(false);
    await expect(receiveMainAudio(input)).rejects.toThrow('ACK timeout');
    expect(readyIds).toHaveLength(2);
    expect(media.detachConsumer).toHaveBeenCalledOnce();
    expect(consumer.close).toHaveBeenCalledOnce();
    expect(command).toHaveBeenLastCalledWith(
      'media.consumer.close',
      expect.objectContaining({
        payload: {
          consumerId: consumer.id,
          sourceId: 'mic',
          sourceGeneration: 1,
          transportId: 'recv',
        },
      }),
    );
  });
});
