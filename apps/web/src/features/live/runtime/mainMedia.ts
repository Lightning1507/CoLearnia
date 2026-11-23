import { Device, type types as MediaTypes } from 'mediasoup-client';
import type { Socket } from 'socket.io-client';
import {
  mediaTransportCreateAckSchema,
  mediaTransportConnectAckSchema,
} from '@colearnia/contracts';
import type { SessionProjection } from '@colearnia/contracts';
import type { CallIdentity } from './callController';
import type { MediaSnapshotRuntime } from './mediaSnapshotRuntime';
import type { SessionProjectionRuntime } from './sessionProjectionRuntime';
import type { LobbyDevicePreferences } from '../lobby/LobbyDeviceCheck';
import { bindMediaBootstrapSocket } from './mediaBootstrap';
import { bindMediaSourceSocket } from './mediaSourceSocket';
import { createDeviceMediaSocket } from './deviceMediaSocket';
import { bindScreenShareSocket } from './screenShareSocket';
import { receiveMainSource } from './receiveMainAudio';
import { mainCommand, MainCallError, waitForMain } from './mainConnection';
import { summarizeAudioStats } from './audioDiagnostics';

export type MainMediaView = {
  projection: SessionProjection | null;
  stream: MediaStream | undefined;
  shareLabel: string | undefined;
};

