import { afterEach, expect, it, vi } from 'vitest';
import { createTextFixture } from './text-fixture';
import { mergeTextMessage, newTextIntent } from './text-intent';

afterEach(() => vi.useRealTimers());
const channelId = '100000000000000000000004';
const senderId = '100000000000000000000002';

it('creates a new identity when editing an intent without changing the failed payload', () => {
  const failed = newTextIntent('  Nội dung ban đầu  ');
  const original = structuredClone(failed.payload);
  const edited = newTextIntent('Nội dung sửa');
  expect(edited.payload.clientMessageId).not.toBe(failed.payload.clientMessageId);
  expect(failed.payload).toEqual(original);
  expect(failed.payload.text).toBe('  Nội dung ban đầu  ');
  expect(() => newTextIntent('   ')).toThrow();
  expect(() => newTextIntent('a'.repeat(4001))).toThrow();
});

it('retries a lost ACK with the same payload and merges one committed message', async () => {
  vi.useFakeTimers();
  const fixture = createTextFixture(channelId, senderId);
  fixture.setMode('lost-ack');
  const port = fixture.port('messages');
  const intent = newTextIntent('Một tin duy nhất');
  const signal = new AbortController().signal;
  const first = expect(port.send(intent.payload, signal)).rejects.toThrow('ACK lost');
  await vi.runAllTimersAsync();
  await first;
  const beforeRetry = fixture.port('messages').history(signal);
  await vi.runAllTimersAsync();
  expect(
    (await beforeRetry).filter((row) => row.clientMessageId === intent.payload.clientMessageId),
  ).toHaveLength(1);
  const retry = port.send(intent.payload, signal);
  await vi.runAllTimersAsync();
  const message = await retry;
  const afterRetry = fixture.port('messages').history(signal);
  await vi.runAllTimersAsync();
  expect(
    (await afterRetry).filter((row) => row.clientMessageId === intent.payload.clientMessageId),
  ).toEqual([message]);
  expect(message.clientMessageId).toBe(intent.payload.clientMessageId);
  expect(mergeTextMessage([message], message)).toEqual([message]);
  const conflict = expect(port.send({ ...intent.payload, text: 'Khác' }, signal)).rejects.toThrow(
    'CONFLICT',
  );
  await vi.runAllTimersAsync();
  await conflict;
});

it('supports empty and failed history and discards an aborted request', async () => {
  vi.useFakeTimers();
  const fixture = createTextFixture(channelId, senderId);
  const controller = new AbortController();
  const aborted = expect(fixture.port('messages').history(controller.signal)).rejects.toThrow();
  controller.abort();
  await aborted;
  const empty = fixture.port('empty').history(new AbortController().signal);
  await vi.runAllTimersAsync();
  expect(await empty).toEqual([]);
  const failure = expect(
    fixture.port('error').history(new AbortController().signal),
  ).rejects.toThrow();
  await vi.runAllTimersAsync();
  await failure;
});

it('retains a successful send when reopening history after a load error', async () => {
  vi.useFakeTimers();
  const fixture = createTextFixture(channelId, senderId);
  const signal = new AbortController().signal;
  const intent = newTextIntent('Tin đã lưu');
  const sending = fixture.port('messages').send(intent.payload, signal);
  await vi.runAllTimersAsync();
  const message = await sending;
  const error = expect(fixture.port('error').history(signal)).rejects.toThrow();
  await vi.runAllTimersAsync();
  await error;
  const history = fixture.port('messages').history(signal);
  await vi.runAllTimersAsync();
  expect(
    (await history).filter((row) => row.clientMessageId === intent.payload.clientMessageId),
  ).toEqual([message]);
  const empty = fixture.port('empty').history(signal);
  await vi.runAllTimersAsync();
  expect(await empty).toEqual([]);
});
