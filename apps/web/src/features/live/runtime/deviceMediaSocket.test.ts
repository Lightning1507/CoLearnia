import { afterEach, expect, it, vi } from 'vitest';
import type { types as MediaTypes } from 'mediasoup-client';
import { createDeviceMediaSocket } from './deviceMediaSocket';

afterEach(() => vi.unstubAllGlobals());

it.each(['lost ACK', 'cancel then ACK', 'cancel then timeout', 'new generation'] as const)(
  'retries unconfirmed cleanup before publishing again (%s)',
  async (scenario) => {
    const cancelled = scenario === 'cancel then ACK' || scenario === 'cancel then timeout';
    let createdId: string | undefined;
    let attempts = 0;
    let closeAttempts = 0;
    const ids: string[] = [];
    const tracks: MediaStreamTrack[] = [];
    let releaseAck!: () => void;
    const heldAck = new Promise<void>((resolve) => {
      releaseAck = resolve;
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        async getUserMedia() {
          const track = Object.assign(new EventTarget(), {
            kind: 'audio',
            enabled: true,
            readyState: 'live',
            stop: vi.fn(),
          }) as unknown as MediaStreamTrack;
          tracks.push(track);
          return { getTracks: () => [track] };
        },
      },
    });
    const emitWithAck = vi.fn(
      async (
        event: string,
        input: {
          requestId: string;
          payload: { target?: { createRequestId?: string; producerId?: string } };
        },
      ) => {
        if (event === 'media.producer.close') {
          closeAttempts++;
          if (closeAttempts <= 2) throw new Error('Close ACK lost');
          expect(input.payload.target?.createRequestId).toBe(createdId);
          createdId = undefined;
          return {
            requestId: input.requestId,
            data: { status: 'completed', result: { target: input.payload.target, closed: true } },
          };
        }
        ids.push(input.requestId);
        attempts++;
        if (cancelled && attempts === 1) {
          createdId = input.requestId;
          await heldAck;
          if (scenario === 'cancel then timeout') throw new Error('Create ACK timed out');
        } else if (!cancelled && attempts <= 2) {
          createdId = input.requestId;
          throw new Error('Create ACK lost');
        }
        if (!cancelled || attempts > 1) expect(createdId).toBeUndefined();
        return {
          requestId: input.requestId,
          data: {
            status: 'completed',
            result: {
              producerId: 'device-producer',
              source: {
                sourceId: 'device-source',
                producerId: 'device-producer',
                sourceGeneration: 1,
                sourceRevision: 0,
                ownerParticipantId: '2'.repeat(24),
                sourceKind: 'MIC',
                kind: 'audio',
                publicationState: 'PUBLISHING',
                scope: { type: 'MAIN' },
              },
            },
          },
        };
      },
    );
    const socket = {
      connected: true,
      volatile: { timeout: () => ({ emitWithAck }) },
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Parameters<typeof createDeviceMediaSocket>[0];
    const send = {
      id: 'SEND',
      async produce(options: MediaTypes.ProducerOptions) {
        return new Promise((resolve, reject) =>
          binding.produce(
            {
              kind: 'audio',
              rtpParameters: {
                codecs: [
                  { mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 },
                ],
              },
              appData: options.appData ?? {},
            },
            ({ id }) => resolve({ id, close: vi.fn(), on: vi.fn() }),
            reject,
          ),
        );
      },
    } as unknown as Parameters<typeof createDeviceMediaSocket>[1];
    const binding = createDeviceMediaSocket(socket, send, new AbortController().signal);
    const context = {
      sessionId: '1'.repeat(24),
      epoch: crypto.randomUUID(),
      callGeneration: 1,
      audienceEpoch: 0,
      policyRevision: 0,
      scope: { type: 'MAIN' as const },
    };
    binding.devices.updateContext(context);
    const starting = binding.devices.start('microphone');
    if (cancelled) {
      await vi.waitFor(() => expect(attempts).toBe(1));
      await binding.devices.stop('microphone');
      expect(tracks[0]?.stop).toHaveBeenCalled();
      releaseAck();
    }
    await starting;
    expect(binding.devices.getSnapshot().microphone).toEqual({
      phase: 'off',
      error: expect.stringContaining('Chưa xác nhận được việc đóng nguồn'),
      cleanupUnconfirmed: true,
    });
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(attempts).toBe(cancelled ? 1 : 2);
    if (scenario === 'new generation') {
      binding.devices.updateContext({ ...context, callGeneration: 2 });
      createdId = undefined;
    }
    if (scenario !== 'lost ACK') {
      await binding.devices.retryCleanup('microphone');
      expect(binding.devices.getSnapshot().microphone).toEqual({ phase: 'off' });
      expect(tracks).toHaveLength(1);
      expect(closeAttempts).toBe(scenario === 'new generation' ? 2 : 3);
    }
    await binding.devices.start('microphone');
    expect(binding.devices.getSnapshot().microphone.phase).toBe('on');
    await binding.devices.retryCleanup('microphone');
    expect(binding.devices.getSnapshot().microphone.phase).toBe('on');
    if (!cancelled) expect(ids[0]).toBe(ids[1]);
    expect(ids.at(-1)).not.toBe(ids[0]);
    expect(closeAttempts).toBe(scenario === 'new generation' ? 2 : 3);
  },
);
