import { describe, expect, it } from 'vitest';
import { sessionControlBudget } from './session-context.js';
import {
  mediaSourceDescriptorSchema,
  mediaSourceEventSchemas,
  mediaSourcesResyncAckSchema,
  mediaSourcesResyncInputSchema,
  mediaSourcesSnapshotSchema,
} from './media-source.js';
import type { MediaSourceEvent, MediaSourcesSnapshot } from './media-source.js';

const requestId = '10000000-0000-4000-8000-000000000001';
const context = {
  sessionId: '1'.repeat(24),
  epoch: '10000000-0000-4000-8000-000000000002',
  callGeneration: 2,
};
const watermark = {
  mediaStreamId: '10000000-0000-4000-8000-000000000003',
  mediaSequence: 12,
  audienceEpoch: 4,
  policyRevision: 9,
};
const descriptor = {
  ...watermark,
  snapshotId: '10000000-0000-4000-8000-000000000004',
  partCount: 1,
};
const camera = {
  sourceId: 'fixture-camera',
  sourceGeneration: 1,
  sourceRevision: 3,
  producerId: 'fixture-camera-producer',
  ownerParticipantId: '2'.repeat(24),
  sourceKind: 'CAMERA',
  kind: 'video',
  scope: { type: 'MAIN' },
  publicationState: 'SWITCHING',
} as const;
const pausedMic = {
  ...camera,
  sourceId: 'fixture-mic',
  producerId: 'fixture-mic-producer',
  sourceKind: 'MIC',
  kind: 'audio',
  publicationState: 'PAUSED',
} as const;
const replacement = {
  replacementId: '10000000-0000-4000-8000-000000000005',
  sourceRevision: camera.sourceRevision,
  expiresAt: '2026-11-08T10:00:05Z',
};
const snapshot = {
  ...context,
  ...descriptor,
  requestId,
  partIndex: 0,
  payload: {
    sources: [],
    ownTransports: [
      { transportId: 'fixture-send', direction: 'SEND', iceGeneration: 0, restartPending: false },
    ],
    ownProducers: [
      { source: pausedMic, replacement: null },
      { source: camera, replacement },
    ],
    ownConsumers: [],
  },
};
const event = {
  ...context,
  ...watermark,
  mediaSequence: 13,
  policyRevision: 16,
  payload: { source: { ...camera, publicationState: 'PAUSED', sourceRevision: 4 } },
};

// Review fixture for the first buffered delta after a completed snapshot.
// The actual assembler and replay state belong to the FE resync/delta tasks.
function firstDeltaDecision(
  base: MediaSourcesSnapshot,
  delta: MediaSourceEvent<'media.source.changed'>,
  currentAudienceEpoch: number,
) {
  if (base.audienceEpoch !== currentAudienceEpoch) return 'resync';
  if (
    delta.sessionId !== base.sessionId ||
    delta.epoch !== base.epoch ||
    delta.callGeneration !== base.callGeneration ||
    delta.audienceEpoch !== base.audienceEpoch ||
    delta.mediaStreamId !== base.mediaStreamId ||
    delta.mediaSequence <= base.mediaSequence
  ) {
    return 'drop';
  }
  return delta.mediaSequence === base.mediaSequence + 1 ? 'apply' : 'resync';
}

