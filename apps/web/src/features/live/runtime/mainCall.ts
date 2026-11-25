import { io, type Socket } from 'socket.io-client';
import {
  sessionJoinAckSchema,
  sessionEndAckSchema,
  sessionLeaveAckSchema,
  sessionEndedEventSchema,
} from '@colearnia/contracts';
import type { AuthenticatedData, SessionProjection } from '@colearnia/contracts';
import { authApi } from '../../auth/session';
import type { CallControllerOwner, CallIdentity, CallHandle } from './callController';
import type { LobbyDevicePreferences } from '../lobby/LobbyDeviceCheck';
import { createSessionProjectionInitializer } from './sessionProjectionSocket';
import { initializeMainMedia, type MainMediaView } from './mainMedia';
import {
  mainCommand,
  mainCallMessage,
  MainCallError,
  requestMainTicket,
  waitForMain,
} from './mainConnection';

export type MainCallTarget = { channelId: string; channelName: string; workspaceId: string };
type Resources = Awaited<ReturnType<typeof initializeMainMedia>>;
export type MainCallState = {
  phase: 'idle' | 'lobby' | 'joining' | 'active' | 'reconnecting' | 'leaving' | 'error';
  expanded: boolean;
  target?: MainCallTarget | undefined;
  message?: string | undefined;
  projection: SessionProjection | null;
  handle?: CallHandle | undefined;
  resources?: Resources | undefined;
  stream?: MediaStream | undefined;
  shareLabel?: string | undefined;
  cleanupPending?: boolean;
};
type Joined = { identity: CallIdentity; resumeTicket: string };

function waitForRetry(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  }).then(() => signal.throwIfAborted());
}

