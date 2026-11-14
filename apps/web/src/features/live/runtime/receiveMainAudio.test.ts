import { describe, expect, it, vi } from 'vitest';
import { receiveMainAudio } from './receiveMainAudio';

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
