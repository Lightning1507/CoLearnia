export type DeviceKind = 'camera' | 'microphone';
export type PreviewStatus =
  'off' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'busy' | 'error';

export type DeviceOption = { id: string; label: string };
export type DeviceState = {
  selectedId: string;
  openedId: string | null;
  status: PreviewStatus;
  message: string;
  devices: readonly DeviceOption[];
};
export type LobbyPreviewState = {
  camera: DeviceState;
  microphone: DeviceState;
  videoStream: MediaStream | null;
  enumerating: boolean;
  enumerationError: string | null;
  environmentError: string | null;
};

type BrowserEnvironment = {
  secure: boolean;
  mediaDevices?:
    | Pick<
        MediaDevices,
        'getUserMedia' | 'enumerateDevices' | 'addEventListener' | 'removeEventListener'
      >
    | undefined;
  permissions?: Pick<Permissions, 'query'> | undefined;
};

function initialDevice(): DeviceState {
  return {
    selectedId: '',
    openedId: null,
    status: 'off',
    message: 'Chưa mở thiết bị. Bấm Bật để kiểm tra và cấp quyền.',
    devices: [],
  };
}

function describeError(error: unknown): Pick<DeviceState, 'status' | 'message'> {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message: 'Chưa có quyền truy cập. Kiểm tra quyền của trang trong trình duyệt rồi thử lại.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        status: 'unavailable',
        message: 'Không tìm thấy thiết bị đã chọn. Hãy kiểm tra kết nối hoặc chọn thiết bị khác.',
      };
    case 'NotReadableError':
      return {
        status: 'busy',
        message: 'Không mở được thiết bị. Hãy kiểm tra kết nối và ứng dụng khác đang sử dụng.',
      };
    case 'AbortError':
      return { status: 'error', message: 'Việc mở thiết bị bị gián đoạn. Bạn có thể thử lại.' };
    default:
      return { status: 'error', message: 'Không thể mở thiết bị. Hãy kiểm tra và thử lại.' };
  }
}

/** Owns only streams acquired here. Never receives or stops an active call's tracks. */
export class LobbyPreview {
  private state: LobbyPreviewState = {
    camera: initialDevice(),
    microphone: initialDevice(),
    videoStream: null,
    enumerating: false,
    enumerationError: null,
    environmentError: null,
  };
  private listeners = new Set<() => void>();
  private active = false;
  private lifetime = 0;
  private enumeration = 0;
  private generation = { camera: 0, microphone: 0 };
  private owned: Partial<Record<DeviceKind, { stream: MediaStream; cleanup: () => void }>> = {};
  private permissionCleanup: (() => void)[] = [];

  constructor(private readonly browser: BrowserEnvironment) {}

  getSnapshot = (): LobbyPreviewState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<LobbyPreviewState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private update(
    kind: DeviceKind,
    patch: Partial<DeviceState>,
    videoStream = this.state.videoStream,
  ) {
    this.publish({
      [kind]: { ...this.state[kind], ...patch },
      videoStream: kind === 'camera' ? videoStream : this.state.videoStream,
    });
  }

  start = () => {
    if (this.active) return;
    this.active = true;
    this.lifetime++;
    const environmentError = !this.browser.secure
      ? 'Trang cần HTTPS hoặc localhost để truy cập camera và microphone.'
      : !this.browser.mediaDevices?.getUserMedia || !this.browser.mediaDevices.enumerateDevices
        ? 'Trình duyệt không hỗ trợ truy cập camera và microphone.'
        : null;
    this.publish({ environmentError });
    if (environmentError) return;
    this.browser.mediaDevices?.addEventListener('devicechange', this.onDeviceChange);
    void this.refreshDevices();
    for (const kind of ['camera', 'microphone'] as const) void this.watchPermission(kind);
  };

  private onDeviceChange = () => {
    void this.refreshDevices();
  };

  refreshDevices = async () => {
    if (!this.active || this.state.environmentError || !this.browser.mediaDevices) return;
    const request = ++this.enumeration;
    this.publish({ enumerating: true, enumerationError: null });
    try {
      const devices = await this.browser.mediaDevices.enumerateDevices();
      if (!this.active || request !== this.enumeration) return;
      for (const kind of ['camera', 'microphone'] as const) {
        const inputs = devices.filter(
          (d) => d.kind === (kind === 'camera' ? 'videoinput' : 'audioinput'),
        );
        const options = inputs
          .filter((d) => d.deviceId)
          .map((d, index) => ({
            id: d.deviceId,
            label: d.label || `${kind === 'camera' ? 'Camera' : 'Microphone'} ${index + 1}`,
          }));
        const current = this.state[kind];
        // Empty IDs before permission are not selectable identities.
        const selectedMissing =
          current.selectedId && !inputs.some((d) => d.deviceId === current.selectedId);
        const openedMissing =
          current.openedId && !inputs.some((d) => d.deviceId === current.openedId);
        const replacementPending = current.status === 'requesting' && inputs.length > 0;
        if (current.status === 'denied') {
          this.update(kind, {
            devices: options,
            selectedId: selectedMissing ? '' : current.selectedId,
          });
        } else if (selectedMissing || (openedMissing && !replacementPending)) {
          this.reset(kind, {
            devices: options,
            selectedId: '',
            status: 'unavailable',
            message: 'Thiết bị đã chọn không còn khả dụng. Hãy chọn lại thiết bị rồi bấm Bật.',
          });
        } else if (openedMissing) {
          // Losing A must not invalidate the generation acquiring the still-available B.
          this.releaseOwned(kind);
          this.update(kind, { devices: options, openedId: null }, null);
        } else {
          this.update(kind, { devices: options });
        }
      }
      this.publish({ enumerating: false });
    } catch {
      if (!this.active || request !== this.enumeration) return;
      this.publish({
        enumerating: false,
        enumerationError:
          'Không thể đọc danh sách thiết bị. Bạn có thể thử làm mới hoặc bật thiết bị mặc định.',
      });
    }
  };

