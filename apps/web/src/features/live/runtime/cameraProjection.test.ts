import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import { CallControllerOwner } from './callController';
import { cameraStatus } from './cameraProjection';
import { CameraTiles } from '../room/CameraTiles';
import type { ConsumerBinding } from './mediaSnapshot';
import {
  applySnapshot,
  binding,
  camera,
  context,
  event,
  provideSnapshot,
} from '../../../../test/browser/camera-tiles/fixtures';

function setup() {
  const abort = new AbortController();
  const media = new MediaSnapshotRuntime(context, abort.signal);
  media.updateContext(context);
  const track = {
    id: 'video',
    kind: 'video',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const handle = { attach: vi.fn(), close: vi.fn(), videoTrack: track };
  return { media, abort, track, handle };
}
const current = (media: MediaSnapshotRuntime) => media.getCameraSnapshot().cameras[0]!;

async function pendingCameraPair() {
  const fixture = setup();
  const { media, handle, track } = fixture;
  const secondSource = {
    ...camera,
    sourceId: 'camera-B',
    producerId: 'producer-B',
    ownerParticipantId: '4'.repeat(24),
  };
  const secondBinding = {
    ...binding,
    sourceId: secondSource.sourceId,
    producerId: secondSource.producerId,
    consumerId: 'consumer-B',
  };
  const secondHandle = {
    ...handle,
    videoTrack: { ...track, id: 'video-B' } as MediaStreamTrack,
    attach: vi.fn(),
    close: vi.fn(),
  };
  const sources = [camera, secondSource];
  const bindings = [binding, secondBinding];
  const handles = [handle, secondHandle];
  const responses: ((consumers: ConsumerBinding[]) => void)[] = [];
  const resync = vi.fn<Parameters<MediaSnapshotRuntime['bindResync']>[0]>((input, receive) => {
    responses.push((consumers) =>
      provideSnapshot(input.requestId, receive, sources, false, 0, consumers),
    );
  });
  const unbind = media.bindResync(resync);
  await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(1));
  responses.shift()!([]);
  const original = media.getSnapshot()!;
  for (const [index, entry] of bindings.entries())
    expect(media.attachConsumer(original, entry, handles[index]!)).toBe(true);
  await applySnapshot(media, sources, false, 0, bindings);
  return { ...fixture, original, bindings, handles, sources, resync, responses, unbind };
}

