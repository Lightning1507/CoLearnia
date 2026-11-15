import { expect, it, vi } from 'vitest';
import type { MediaHttpContextIssueInput, SessionProjectionCursor } from '@colearnia/contracts';
import { MediaBootstrapApiError } from '../api/mediaBootstrapApi';
import { bindMediaBootstrapSocket, createMediaBootstrapRuntime } from './mediaBootstrap';

const identity = { sessionId: '1'.repeat(24), epoch: crypto.randomUUID(), callGeneration: 1 };
const iceServers = [{ urls: 'turns:relay.invalid:443', username: 'fixture', credential: 'test' }];
const response = {
  requestId: crypto.randomUUID(),
  data: {
    ...identity,
    iceServers,
    serverTime: '2026-11-15T10:00:00.000Z',
    expiresAt: '2026-11-15T14:00:00.000Z',
  },
};

function fixture(now?: () => number) {
  const context: SessionProjectionCursor & { socketId: string } = {
    ...identity,
    socketId: 'a',
    participantId: '2'.repeat(24),
    projectionSequence: 1,
    audienceEpoch: 1,
    policyRevision: 1,
    scope: { type: 'MAIN' },
  };
  const abort = new AbortController();
  const api = vi.fn<NonNullable<Parameters<typeof createMediaBootstrapRuntime>[0]['api']>>();
  const getCsrfToken = vi.fn(() => 'csrf-fixture');
  let proofsIssued = 0;
  const issue = vi.fn<(input: MediaHttpContextIssueInput) => Promise<unknown>>(async (input) => ({
    requestId: input.requestId,
    data: {
      status: 'completed',
      result: {
        token: (++proofsIssued === 1 ? 'A' : 'E').repeat(43),
        expiresAt: '2026-11-15T10:01:00.000Z',
      },
    },
  }));
  const runtime = createMediaBootstrapRuntime({
    getContext: () => context,
    getCsrfToken,
    issue,
    api,
    signal: abort.signal,
    ...(now ? { now } : {}),
  });
  return { runtime, issue, api, context, abort, getCsrfToken };
}

it('refreshes a rejected proof once with the same ICE intent and shares the in-flight request', async () => {
  const f = fixture();
  f.api
    .mockRejectedValueOnce(new MediaBootstrapApiError('FORBIDDEN'))
    .mockResolvedValueOnce(response);
  await expect(
    Promise.all([f.runtime.getIceServers(), f.runtime.getIceServers()]),
  ).resolves.toEqual([iceServers, iceServers]);
  expect(f.issue).toHaveBeenCalledTimes(2);
  expect(f.api).toHaveBeenCalledTimes(2);
  const [first, retry] = f.api.mock.calls;
  expect(first?.[2]).not.toBe(retry?.[2]);
  expect(first?.[4]).toEqual(retry?.[4]);
  expect(retry?.[4]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-fixture' });
  await expect(f.runtime.getIceServers()).resolves.toEqual(iceServers);
  expect(f.api).toHaveBeenCalledTimes(2);
});

it('discards ICE after the socket binding changes and leaves the transport untouched', async () => {
  const f = fixture();
  const transport = { closed: false, updateIceServers: vi.fn(async () => {}) };
  f.api.mockImplementationOnce(async () => {
    f.context.socketId = 'b';
    return response;
  });
  await expect(f.runtime.refreshTransports([transport])).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(transport.updateIceServers).not.toHaveBeenCalled();
});

it('replays the same ICE body after a lost response, and starts a new intent after a rejected replay', async () => {
  const f = fixture();
  f.api
    .mockRejectedValueOnce(new DOMException('Response lost', 'TimeoutError'))
    .mockRejectedValueOnce(new MediaBootstrapApiError('CONFLICT'))
    .mockResolvedValueOnce(response);

  await expect(f.runtime.getIceServers()).rejects.toMatchObject({ name: 'TimeoutError' });
  await expect(f.runtime.getIceServers()).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.runtime.getIceServers()).resolves.toEqual(iceServers);
  const bodies = f.api.mock.calls.map((call) => call[4]?.body);
  expect(bodies[1]).toBe(bodies[0]);
  expect(bodies[2]).not.toBe(bodies[0]);
});