// Authenticated application lifetime, never a panel/route lifetime. The existing
// CallControllerOwner remains the sole owner of native media and AudioGraph.
export class MainCall {
  #state: MainCallState = { phase: 'idle', expanded: false, projection: null };
  #listeners = new Set<() => void>();
  #auth: AuthenticatedData | null = null;
  #socket: Socket | undefined;
  #attempt: AbortController | undefined;
  #joined: Joined | undefined;
  #resumeIntent: { requestId: string; identity: CallIdentity; resumeTicket: string } | undefined;
  #preferences?: LobbyDevicePreferences;
  #ticketIntent:
    { requestId: string; ticket?: Awaited<ReturnType<typeof requestMainTicket>> } | undefined;
  #joinId: string | undefined;
  #leaveIntent:
    | {
        event: 'session.end' | 'session.leave';
        input: {
          requestId: string;
          sessionId: string;
          epoch: string;
          callGeneration: number;
          expectedPolicyRevision: number;
          action?: 'HOST_LEAVE';
        };
      }
    | undefined;
  #retry?: ReturnType<typeof setTimeout>;
  #resumeFailures = 0;
  #resumeDeadline = 0;
  #leaving = false;
  #leaveAbort: AbortController | undefined;
  #terminalEnded = false;
  constructor(private readonly owner: CallControllerOwner) {}
  getSnapshot = () => this.#state;
  canResume = () => Boolean(this.#joined);
  inspectAudio = async () => ({
    phase: this.#state.phase,
    playback: this.owner.getAudioDiagnostics(),
    media: await this.#state.resources?.inspectAudio(),
  });
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #set(value: Partial<MainCallState>) {
    this.#state = { ...this.#state, ...value };
    for (const listener of this.#listeners) listener();
  }
  setAuth(auth: AuthenticatedData | null) {
    if (this.#auth?.user.id !== auth?.user.id || this.#auth?.expiresAt !== auth?.expiresAt)
      this.clear();
    this.#auth = auth;
  }
  open(target: MainCallTarget) {
    if (!this.#auth) return;
    if (this.#state.cleanupPending) return;
    if (this.#joined || this.#state.phase === 'joining') {
      this.expand(true);
      return;
    }
    this.#ticketIntent = undefined;
    this.#joinId = undefined;
    this.#set({ phase: 'lobby', target, expanded: true, message: undefined });
  }
  expand(expanded: boolean) {
    this.#set({ expanded });
  }
  cancel() {
    if (this.#joined) {
      void this.leave();
      return;
    }
    this.clear();
  }
  clear() {
    clearTimeout(this.#retry);
    this.#leaveAbort?.abort();
    this.#leaveAbort = undefined;
    this.#attempt?.abort();
    this.#attempt = undefined;
    if (this.#joined) this.owner.end(this.#joined.identity);
    this.#socket?.removeAllListeners();
    this.#socket?.disconnect();
    this.#socket = undefined;
    this.#joined = undefined;
    this.#resumeIntent = undefined;
    this.#projection = undefined;
    this.#leaving = false;
    this.#leaveIntent = undefined;
    this.#ticketIntent = undefined;
    this.#joinId = undefined;
    this.#terminalEnded = false;
    this.#set({
      phase: 'idle',
      expanded: false,
      projection: null,
      handle: undefined,
      resources: undefined,
      stream: undefined,
      shareLabel: undefined,
      cleanupPending: false,
      message: undefined,
    });
  }
  async join(preferences: LobbyDevicePreferences) {
    if (
      !this.#auth ||
      !this.#state.target ||
      this.#state.phase === 'joining' ||
      this.#state.cleanupPending ||
      this.#joined
    )
      return;
    this.#preferences = preferences;
    this.#attempt?.abort();
    const attempt = new AbortController();
    this.#attempt = attempt;
    const signal = attempt.signal;
    this.#set({ phase: 'joining', expanded: true, message: undefined });
    try {
      const csrf = await authApi.csrf(signal);
      signal.throwIfAborted();
      const socket = this.#socket?.connected ? this.#socket : await this.#connect(csrf, signal);
      let ownershipWaitDeadline: number | undefined;
      for (let retry = 0; ; retry++) {
        this.#ticketIntent ??= { requestId: crypto.randomUUID() };
        const intent = this.#ticketIntent;
        if (!intent.ticket)
          intent.ticket = await requestMainTicket(
            this.#state.target.channelId,
            intent.requestId,
            signal,
          );
        signal.throwIfAborted();
        this.#joinId ??= crypto.randomUUID();
        const joined = sessionJoinAckSchema.parse(
          await mainCommand(
            socket,
            'session.join',
            { requestId: this.#joinId, ticket: intent.ticket.ticket },
            signal,
          ),
        );
        if ('error' in joined) {
          if (joined.error.code !== 'CALL_ALREADY_ACTIVE')
            throw new MainCallError(joined.error.code);
          ownershipWaitDeadline ??= Date.now() + 35000;
          if (retry >= 7 || Date.now() >= ownershipWaitDeadline)
            throw new MainCallError('CALL_ALREADY_ACTIVE');
          this.#set({
            message:
              'Đang chờ kết nối trước được giải phóng để tham gia lại (tối đa khoảng 35 giây). Bạn có thể hủy; nếu còn cuộc gọi ở cửa sổ khác, hãy rời ở đó.',
          });
          // Explicit refusal means this ticket was not consumed. Obtain a fresh one
          // after waiting: the old room/epoch may end when its last ownership expires.
          this.#ticketIntent = undefined;
          this.#joinId = undefined;
          await waitForRetry(Math.min(5000, ownershipWaitDeadline - Date.now()), signal);
          continue;
        }
        // Obtain session/epoch from the matching HTTP ticket, not from client route state.
        await this.#activate(
          {
            sessionId: intent.ticket.sessionId,
            epoch: intent.ticket.epoch,
            participantId: joined.data.result.participantId,
            callGeneration: joined.data.result.callGeneration,
          },
          joined.data.result.resumeTicket,
          signal,
          preferences,
        );
        this.#leaveIntent = undefined;
        break;
      }
    } catch (error) {
      if (signal.aborted || this.#attempt !== attempt) return;
      if (this.#joined) {
        await this.leave();
        if (signal.aborted || this.#attempt !== attempt) return;
        this.#set({ message: mainCallMessage(error) });
      } else this.#set({ phase: 'error', message: mainCallMessage(error) });
    }
  }
  retryJoin() {
    if (this.#preferences) void this.join(this.#preferences);
  }
  async #connect(csrf: string, signal: AbortSignal) {
    signal.throwIfAborted();
    this.#socket?.removeAllListeners();
    this.#socket?.disconnect();
    const origin = new URL(import.meta.env.VITE_API_BASE_URL ?? '/api/v1', window.location.href)
      .origin;
    const socket = io(origin, {
      transports: ['websocket'],
      withCredentials: true,
      auth: { csrfToken: csrf },
      autoConnect: false,
      reconnection: false,
    });
    this.#socket = socket;
    await new Promise<void>((resolve, reject) => {
      const done = (error?: unknown) => {
        clearTimeout(timer);
        socket.off('connect', connected);
        socket.off('connect_error', failed);
        signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const connected = () => done();
      const failed = () => {
        socket.disconnect();
        done(new MainCallError('DEPENDENCY_UNAVAILABLE'));
      };
      const aborted = () => {
        socket.disconnect();
        done(signal.reason);
      };
      const timer = setTimeout(failed, 8000);
      socket.once('connect', connected);
      socket.once('connect_error', failed);
      signal.addEventListener('abort', aborted, { once: true });
      socket.connect();
    });
    signal.throwIfAborted();
    socket.on('session.ended', (raw: unknown) => {
      const result = sessionEndedEventSchema.safeParse(raw);
      const identity = this.#joined?.identity;
      if (!result.success || !identity || this.#socket !== socket) return;
      const packet = result.data;
      const cursor = this.#projection?.getSnapshot().cursor;
      if (
        packet.sessionId !== identity.sessionId ||
        packet.epoch !== identity.epoch ||
        packet.participantId !== identity.participantId ||
        packet.callGeneration !== identity.callGeneration ||
        (cursor &&
          (packet.audienceEpoch < cursor.audienceEpoch ||
            packet.projectionSequence < cursor.projectionSequence))
      )
        return;
      if (this.#leaving) {
        this.#terminalEnded = true;
        return;
      }
      this.clear();
      this.#set({ message: 'Phiên gọi đã kết thúc.' });
    });
    socket.on('disconnect', () => {
      if (this.#socket === socket && this.#joined && !this.#leaving) this.#disconnected();
    });
    return socket;
  }
  async #activate(
    identity: CallIdentity,
    resumeTicket: string,
    signal: AbortSignal,
    preferences?: LobbyDevicePreferences,
  ) {
    signal.throwIfAborted();
    const socket = this.#socket!;
    this.#joined = { identity, resumeTicket };
    let resources: Resources | undefined;
    let view: MainMediaView = { projection: null, stream: undefined, shareLabel: undefined };
    const handle = await this.owner.acquire(
      identity,
      createSessionProjectionInitializer({
        owner: this.owner,
        socket,
        onRuntime: (projection) => {
          this.#projection = projection;
        },
        initialize: async (acceptedIdentity, lifetime, media) => {
          if (!preferences) {
            const projection = this.#projection!;
            await waitForMain(
              () =>
                projection.getSnapshot().status === 'ready'
                  ? (projection.getSnapshot().cursor ?? undefined)
                  : undefined,
              projection.subscribe,
              AbortSignal.any([lifetime, signal]),
            );
            // The projection initializer owns cleanup in the absence of media.
            return () => {};
          }
          resources = await initializeMainMedia({
            identity: acceptedIdentity,
            socket,
            signal: AbortSignal.any([lifetime, signal]),
            media,
            projection: this.#projection!,
            preferences,
            onView: (next) => {
              view = next;
              if (this.#joined?.identity === identity && !signal.aborted) this.#set(next);
            },
            onError: (error) => {
              if (this.#joined?.identity === identity && !signal.aborted) {
                if (
                  this.#state.phase === 'active' &&
                  !this.#leaving &&
                  error instanceof MainCallError &&
                  error.code === 'FORBIDDEN'
                )
                  this.clear();
                this.#set({ message: mainCallMessage(error) });
              }
            },
          });
          // A provider may finish after cancellation. Never hand its resources to
          // the owner or publish active/capture after the departure intent began.
          if (signal.aborted || this.#leaving || this.#joined?.identity !== identity) {
            resources.dispose();
            throw new DOMException('Activation cancelled', 'AbortError');
          }
          return resources.dispose;
        },
      }),
    );
    signal.throwIfAborted();
    if (this.#joined?.identity !== identity) throw new DOMException('Superseded', 'AbortError');
    this.#resumeFailures = 0;
    if (preferences) this.#set({ phase: 'active', handle, resources, ...view, message: undefined });
    void resources?.startDevices().catch((error: unknown) => {
      if (!signal.aborted && this.#joined?.identity === identity)
        this.#set({ message: mainCallMessage(error) });
    });
  }
  #projection: import('./sessionProjectionRuntime').SessionProjectionRuntime | undefined;
  #disconnected() {
    if (!this.#joined) return;
    this.owner.end(this.#joined.identity);
    this.#attempt?.abort();
    this.#set({
      phase: 'reconnecting',
      resources: undefined,
      handle: undefined,
      stream: undefined,
      projection: null,
      message: 'Mất kết nối. Đang thử nối lại; mic và camera đã tắt.',
    });
    if (!this.#resumeFailures) this.#resumeDeadline = Date.now() + 25000;
    this.#scheduleResume();
  }
  #scheduleResume() {
    if (this.#resumeFailures >= 4 || Date.now() >= this.#resumeDeadline) {
      this.#set({
        phase: 'error',
        message: 'Chưa nối lại được. Bạn có thể thử kết nối lại hoặc đóng cuộc gọi.',
      });
      return;
    }
    this.#retry = setTimeout(
      () => {
        void this.resume();
      },
      500 * 2 ** this.#resumeFailures++,
    );
  }
  async resume() {
    const previous = this.#joined;
    if (!previous || !this.#auth || this.#leaving) return;
    const departing = this.#state.cleanupPending;
    clearTimeout(this.#retry);
    this.#attempt?.abort();
    const attempt = new AbortController();
    this.#attempt = attempt;
    const signal = attempt.signal;
    try {
      this.#set({
        phase: 'reconnecting',
        ...(departing && { message: 'Đang kết nối lại để xác nhận rời cuộc gọi…' }),
      });
      this.owner.end(previous.identity);
      const socket = await this.#connect(await authApi.csrf(signal), signal);
      const intent = (this.#resumeIntent ??= {
        requestId: crypto.randomUUID(),
        identity: previous.identity,
        resumeTicket: previous.resumeTicket,
      });
      const input = {
        requestId: intent.requestId,
        ...intent.identity,
        resumeTicket: intent.resumeTicket,
      };
      const { participantId: _participantId, ...command } = input;
      void _participantId;
      const ack = sessionJoinAckSchema.parse(
        await mainCommand(socket, 'session.resume', command, signal),
      );
      if ('error' in ack) throw new MainCallError(ack.error.code);
      this.#resumeIntent = undefined;
      this.#leaveIntent = undefined;
      await this.#activate(
        { ...previous.identity, callGeneration: ack.data.result.callGeneration },
        ack.data.result.resumeTicket,
        signal,
        departing
          ? undefined
          : {
              microphone: {
                deviceId: this.#preferences?.microphone.deviceId ?? '',
                enabled: false,
              },
              camera: { deviceId: this.#preferences?.camera.deviceId ?? '', enabled: false },
            },
      );
      if (departing) {
        await this.leave();
        return;
      }
      this.#set({
        cleanupPending: false,
        message: 'Đã nối lại. Mic và camera vẫn tắt; bạn có thể bật khi sẵn sàng.',
      });
    } catch (error) {
      if (signal.aborted) return;
      if (
        error instanceof MainCallError &&
        ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_ENDED', 'CONFLICT'].includes(
          error.code,
        )
      ) {
        this.clear();
        this.#set({ message: mainCallMessage(error) });
      } else {
        this.#set({ message: mainCallMessage(error) });
        this.#scheduleResume();
      }
    }
  }
  async retryDeparture() {
    if (this.#state.phase !== 'error' || !this.#state.cleanupPending) return;
    if (this.#socket?.connected) await this.leave();
    else await this.resume();
  }
  async leave() {
    if (!this.#joined || !this.#socket || this.#leaving) return;
    const ownership = this.#joined;
    // Cancel bootstrap/capture immediately without aborting the independent
    // departure command or discarding its server ownership/replay identity.
    this.#attempt?.abort();
    this.#state.resources?.dispose();
    try {
      this.#leaveIntent ??= (() => {
        const { identity } = this.#joined!;
        const projection = this.#projection?.getSnapshot().projection ?? this.#state.projection;
        if (!projection) throw new MainCallError('CONFLICT');
        const host = projection.viewer.role === 'HOST';
        return {
          event: host ? ('session.end' as const) : ('session.leave' as const),
          input: {
            requestId: crypto.randomUUID(),
            sessionId: identity.sessionId,
            epoch: identity.epoch,
            callGeneration: identity.callGeneration,
            expectedPolicyRevision: projection.policyRevision,
            ...(host ? { action: 'HOST_LEAVE' as const } : {}),
          },
        };
      })();
    } catch {
      this.#set({
        phase: 'error',
        cleanupPending: true,
        message: 'Chưa xác nhận được trạng thái phiên để rời an toàn. Hãy kết nối lại rồi thử rời.',
      });
      return;
    }
    const intent = this.#leaveIntent;
    this.#leaving = true;
    const leaveAbort = new AbortController();
    this.#leaveAbort = leaveAbort;
    clearTimeout(this.#retry);
    this.#set({
      phase: 'leaving',
      expanded: false,
      resources: undefined,
      handle: undefined,
      stream: undefined,
      cleanupPending: true,
      message: 'Đang xác nhận dọn tài nguyên trên máy chủ…',
    });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ack = (
          intent.event === 'session.end' ? sessionEndAckSchema : sessionLeaveAckSchema
        ).parse(await mainCommand(this.#socket, intent.event, intent.input, leaveAbort.signal));
        if (this.#joined !== ownership) return;
        if ('error' in ack) throw new MainCallError(ack.error.code);
        if (
          ack.data.result.sessionId !== intent.input.sessionId ||
          ack.data.result.epoch !== intent.input.epoch
        )
          throw new MainCallError('DEPENDENCY_UNAVAILABLE');
        if (
          ack.data.status === 'completed' &&
          (!('left' in ack.data.result) || ack.data.result.left)
        ) {
          // Completed confirms authority/pending revocation. Per session-end.md,
          // adapter byte/ref finalization may still report cleanupPending=true.
          // Only a pending operation requires another departure confirmation.
          this.clear();
          return;
        }
        if (this.#terminalEnded) {
          this.clear();
          return;
        }
        if (attempt === 2) throw new MainCallError('DEPENDENCY_UNAVAILABLE');
        this.#set({ message: 'Máy chủ đang dọn tài nguyên. Đang tự xác nhận lại…' });
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            leaveAbort.signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, 500 * (attempt + 1));
          leaveAbort.signal.addEventListener('abort', done, { once: true });
          if (leaveAbort.signal.aborted) done();
        });
        leaveAbort.signal.throwIfAborted();
      }
    } catch (error) {
      if (this.#joined !== ownership) return;
      if (this.#terminalEnded) this.clear();
      else if (
        error instanceof MainCallError &&
        error.code === 'CONFLICT' &&
        this.#projection &&
        this.#projection.getSnapshot().status !== 'closed'
      ) {
        this.#leaveIntent = undefined;
        this.#projection!.resync();
        try {
          await waitForMain(
            () =>
              this.#projection?.getSnapshot().status === 'ready'
                ? (this.#projection.getSnapshot().cursor ?? undefined)
                : undefined,
            this.#projection!.subscribe,
            leaveAbort.signal,
          );
        } catch {
          /* Remain pending; a later explicit retry can reconcile. */
        }
        if (this.#joined !== ownership) return;
        this.#set({
          phase: 'error',
          cleanupPending: true,
          message: 'Trạng thái phòng đã thay đổi. Thiết bị đã tắt; hãy thử xác nhận rời lại.',
        });
      } else
        this.#set({
          phase: 'error',
          cleanupPending: true,
          message:
            'Thiết bị đã tắt. Chưa xác nhận dọn tài nguyên trên máy chủ; hãy thử lại cùng yêu cầu.',
        });
    } finally {
      if (this.#leaveAbort === leaveAbort) this.#leaveAbort = undefined;
      if (this.#joined === ownership) this.#leaving = false;
    }
  }
}
