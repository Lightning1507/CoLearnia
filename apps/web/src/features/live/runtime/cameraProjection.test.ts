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

describe('SCRUM-78 authoritative camera projection', () => {
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
