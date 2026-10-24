import { systemStatusSchema } from '@colearnia/contracts';
import type { SystemStatus } from '@colearnia/contracts';

export async function getSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  const response = await fetch(`${base}/system/status`, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('Không kết nối được máy chủ.');
  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null || !('data' in result)) {
    throw new Error('Phản hồi máy chủ không hợp lệ.');
  }
  return systemStatusSchema.parse(result.data);
}