// One media composition per accepted generation. Lazy transports avoid creating
// idle native transports that cannot complete DTLS before their connect deadline.
export async function initializeMainMedia({
  identity,
  socket,
  signal,
  media,
  projection,
  preferences,
  onView,
  onError,
}: {
  identity: CallIdentity;
  socket: Socket;
  signal: AbortSignal;
  media: MediaSnapshotRuntime;
  projection: SessionProjectionRuntime;
  preferences: LobbyDevicePreferences;
  onView(view: MainMediaView): void;
  onError(error: unknown): void;
}) {
  const lifetime = new AbortController();
  signal = AbortSignal.any([signal, lifetime.signal]);
  const device = new Device();
  const bootstrap = bindMediaBootstrapSocket(socket, () => projection.getSnapshot().cursor, {
    signal,
  });
  const unbindMedia = bindMediaSourceSocket(media, socket, signal);
  const transports = new Map<'SEND' | 'RECV', MediaTypes.Transport>();
  const pending = new Map<'SEND' | 'RECV', Promise<MediaTypes.Transport>>();
  const tracked = new Set<string>();
  let disposed = false;
  const current = () => {
    signal.throwIfAborted();
    if (disposed) throw new DOMException('Disposed', 'AbortError');
  };
  const envelope = () => {
    current();
    const cursor = projection.getSnapshot().cursor;
    if (projection.getSnapshot().status !== 'ready' || !cursor) throw new MainCallError('CONFLICT');
    return {
      sessionId: identity.sessionId,
      epoch: identity.epoch,
      callGeneration: identity.callGeneration,
      expectedPolicyRevision: cursor.policyRevision,
    };
  };
  type ProduceListener = Parameters<typeof bindScreenShareSocket>[4];
  const produceListeners = new Set<ProduceListener>();
  let iceServers: RTCIceServer[] = [];
  const ensureTransport = (direction: 'SEND' | 'RECV') => {
    current();
    const existing = transports.get(direction);
    if (existing && !existing.closed) return Promise.resolve(existing);
    const job = pending.get(direction);
    if (job) return job;
    const request = (async () => {
      const input = { ...envelope(), requestId: crypto.randomUUID(), payload: { direction } };
      const ack = mediaTransportCreateAckSchema.parse(
        await mainCommand(socket, 'media.transport.create', input, signal),
      );
      current();
      if ('error' in ack) throw new MainCallError(ack.error.code);
      const { transportId, ...parameters } = ack.data.result;
      const options = { ...parameters, id: transportId, iceServers } as MediaTypes.TransportOptions;
      const transport =
        direction === 'SEND'
          ? device.createSendTransport(options)
          : device.createRecvTransport(options);
      transports.set(direction, transport);
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        void (async () => {
          const command = {
            ...envelope(),
            requestId: crypto.randomUUID(),
            payload: { transportId, dtlsParameters },
          };
          const connected = mediaTransportConnectAckSchema.parse(
            await mainCommand(socket, 'media.transport.connect', command, signal),
          );
          current();
          if ('error' in connected || connected.data.result.transportId !== transportId)
            throw new MainCallError('CONFLICT');
          callback();
        })().catch(errback);
      });
      if (direction === 'SEND')
        for (const listener of produceListeners) transport.on('produce', listener);
      transport.on('connectionstatechange', (state) => {
        if (state === 'failed') {
          transport.close();
          media.resync();
          onError(new MainCallError('DEPENDENCY_UNAVAILABLE'));
        }
      });
      media.resync();
      return transport;
    })();
    pending.set(direction, request);
    void request
      .finally(() => {
        if (pending.get(direction) === request) pending.delete(direction);
      })
      .catch(() => {});
    return request;
  };
  // This port owns no extra native transport; it creates the shared SEND on demand.
  const send = {
    get id() {
      return transports.get('SEND')?.id ?? '';
    },
    async produce<T extends MediaTypes.AppData = MediaTypes.AppData>(
      options: MediaTypes.ProducerOptions<T>,
    ): Promise<MediaTypes.Producer<T>> {
      const transport = await ensureTransport('SEND');
      current();
      return transport.produce(options);
    },
    on(_event: 'produce', listener: ProduceListener) {
      produceListeners.add(listener);
      transports.get('SEND')?.on('produce', listener);
    },
    off(_event: 'produce', listener: ProduceListener) {
      produceListeners.delete(listener);
      transports.get('SEND')?.off('produce', listener);
    },
  };
  const { devices, produce } = createDeviceMediaSocket(socket, send, signal, preferences, media);
  const picker = bindScreenShareSocket(identity, socket, signal, send, produce);
  let stream: MediaStream | undefined;
  let stageTrack: MediaStreamTrack | undefined;
  const receivers = new Map<string, MediaTypes.Consumer | null>();
  let receiving = false;
  let initialized = false;
  let rerun = false;
  let stopRefresh = () => {};
  const renderView = () => {
    const snapshot = projection.getSnapshot();
    const accepted = snapshot.status === 'ready' ? snapshot.projection : null;
    const track = picker.getStream()?.getVideoTracks()[0] ?? media.getScreenTrack();
    if (track !== stageTrack) {
      stageTrack = track;
      stream = track ? new MediaStream([track]) : undefined;
    }
    const source = media
      .getSnapshot()
      ?.payload.sources.find((item) => item.sourceKind === 'SCREEN');
    const name = accepted?.participants.find(
      (item) => item.participantId === source?.ownerParticipantId,
    )?.displayName;
    onView({
      projection: accepted,
      stream,
      shareLabel: source ? `${name ?? 'Thành viên'} đang chia sẻ` : undefined,
    });
  };
  const updateView = () => {
    const snapshot = projection.getSnapshot();
    const accepted = snapshot.status === 'ready' ? snapshot.projection : null;
    const cursor = snapshot.status === 'ready' ? snapshot.cursor : null;
    devices.setPermissions({
      microphone: !!accepted?.permissions.publishMic,
      camera: !!accepted?.permissions.publishCamera,
    });
    devices.updateContext(cursor);
    picker.updateContext(cursor && accepted ? { ...cursor, projection: accepted } : null);
    renderView();
  };
  const receive = async () => {
    if (!initialized) return;
    if (receiving) {
      rerun = true;
      return;
    }
    receiving = true;
    try {
      do {
        rerun = false;
        current();
        const snapshot = media.getSnapshot();
        if (!snapshot || !media.getCameraSnapshot().synchronized) break;
        for (const transport of transports.values()) {
          const descriptor = snapshot.payload.ownTransports.find(
            (item) => item.transportId === transport.id,
          );
          if (descriptor && !tracked.has(transport.id)) {
            if (media.trackOwnTransport(snapshot, descriptor, transport)) tracked.add(transport.id);
          }
        }
        const sources = snapshot.payload.sources.filter(
          (item) => item.ownerParticipantId !== identity.participantId,
        );
        for (const source of sources) {
          current();
          const key = `${source.sourceId}:${source.sourceGeneration}:${source.producerId}`;
          if (receivers.has(key) || receivers.size >= 64) continue;
          receivers.set(key, null);
          try {
            const recv = await ensureTransport('RECV');
            current();
            // Transport creation may trigger a newer snapshot; attach only against that accepted baseline.
            const latest = await waitForMain(
              () => (media.getCameraSnapshot().synchronized ? media.getSnapshot() : undefined),
              media.subscribeCameras,
              signal,
            );
            if (!latest.payload.sources.some((item) => item.producerId === source.producerId)) {
              receivers.delete(key);
              continue;
            }
            const currentSource = latest.payload.sources.find(
              (item) => item.producerId === source.producerId,
            )!;
            const consumer = await receiveMainSource({
              media,
              snapshot: latest,
              source: currentSource,
              transport: recv,
              rtpCapabilities: device.rtpCapabilities,
              command: (event, input) => mainCommand(socket, event, input, signal),
              signal,
            });
            current();
            receivers.set(key, consumer);
            consumer.observer.once('close', () => {
              receivers.delete(key);
            });
          } catch (error) {
            receivers.delete(key);
            if (!signal.aborted && !disposed) onError(error);
          }
        }
      } while (rerun);
    } finally {
      receiving = false;
    }
  };
  const changed = () => {
    if (!disposed && !signal.aborted) {
      if (projection.getSnapshot().status === 'closed') {
        onError(new MainCallError('FORBIDDEN'));
        return;
      }
      updateView();
      void receive().catch(() => {});
    }
  };
  const unsubscribeProjection = projection.subscribe(changed);
  const unsubscribeMedia = media.subscribeCameras(changed);
  const unsubscribePicker = picker.subscribe(() => {
    if (!disposed) renderView();
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    unsubscribeProjection();
    unsubscribeMedia();
    unsubscribePicker();
    unbindMedia();
    stopRefresh();
    devices.dispose();
    picker.dispose();
    for (const transport of transports.values()) transport.close();
    transports.clear();
    receivers.clear();
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    await waitForMain(
      () =>
        projection.getSnapshot().status === 'ready'
          ? (projection.getSnapshot().cursor ?? undefined)
          : undefined,
      projection.subscribe,
      signal,
    );
    await bootstrap.loadDevice(device);
    current();
    iceServers = await bootstrap.getIceServers();
    current();
    initialized = true;
    stopRefresh = bootstrap.maintainIceServers(() => [...transports.values()], onError);
    changed();
    return {
      devices,
      picker,
      dispose,
      async inspectAudio() {
        current();
        const transportStats = await Promise.all(
          [...transports].map(async ([direction, transport]) => ({
            direction,
            state: transport.connectionState,
            closed: transport.closed,
            audio: summarizeAudioStats(await transport.getStats()),
          })),
        );
        current();
        return {
          microphone: devices.getSnapshot().microphone.phase,
          synchronized: media.getCameraSnapshot().synchronized,
          remoteMicSources:
            media
              .getSnapshot()
              ?.payload.sources.filter(
                (source) =>
                  source.sourceKind === 'MIC' &&
                  source.ownerParticipantId !== identity.participantId,
              ).length ?? 0,
          audioConsumers: [...receivers.values()].filter(
            (consumer) => consumer?.kind === 'audio' && !consumer.closed,
          ).length,
          audioReceiverTracks: [...receivers.values()]
            .filter(
              (consumer): consumer is MediaTypes.Consumer =>
                !!consumer && consumer.kind === 'audio',
            )
            .map((consumer) => ({
              closed: consumer.closed,
              paused: consumer.paused,
              enabled: consumer.track.enabled,
              muted: consumer.track.muted,
              readyState: consumer.track.readyState,
              currentSource:
                media
                  .getSnapshot()
                  ?.payload.sources.some(
                    (source) =>
                      source.producerId === consumer.producerId && source.sourceKind === 'MIC',
                  ) ?? false,
              serverReady:
                media
                  .getSnapshot()
                  ?.payload.ownConsumers.find((binding) => binding.consumerId === consumer.id)
                  ?.ready ?? null,
              serverPaused:
                media
                  .getSnapshot()
                  ?.payload.ownConsumers.find((binding) => binding.consumerId === consumer.id)
                  ?.paused ?? null,
            })),
          transports: transportStats,
        };
      },
      async startDevices() {
        if (preferences.microphone.enabled) await devices.start('microphone');
        current();
        if (preferences.camera.enabled) await devices.start('camera');
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