  private async watchPermission(kind: DeviceKind) {
    const lifetime = this.lifetime;
    try {
      const permission = await this.browser.permissions?.query({ name: kind as PermissionName });
      if (!permission || !this.active || lifetime !== this.lifetime) return;
      let previousState = permission.state;
      const changed = () => {
        if (!this.active || lifetime !== this.lifetime) return;
        const hadPermission = previousState === 'granted';
        previousState = permission.state;
        if (permission.state === 'denied') {
          this.reset(kind, describeError(new DOMException('', 'NotAllowedError')));
        } else if (permission.state === 'prompt' && hadPermission) {
          this.reset(kind, {
            selectedId: '',
            status: 'off',
            message: 'Quyền thiết bị đã được đặt lại. Bấm Bật để cấp quyền lại.',
          });
        } else if (this.state[kind].status === 'denied') {
          this.update(kind, {
            status: 'off',
            message: 'Quyền thiết bị đã thay đổi. Bấm Bật để kiểm tra lại.',
          });
        }
        void this.refreshDevices();
      };
      permission.addEventListener('change', changed);
      this.permissionCleanup.push(() => permission.removeEventListener('change', changed));
      changed();
    } catch {
      // Permissions.query(camera/microphone) is optional; acquisition/ended remain authoritative.
    }
  }

  select = (kind: DeviceKind, id: string) => {
    if (!this.active || (id && !this.state[kind].devices.some((d) => d.id === id))) return;
    const reopen = ['ready', 'requesting'].includes(this.state[kind].status);
    if (!reopen) this.stop(kind);
    this.update(kind, { selectedId: id });
    if (reopen) void this.open(kind);
  };

  open = async (kind: DeviceKind) => {
    if (!this.active || this.state.environmentError || !this.browser.mediaDevices) return;
    const request = ++this.generation[kind];
    const selectedId = this.state[kind].selectedId;
    this.update(kind, {
      status: 'requesting',
      message: 'Đang mở thiết bị… Nếu được hỏi, hãy chọn quyền trong trình duyệt.',
    });
    try {
      const constraint = selectedId ? { deviceId: { exact: selectedId } } : true;
      const stream = await this.browser.mediaDevices.getUserMedia(
        kind === 'camera'
          ? { video: constraint, audio: false }
          : { audio: constraint, video: false },
      );
      if (!this.active || request !== this.generation[kind]) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = (kind === 'camera' ? stream.getVideoTracks() : stream.getAudioTracks())[0];
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach((item) => item.stop());
        throw new DOMException('', 'NotReadableError');
      }
      const ended = () => {
        if (!this.active || this.owned[kind]?.stream !== stream) return;
        if (request !== this.generation[kind]) {
          this.releaseOwned(kind);
          this.update(kind, { openedId: null }, null);
          return;
        }
        this.reset(kind, {
          status: 'unavailable',
          message: 'Thiết bị đã ngừng hoạt động. Kiểm tra kết nối và quyền rồi thử lại.',
        });
        void this.refreshDevices();
      };
      this.releaseOwned(kind);
      track.addEventListener('ended', ended);
      this.owned[kind] = { stream, cleanup: () => track.removeEventListener('ended', ended) };
      this.update(
        kind,
        {
          openedId: track.getSettings().deviceId || null,
          status: 'ready',
          message:
            kind === 'camera'
              ? 'Camera đang bật · chỉ xem trước trên máy này.'
              : 'Microphone đã mở · không phát ra loa hoặc gửi lên phiên.',
        },
        stream,
      );
      void this.refreshDevices();
    } catch (error) {
      if (this.active && request === this.generation[kind]) {
        this.reset(kind, describeError(error));
      }
    }
  };

  private releaseOwned(kind: DeviceKind) {
    const owned = this.owned[kind];
    if (owned) {
      owned.cleanup();
      owned.stream.getTracks().forEach((track) => track.stop());
      delete this.owned[kind];
    }
  }

  private reset(kind: DeviceKind, patch: Partial<DeviceState>) {
    this.generation[kind]++;
    this.releaseOwned(kind);
    this.update(kind, { ...patch, openedId: null }, null);
  }

  stop = (kind: DeviceKind) => {
    if (this.active) this.reset(kind, { status: 'off', message: 'Thiết bị đang tắt.' });
  };

  dispose = () => {
    if (!this.active) return false;
    this.active = false;
    this.lifetime++;
    this.enumeration++;
    this.browser.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
    this.permissionCleanup.splice(0).forEach((cleanup) => cleanup());
    for (const kind of ['camera', 'microphone'] as const) {
      this.generation[kind]++;
      this.releaseOwned(kind);
    }
    this.publish({
      camera: initialDevice(),
      microphone: initialDevice(),
      videoStream: null,
      enumerating: false,
      enumerationError: null,
    });
    return true;
  };
}