it('retries a temporary scheduled refresh failure and cancels the next attempt when the call ends', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(Date.now);
    const shortResponse = {
      ...response,
      data: { ...response.data, expiresAt: '2026-11-15T11:00:00.001Z' },
    };
    f.api
      .mockResolvedValueOnce(shortResponse)
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(shortResponse)
      .mockRejectedValueOnce(new MediaBootstrapApiError('DEPENDENCY_UNAVAILABLE'));
    const transport = { closed: false, updateIceServers: vi.fn(async () => {}) };
    const onError = vi.fn();
    f.runtime.maintainIceServers(() => [transport], onError);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.api).toHaveBeenCalledTimes(3);
    expect(f.api.mock.calls[2]?.[4]?.body).toBe(f.api.mock.calls[1]?.[4]?.body);
    expect(transport.updateIceServers).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(f.api).toHaveBeenCalledTimes(4);
    f.abort.abort();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.api).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps refreshing for the same binding after a policy revision changes', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(Date.now);
    const shortResponse = {
      ...response,
      data: { ...response.data, expiresAt: '2026-11-15T11:01:00.000Z' },
    };
    f.api.mockResolvedValue(shortResponse);
    const transport = { closed: false, updateIceServers: vi.fn(async () => {}) };
    const onError = vi.fn();
    f.runtime.maintainIceServers(() => [transport], onError);
    await vi.advanceTimersByTimeAsync(0);

    f.context.policyRevision++;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.api).toHaveBeenCalledTimes(2);
    expect(transport.updateIceServers).toHaveBeenCalledTimes(2);
    expect(f.issue.mock.calls.map(([input]) => input.expectedPolicyRevision)).toEqual([1, 2]);
    expect(onError).not.toHaveBeenCalled();

    f.context.audienceEpoch++;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.api).toHaveBeenCalledTimes(2);
    expect(transport.updateIceServers).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('retries proof once when the server rejects a policy revision that advanced in flight', async () => {
  const f = fixture();
  f.issue.mockImplementationOnce(async ({ requestId }) => {
    f.context.policyRevision++;
    return { requestId, error: { code: 'CONFLICT', message: 'Revision changed' } };
  });
  f.api.mockResolvedValueOnce(response);
  await expect(f.runtime.getIceServers()).resolves.toEqual(iceServers);
  expect(f.issue.mock.calls.map(([input]) => input.expectedPolicyRevision)).toEqual([1, 2]);
  expect(f.api).toHaveBeenCalledTimes(1);
});

it('continues scheduled refresh when a conflict ACK arrives before the new projection', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(Date.now);
    f.api
      .mockResolvedValueOnce({
        ...response,
        data: { ...response.data, expiresAt: '2026-11-15T11:01:00.000Z' },
      })
      .mockResolvedValueOnce(response);
    const transport = { closed: false, updateIceServers: vi.fn(async () => {}) };
    const stop = f.runtime.maintainIceServers(() => [transport], vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    f.issue.mockImplementationOnce(async ({ requestId }) => ({
      requestId,
      error: { code: 'CONFLICT', message: 'Policy changed' },
    }));
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.issue).toHaveBeenCalledTimes(2);
    f.context.policyRevision++;
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.issue.mock.calls.map(([input]) => input.expectedPolicyRevision)).toEqual([1, 1, 2]);
    expect(transport.updateIceServers).toHaveBeenCalledTimes(2);
    stop();
  } finally {
    vi.useRealTimers();
  }
});

it('continues updating live transports when another transport closes during its queued update', async () => {
  const f = fixture();
  f.api.mockResolvedValueOnce(response);
  const closing = {
    closed: false,
    async updateIceServers() {
      this.closed = true;
      throw new Error('AwaitQueue stopped');
    },
  };
  const active = { closed: false, updateIceServers: vi.fn(async () => {}) };
  await expect(f.runtime.refreshTransports([closing, active])).resolves.toBeUndefined();
  expect(active.updateIceServers).toHaveBeenCalledTimes(1);
});

it('retries POST with fresh CSRF and the same ICE body when the cookie rotates in another tab', async () => {
  const f = fixture();
  f.getCsrfToken.mockReturnValueOnce('csrf-original').mockReturnValueOnce('csrf-new');
  f.api
    .mockRejectedValueOnce(new MediaBootstrapApiError('CSRF_INVALID'))
    .mockResolvedValueOnce(response);
  await expect(f.runtime.getIceServers()).resolves.toEqual(iceServers);
  expect(f.api.mock.calls[1]?.[4]?.body).toBe(f.api.mock.calls[0]?.[4]?.body);
  expect(f.api.mock.calls[1]?.[4]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-new' });
});

it('retries scheduled refresh after a Socket.IO proof ACK timeout', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const emitWithAck = vi
      .fn(async (_event: string, input: MediaHttpContextIssueInput) => ({
        requestId: input.requestId,
        data: {
          status: 'completed',
          result: { token: 'A'.repeat(43), expiresAt: '2026-11-15T10:01:00.000Z' },
        },
      }))
      .mockRejectedValueOnce(new Error('operation has timed out'));
    const socket = {
      connected: true,
      id: 'a',
      volatile: { timeout: () => ({ emitWithAck }) },
    } as unknown as Parameters<typeof bindMediaBootstrapSocket>[0];
    const runtime = bindMediaBootstrapSocket(socket, () => f.context, {
      api: f.api.mockResolvedValue(response),
      getCsrfToken: () => 'csrf',
      signal: f.abort.signal,
      now: Date.now,
    });
    const transport = { closed: false, updateIceServers: vi.fn(async () => {}) };
    const stop = runtime.maintainIceServers(() => [transport], vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.updateIceServers).toHaveBeenCalledTimes(1);
    stop();
  } finally {
    vi.useRealTimers();
  }
});