describe('SCRUM-78 authoritative camera projection', () => {
  it('bounds rereads of acknowledged Consumers still pending and recovers on explicit resync', async () => {
    const { media, original, bindings, handles, resync, responses, unbind, abort } =
      await pendingCameraPair();
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      for (const [index, entry] of bindings.entries())
        expect(media.confirmConsumerReady(original, entry, handles[index]!)).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      for (const delay of [500, 1000, 2000]) {
        responses.shift()!(bindings);
        expect(media.getCameraSnapshot().synchronized).toBe(false);
        await vi.advanceTimersByTimeAsync(delay);
      }
      responses.shift()!(bindings);
      await vi.advanceTimersByTimeAsync(60000);
      expect(resync).toHaveBeenCalledTimes(5);
      expect(media.getCameraSnapshot().synchronized).toBe(false);
      for (const handle of handles) expect(handle.close).not.toHaveBeenCalled();
      media.resync();
      await vi.advanceTimersByTimeAsync(0);
      expect(resync).toHaveBeenCalledTimes(6);
      responses.shift()!(bindings.map((entry) => ({ ...entry, ready: true, paused: false })));
      expect(media.getCameraSnapshot().synchronized).toBe(true);
      expect(media.getCameraSnapshot().cameras.map((view) => view.track)).toEqual(
        handles.map((handle) => handle.videoTrack),
      );
    } finally {
      random.mockRestore();
      unbind();
      abort.abort();
      vi.useRealTimers();
    }
  });

  it.each([false, true])(
    'reads again when B ACK precedes a snapshot still pending B, final paused=%s',
    async (paused) => {
      const { media, original, bindings, handles, resync, responses, unbind, abort } =
        await pendingCameraPair();
      try {
        expect(media.confirmConsumerReady(original, bindings[0]!, handles[0]!)).toBe(true);
        await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
        const capturedBeforeBAck = [{ ...bindings[0]!, ready: true, paused: false }, bindings[1]!];
        expect(media.confirmConsumerReady(original, bindings[1]!, handles[1]!)).toBe(true);
        responses.shift()!(capturedBeforeBAck);
        expect(media.getCameraSnapshot().cameras[1]!.track).toBeUndefined();
        await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(3), { timeout: 1500 });
        responses.shift()!(
          bindings.map((entry, index) => ({
            ...entry,
            ready: true,
            paused: index === 1 && paused,
          })),
        );
        const views = media.getCameraSnapshot().cameras;
        expect(media.getCameraSnapshot().synchronized).toBe(true);
        expect(views[0]!.track).toBe(handles[0]!.videoTrack);
        expect(views[1]!.track).toBe(paused ? undefined : handles[1]!.videoTrack);
        for (const handle of handles) {
          expect(handle.close).not.toHaveBeenCalled();
          expect(handle.attach).toHaveBeenCalledOnce();
        }
      } finally {
        unbind();
        abort.abort();
      }
    },
  );

  it('keeps B valid when an in-order source.changed only adds camera C during resync', async () => {
    const { media, original, bindings, handles, resync, responses, unbind, abort } =
      await pendingCameraPair();
    try {
      media.confirmConsumerReady(original, bindings[0]!, handles[0]!);
      await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
      const third = {
        ...camera,
        sourceId: 'camera-C',
        producerId: 'producer-C',
        ownerParticipantId: '5'.repeat(24),
      };
      media.acceptEvent('media.source.changed', event({ source: third }, 1));
      expect(media.confirmConsumerReady(original, bindings[1]!, handles[1]!)).toBe(true);
      responses.shift()!(bindings.map((entry) => ({ ...entry, ready: true, paused: false })));
      const views = media.getCameraSnapshot().cameras;
      expect(views).toHaveLength(3);
      expect(views.find((view) => view.source.sourceId === bindings[1]!.sourceId)!.track).toBe(
        handles[1]!.videoTrack,
      );
      expect(views.find((view) => view.source.sourceId === third.sourceId)!.track).toBeUndefined();
      expect(resync).toHaveBeenCalledTimes(2);
      for (const handle of handles) expect(handle.close).not.toHaveBeenCalled();
    } finally {
      unbind();
      abort.abort();
    }
  });

  it.each([
    'audience',
    'policy',
    'disconnect',
    'explicit resync',
    'source replacement',
    'consumer closed',
    'source ended',
    'buffered policy',
    'sequence gap',
  ] as const)('fences a grouped ready ACK after %s', async (change) => {
    const { media, original, bindings, handles, sources, unbind, abort } =
      await pendingCameraPair();
    try {
      expect(media.confirmConsumerReady(original, bindings[0]!, handles[0]!)).toBe(true);
      if (change === 'audience')
        media.updateContext({ ...context, audienceEpoch: 1, projectionSequence: 2 });
      if (change === 'policy')
        media.updateContext({ ...context, policyRevision: 1, projectionSequence: 2 });
      if (change === 'disconnect') media.setSignalingAvailable(false);
      if (change === 'explicit resync') media.resync();
      if (change === 'source replacement')
        media.acceptEvent(
          'media.source.changed',
          event({ source: { ...sources[1]!, sourceGeneration: 2, producerId: 'replacement' } }, 1),
        );
      if (change === 'consumer closed')
        media.acceptEvent(
          'media.consumer.closed',
          event(
            {
              sourceId: bindings[1]!.sourceId,
              sourceGeneration: 1,
              consumerId: bindings[1]!.consumerId,
              reason: 'SOURCE_ENDED',
            },
            1,
          ),
        );
      if (change === 'sequence gap')
        media.acceptEvent('media.source.changed', event({ source: camera }, 3));
      if (change === 'source ended')
        media.acceptEvent(
          'media.source.ended',
          event(
            {
              sourceId: bindings[1]!.sourceId,
              sourceGeneration: 1,
              sourceRevision: 1,
              reason: 'SOURCE_ENDED',
            },
            1,
          ),
        );
      if (change === 'buffered policy')
        media.acceptEvent('media.source.changed', {
          ...event({ source: camera }, 1),
          policyRevision: 1,
        });
      expect(media.confirmConsumerReady(original, bindings[1]!, handles[1]!)).toBe(false);
      expect(media.getCameraSnapshot().cameras.every((view) => !view.track)).toBe(true);
    } finally {
      unbind();
      abort.abort();
    }
  });

  it('does not admit new attachments or a different Consumer ID into a ready reconciliation', async () => {
    const { media, original, bindings, handles, unbind, abort } = await pendingCameraPair();
    try {
      media.confirmConsumerReady(original, bindings[0]!, handles[0]!);
      const extra = { ...handles[1]!, attach: vi.fn(), close: vi.fn() };
      expect(media.attachConsumer(original, bindings[1]!, extra)).toBe(false);
      expect(extra.attach).not.toHaveBeenCalled();
      expect(extra.close).toHaveBeenCalledOnce();
      expect(
        media.confirmConsumerReady(
          original,
          { ...bindings[1]!, consumerId: 'different' },
          handles[1]!,
        ),
      ).toBe(false);
      expect(media.confirmConsumerReady(original, bindings[1]!, handles[1]!)).toBe(true);
      expect(handles[1]!.close).not.toHaveBeenCalled();
    } finally {
      unbind();
      abort.abort();
    }
  });

  it.each(['same turn', 'resync in flight'] as const)(
    'coalesces two valid ready ACKs (%s) without closing a Consumer',
    async (timing) => {
      const { media, original, bindings, handles, resync, responses, unbind, abort } =
        await pendingCameraPair();
      expect(media.confirmConsumerReady(original, bindings[0]!, handles[0]!)).toBe(true);
      if (timing === 'resync in flight')
        await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
      expect(media.confirmConsumerReady(original, bindings[1]!, handles[1]!)).toBe(true);
      await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
      expect(media.getCameraSnapshot().cameras.every((view) => !view.track)).toBe(true);
      expect(responses).toHaveLength(1);
      responses.shift()!(
        bindings.map((entry, index) => ({ ...entry, ready: true, paused: index === 1 })),
      );
      const views = media.getCameraSnapshot().cameras;
      expect(media.getCameraSnapshot().synchronized).toBe(true);
      expect(views[0]!.track).toBe(handles[0]!.videoTrack);
      expect(views[1]!.track).toBeUndefined();
      for (const handle of handles) {
        expect(handle.close).not.toHaveBeenCalled();
        expect(handle.attach).toHaveBeenCalledOnce();
      }
      unbind();
      abort.abort();
    },
  );

  it.each([false, true])(
    'resyncs a pending snapshot after ready ACK and honors the fresh paused=%s state',
    async (paused) => {
      const { media, handle, track } = setup();
      const responses: ((consumers: ConsumerBinding[]) => void)[] = [];
      const resync = vi.fn<Parameters<MediaSnapshotRuntime['bindResync']>[0]>((input, receive) => {
        responses.push((consumers) =>
          provideSnapshot(input.requestId, receive, [camera], false, 0, consumers),
        );
      });
      const unbind = media.bindResync(resync);
      await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(1));
      responses.shift()!([]);
      const original = media.getSnapshot()!;
      media.attachConsumer(original, binding, handle);
      await applySnapshot(media, [camera], false, 0, [{ ...binding, ready: false, paused: true }]);

      expect(media.confirmConsumerReady(original, binding, handle)).toBe(true);
      expect(current(media).track).toBeUndefined();
      await vi.waitFor(() => expect(resync).toHaveBeenCalledTimes(2));
      expect(media.getCameraSnapshot().synchronized).toBe(false);
      responses.shift()!([{ ...binding, ready: true, paused }]);
      expect(media.getCameraSnapshot().synchronized).toBe(true);
      expect(current(media).track).toBe(paused ? undefined : track);
      expect(handle.attach).toHaveBeenCalledOnce();
      expect(handle.close).not.toHaveBeenCalled();
      unbind();
    },
  );

  it.each([
    { ready: true, paused: true },
    { ready: false, paused: true },
    { ready: true, paused: false },
  ])(
    'keeps a newer snapshot Consumer state after an old ready ACK ($ready/$paused)',
    async (state) => {
      const { media, handle, track } = setup();
      const original = await applySnapshot(media);
      media.attachConsumer(original, binding, handle);
      await applySnapshot(media, [camera], false, 0, [{ ...binding, ...state }]);
      expect(media.confirmConsumerReady(original, binding, handle)).toBe(true);
      expect(current(media).track).toBe(state.ready && !state.paused ? track : undefined);
      expect(media.getCameraSnapshot().synchronized).toBe(state.ready);
      expect(handle.close).not.toHaveBeenCalled();
    },
  );

  it('requires enabled local track in both directions even after video reports playing', () => {
    const { track } = setup();
    const view = { source: camera, local: true, track };
    expect(cameraStatus(view, true, true)).toBe('Camera đang phát · Bạn');
    track.enabled = false;
    expect(cameraStatus(view, true, true)).toBe('Đang chờ hình ảnh');
    track.enabled = true;
    expect(cameraStatus(view, true, true)).toBe('Camera đang phát · Bạn');
    expect(
      cameraStatus({ ...view, source: { ...camera, publicationState: 'PAUSED' } }, true, true),
    ).toBe('Camera tạm dừng');
  });

  it('waits for consumer ready and video playback separately', async () => {
    const { media, handle, track } = setup();
    const snapshot = await applySnapshot(media);
    expect(current(media).track).toBeUndefined();
    media.attachConsumer(snapshot, binding, handle);
    expect(current(media).track).toBeUndefined();
    media.confirmConsumerReady(snapshot, binding, handle);
    expect(current(media).track).toBe(track);
    expect(cameraStatus(current(media), true, false)).toBe('Đang chờ hình ảnh');
    expect(cameraStatus(current(media), true, true)).toBe('Đang nhận hình ảnh');
  });

  it('removes the visual track on pause and waits again on resume', async () => {
    const { media, handle, track } = setup();
    const snapshot = await applySnapshot(media);
    media.attachConsumer(snapshot, binding, handle);
    media.confirmConsumerReady(snapshot, binding, handle);
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, publicationState: 'PAUSED', sourceRevision: 2 } }, 1),
    );
    expect(current(media).track).toBeUndefined();
    expect(cameraStatus(current(media), true, true)).toBe('Camera tạm dừng');
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, sourceRevision: 3 } }, 2),
    );
    expect(current(media).track).toBe(track);
    expect(cameraStatus(current(media), true, false)).toBe('Đang chờ hình ảnh');
    expect(handle.close).not.toHaveBeenCalled();
  });

  it('honors owner-only PAUSED even with a live enabled local track and public PUBLISHING', async () => {
    const { media, track } = setup();
    const source = { ...camera, ownerParticipantId: context.participantId };
    await applySnapshot(media, [source], true);
    const detach = media.bindCameraPreview(source, track);
    expect(current(media).track).toBe(track);
    media.acceptEvent(
      'media.producer.stateChanged',
      event(
        {
          producerId: source.producerId,
          sourceId: source.sourceId,
          sourceGeneration: 1,
          sourceRevision: 2,
          state: 'PAUSED',
        },
        1,
      ),
    );
    expect(track.enabled).toBe(true);
    expect(current(media).track).toBeUndefined();
    expect(cameraStatus(current(media), true, true)).toBe('Camera tạm dừng');
    detach();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not render a preview without a reconciled source', async () => {
    const { media, track } = setup();
    await applySnapshot(media, []);
    media.bindCameraPreview({ ...camera, ownerParticipantId: context.participantId }, track);
    expect(media.getCameraSnapshot().cameras).toEqual([]);
  });

  it('keeps PAUSED after stale and duplicate PUBLISHING events', async () => {
    const { media } = setup();
    await applySnapshot(media);
    const paused = event(
      { source: { ...camera, publicationState: 'PAUSED', sourceRevision: 3 } },
      1,
    );
    media.acceptEvent('media.source.changed', paused);
    media.acceptEvent('media.source.changed', paused);
    media.acceptEvent('media.source.changed', event({ source: camera }, 2));
    expect(media.getCameraSnapshot().cameras).toHaveLength(1);
    expect(current(media).source.publicationState).toBe('PAUSED');
  });

  it('displays SWITCHING without an old video binding', async () => {
    const { media } = setup();
    await applySnapshot(media);
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, sourceRevision: 2, publicationState: 'SWITCHING' } }, 1),
    );
    expect(current(media).track).toBeUndefined();
    expect(cameraStatus(current(media), true, true)).toBe('Đang chuyển camera');
    media.acceptEvent(
      'media.source.changed',
      event({ source: { ...camera, sourceRevision: 3 } }, 2),
    );
    expect(cameraStatus(current(media), true, false)).toBe('Đang chờ hình ảnh');
  });

  it.each(['SOURCE_ENDED', 'PERMISSION_REVOKED'] as const)(
    'removes ended/revoked sources (%s) and closes only their consumer',
    async (reason) => {
      const { media, handle } = setup();
      const snapshot = await applySnapshot(media);
      media.attachConsumer(snapshot, binding, handle);
      media.acceptEvent(
        'media.source.ended',
        event({ sourceId: camera.sourceId, sourceGeneration: 1, sourceRevision: 2, reason }, 1),
      );
      expect(media.getCameraSnapshot().cameras).toEqual([]);
      expect(handle.close).toHaveBeenCalledOnce();
      media.acceptEvent('media.source.changed', event({ source: camera }, 2));
      expect(media.getCameraSnapshot().cameras).toEqual([]);
    },
  );

  it('removes own camera on ended before the owner CLOSED delta arrives', async () => {
    const { media, track } = setup();
    const source = { ...camera, ownerParticipantId: context.participantId };
    await applySnapshot(media, [source], true);
    media.bindCameraPreview(source, track);
    media.acceptEvent(
      'media.source.ended',
      event(
        {
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 2,
          reason: 'SOURCE_ENDED',
        },
        1,
      ),
    );
    expect(media.getCameraSnapshot().cameras).toEqual([]);
  });

  it('removes an own source on CLOSED without relying on track.enabled', async () => {
    const { media, track } = setup();
    const source = { ...camera, ownerParticipantId: context.participantId };
    await applySnapshot(media, [source], true);
    media.bindCameraPreview(source, track);
    media.acceptEvent(
      'media.producer.stateChanged',
      event(
        {
          producerId: camera.producerId,
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 2,
          state: 'CLOSED',
          reason: 'USER_STOP',
        },
        1,
      ),
    );
    expect(media.getCameraSnapshot().cameras).toEqual([]);
  });

  it('does not hide a newer owner revision after an old source-ended event', async () => {
    const { media } = setup();
    const source = { ...camera, ownerParticipantId: context.participantId };
    await applySnapshot(media, [source], true);
    media.acceptEvent(
      'media.producer.stateChanged',
      event(
        {
          producerId: camera.producerId,
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 3,
          state: 'PAUSED',
        },
        1,
      ),
    );
    media.acceptEvent(
      'media.source.ended',
      event(
        {
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          sourceRevision: 2,
          reason: 'SOURCE_ENDED',
        },
        2,
      ),
    );
    expect(current(media).source.sourceRevision).toBe(3);
    expect(current(media).source.publicationState).toBe('PAUSED');
  });

  it('ignores old generation ended and old consumer close callbacks', async () => {
    const { media, handle } = setup();
    const old = await applySnapshot(media);
    media.attachConsumer(old, binding, handle);
    const source = { ...camera, producerId: 'producer-B', sourceGeneration: 2 };
    media.acceptEvent('media.source.changed', event({ source }, 1));
    const nextBinding = {
      ...binding,
      producerId: source.producerId,
      sourceGeneration: 2,
      consumerId: 'consumer-B',
    };
    const next = { ...handle, attach: vi.fn(), close: vi.fn() };
    const snapshot = media.getSnapshot()!;
    media.attachConsumer(snapshot, nextBinding, next);
    media.confirmConsumerReady(snapshot, nextBinding, next);
    media.acceptEvent(
      'media.source.ended',
      event(
        {
          sourceId: source.sourceId,
          sourceGeneration: 1,
          sourceRevision: 3,
          reason: 'SOURCE_ENDED',
        },
        2,
      ),
    );
    media.acceptEvent(
      'media.consumer.closed',
      event(
        {
          sourceId: source.sourceId,
          sourceGeneration: 1,
          consumerId: binding.consumerId,
          reason: 'SOURCE_ENDED',
        },
        3,
      ),
    );
    media.detachConsumer(binding, handle);
    expect(current(media).source.sourceGeneration).toBe(2);
    expect(current(media).track).toBe(next.videoTrack);
    expect(next.close).not.toHaveBeenCalled();
  });

  it('detaches a closed consumer and waits for media without removing the source', async () => {
    const { media, handle } = setup();
    const snapshot = await applySnapshot(media);
    media.attachConsumer(snapshot, binding, handle);
    media.confirmConsumerReady(snapshot, binding, handle);
    media.acceptEvent(
      'media.consumer.closed',
      event(
        {
          sourceId: camera.sourceId,
          sourceGeneration: 1,
          consumerId: binding.consumerId,
          reason: 'SOURCE_ENDED',
        },
        1,
      ),
    );
    expect(current(media).track).toBeUndefined();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it.each(['disconnect', 'gap', 'policy', 'audience', 'revoke', 'abort'] as const)(
    'fences camera rendering on %s',
    async (change) => {
      const { media, handle, abort } = setup();
      const snapshot = await applySnapshot(media);
      media.attachConsumer(snapshot, binding, handle);
      media.confirmConsumerReady(snapshot, binding, handle);
      if (change === 'disconnect') media.setSignalingAvailable(false);
      if (change === 'gap') media.acceptEvent('media.source.changed', event({ source: camera }, 3));
      if (change === 'policy')
        media.updateContext({ ...context, policyRevision: 1, projectionSequence: 2 });
      if (change === 'audience')
        media.updateContext({ ...context, audienceEpoch: 1, projectionSequence: 2 });
      if (change === 'revoke') media.updateContext(null);
      if (change === 'abort') abort.abort();
      expect(media.getCameraSnapshot().synchronized).toBe(false);
      expect(media.getCameraSnapshot().cameras.every((value) => !value.track)).toBe(true);
    },
  );

  it('requires a fresh snapshot after signaling reconnects', async () => {
    const { media } = setup();
    await applySnapshot(media);
    media.setSignalingAvailable(false);
    media.setSignalingAvailable(true);
    expect(media.getCameraSnapshot().synchronized).toBe(false);
    await applySnapshot(media);
    expect(media.getCameraSnapshot().synchronized).toBe(true);
  });

  it('keeps external store snapshots stable and forwards changes through the existing owner', async () => {
    const owner = new CallControllerOwner();
    let media!: MediaSnapshotRuntime;
    await owner.acquire(context, (_identity, _signal, runtime) => {
      media = runtime;
      runtime.updateContext(context);
      return () => {};
    });
    const listener = vi.fn();
    const unsubscribe = owner.subscribe(listener);
    await applySnapshot(media);
    expect(listener).toHaveBeenCalled();
    expect(owner.getCameraSnapshot()).toBe(owner.getCameraSnapshot());
    unsubscribe();
    owner.shutdown();
    expect(owner.getCameraSnapshot().cameras).toEqual([]);
  });

  it('renders accessible pause and waiting states without a false active label', () => {
    const view = {
      source: { ...camera, publicationState: 'PAUSED' as const },
      local: true,
      track: undefined,
    };
    const html = renderToStaticMarkup(
      createElement(CameraTiles, { snapshot: { synchronized: true, cameras: [view] } }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Camera tạm dừng');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('Camera đang phát');
  });
});
