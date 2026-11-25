import { apiErrorSchema, sessionJoinTicketResponseSchema } from '@colearnia/contracts';
import type { Socket } from 'socket.io-client';
import { authApi } from '../../auth/session';

export class MainCallError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function mainCallMessage(error: unknown) {
  const code = error instanceof MainCallError ? error.code : '';
  if (code === 'AUTH_REQUIRED') return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (code === 'FORBIDDEN' || code === 'NOT_FOUND') return 'Bạn không còn quyền vào phòng này.';
  if (code === 'CALL_ALREADY_ACTIVE')
    return 'Kết nối trước chưa được giải phóng sau khi chờ. Nếu còn cuộc gọi ở cửa sổ khác, hãy rời ở đó; nếu vừa tải lại trang, hãy thử lại sau khi máy chủ hoàn tất dọn kết nối cũ.';
  if (code === 'SESSION_ENDED') return 'Phiên gọi đã kết thúc.';
  if (code === 'SESSION_END_PENDING')
    return 'Máy chủ đang xác nhận kết thúc phiên trước. Hãy thử tham gia lại sau.';
  if (code === 'CONFLICT') return 'Trạng thái phòng đã thay đổi. Hãy đồng bộ và thử lại.';
  return 'Chưa kết nối được cuộc gọi. Kiểm tra kết nối, cấu hình media/ICE phía máy chủ và thử lại.';
}

// Same operation identity on a lost ACK. No unbounded Socket.IO send buffer.
export async function mainCommand<T extends { requestId: string }>(
  socket: Socket,
  event: string,
  input: T,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!socket.connected) throw new MainCallError('DEPENDENCY_UNAVAILABLE');
    try {
      const value: unknown = await socket.timeout(5000).emitWithAck(event, input);
      signal.throwIfAborted();
      if (
        !value ||
        typeof value !== 'object' ||
        !('requestId' in value) ||
        value.requestId !== input.requestId
      )
        throw new MainCallError('CONFLICT');
      return value;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof MainCallError || attempt === 1) throw error;
    }
  }
  throw new MainCallError('DEPENDENCY_UNAVAILABLE');
}

export async function requestMainTicket(channelId: string, requestId: string, signal: AbortSignal) {
  const csrf = await authApi.csrf(signal);
  signal.throwIfAborted();
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/channels/${encodeURIComponent(channelId)}/live-session/join`,
    {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ requestId }),
    },
  );
  const raw: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(raw);
    throw new MainCallError(error.success ? error.data.error.code : 'DEPENDENCY_UNAVAILABLE');
  }
  return sessionJoinTicketResponseSchema.parse(raw).data;
}

export function waitForMain<T>(
  read: () => T | undefined,
  subscribe: (listener: () => void) => () => void,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const value = read();
  if (value !== undefined) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = (error?: unknown, result?: T) => {
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new MainCallError('DEPENDENCY_UNAVAILABLE')), 10000);
    unsubscribe = subscribe(() => {
      const next = read();
      if (next !== undefined) finish(undefined, next);
    });
    signal.addEventListener('abort', abort, { once: true });
    const next = read();
    if (next !== undefined) finish(undefined, next);
  });
}