describe('SCRUM-57 media source contract', () => {
  it('pairs source kind with media kind and excludes private or native fields', () => {
    expect(mediaSourceDescriptorSchema.parse(camera)).toEqual(camera);
    expect(mediaSourceDescriptorSchema.safeParse({ ...camera, kind: 'audio' }).success).toBe(false);
    for (const field of ['deviceId', 'rtpParameters', 'track', 'frameUrl']) {
      expect(mediaSourceDescriptorSchema.safeParse({ ...camera, [field]: 'private' }).success).toBe(
        false,
      );
    }
  });

  it('uses current context for resync and matches the ack watermark to the snapshot part', () => {
    const input = { ...context, requestId, payload: {} };
    expect(mediaSourcesResyncInputSchema.parse(input)).toEqual(input);
    expect(
      mediaSourcesResyncInputSchema.safeParse({ ...input, expectedPolicyRevision: 9 }).success,
    ).toBe(false);
    const ack = mediaSourcesResyncAckSchema.parse({
      requestId,
      data: { status: 'completed', result: descriptor },
    });
    if (!('data' in ack)) throw new Error('Expected completed resync fixture');
    expect(mediaSourcesSnapshotSchema.parse(snapshot)).toMatchObject({
      requestId: ack.requestId,
      ...ack.data.result,
    });
  });

  it('keeps PAUSED and SWITCHING own producers even when sources is empty', () => {
    const parsed = mediaSourcesSnapshotSchema.parse(snapshot);
    expect(parsed.payload.sources).toEqual([]);
    expect(parsed.payload.ownProducers).toEqual(snapshot.payload.ownProducers);
    expect(
      mediaSourcesSnapshotSchema.safeParse({
        ...snapshot,
        payload: {
          ...snapshot.payload,
          ownProducers: [{ source: camera, replacement: { ...replacement, sourceRevision: 2 } }],
        },
      }).success,
    ).toBe(false);
    expect(
      mediaSourcesSnapshotSchema.safeParse({
        ...snapshot,
        payload: { ...snapshot.payload, ownProducers: [{ source: camera, replacement: null }] },
      }).success,
    ).toBe(false);
  });

  it('accepts an empty snapshot at watermark zero and rejects an invalid or oversized part count', () => {
    const empty = {
      ...snapshot,
      mediaSequence: 0,
      payload: { sources: [], ownTransports: [], ownProducers: [], ownConsumers: [] },
    };
    expect(mediaSourcesSnapshotSchema.parse(empty)).toEqual(empty);
    for (const fields of [
      { partIndex: 1 },
      { partCount: 0 },
      { partCount: sessionControlBudget.maxSnapshotParts + 1 },
    ]) {
      expect(mediaSourcesSnapshotSchema.safeParse({ ...empty, ...fields }).success).toBe(false);
    }
  });

  it('drops pre-watermark events, applies the next sequence and resyncs on a gap', () => {
    const base = mediaSourcesSnapshotSchema.parse(snapshot);
    const schema = mediaSourceEventSchemas['media.source.changed'];
    expect(firstDeltaDecision(base, schema.parse({ ...event, mediaSequence: 12 }), 4)).toBe('drop');
    expect(firstDeltaDecision(base, schema.parse(event), 4)).toBe('apply');
    expect(firstDeltaDecision(base, schema.parse({ ...event, mediaSequence: 14 }), 4)).toBe(
      'resync',
    );
  });

  it('discards the old snapshot on an audience change and rejects the previous stream', () => {
    const old = mediaSourcesSnapshotSchema.parse(snapshot);
    const schema = mediaSourceEventSchemas['media.source.changed'];
    const oldDelta = schema.parse(event);
    expect(firstDeltaDecision(old, oldDelta, 5)).toBe('resync');

    const next = mediaSourcesSnapshotSchema.parse({
      ...snapshot,
      requestId: '10000000-0000-4000-8000-000000000006',
      snapshotId: '10000000-0000-4000-8000-000000000007',
      mediaStreamId: '10000000-0000-4000-8000-000000000008',
      audienceEpoch: 5,
      mediaSequence: 0,
      policyRevision: 16,
      payload: { sources: [], ownTransports: [], ownProducers: [], ownConsumers: [] },
    });
    expect(firstDeltaDecision(next, oldDelta, 5)).toBe('drop');
    expect(
      firstDeltaDecision(
        next,
        schema.parse({
          ...event,
          mediaStreamId: next.mediaStreamId,
          audienceEpoch: 5,
          mediaSequence: 1,
          payload: {
            source: {
              ...camera,
              sourceId: 'fixture-group-camera',
              producerId: 'fixture-group-camera-producer',
              scope: { type: 'GROUP', groupId: '10000000-0000-4000-8000-000000000009' },
              publicationState: 'PUBLISHING',
            },
          },
        }),
        5,
      ),
    ).toBe('apply');
  });

  it('keeps each delta strict and identifies the generation being closed', () => {
    const schema = mediaSourceEventSchemas['media.consumer.closed'];
    const closed = {
      ...event,
      payload: {
        sourceId: camera.sourceId,
        sourceGeneration: camera.sourceGeneration,
        consumerId: 'fixture-consumer',
        reason: 'SOURCE_REPLACED',
      },
    };
    expect(schema.parse(closed)).toEqual(closed);
    expect(schema.safeParse({ ...closed, mediaSequence: 0 }).success).toBe(false);
    expect(
      schema.safeParse({ ...closed, payload: { ...closed.payload, sourceGeneration: 0 } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...closed, payload: { ...closed.payload, reason: 'raw error' } }).success,
    ).toBe(false);
    expect(mediaSourceEventSchemas['media.source.ended'].safeParse(closed).success).toBe(false);
  });
});
