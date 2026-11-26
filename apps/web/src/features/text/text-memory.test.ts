import { expect, it } from 'vitest';
import { newTextIntent } from './text-intent';
import { createTextMemory, emptyConversation } from './text-memory';

it('retains drafts and original send identifiers per Workspace and channel', () => {
  const memory = createTextMemory();
  const intent = newTextIntent('Tin chờ xác nhận');
  memory.update('workspace-a:channel-a', () => ({ draft: 'Nháp A', outbox: [intent] }));
  memory.update('workspace-b:channel-b', () => ({ draft: 'Nháp B', outbox: [] }));
  memory.update('workspace-a:channel-a', (current) => ({
    ...current,
    outbox: current.outbox.map((row) => ({ ...row, status: 'failed' })),
  }));
  expect(memory.store.getState().get('workspace-a:channel-a')).toEqual({
    draft: 'Nháp A',
    outbox: [{ ...intent, status: 'failed' }],
  });
  expect(memory.store.getState().get('workspace-b:channel-b')?.draft).toBe('Nháp B');
});

it('withdraws only the revoked scope and keeps distinct login stores isolated', () => {
  const memory = createTextMemory();
  for (const key of ['workspace-a:channel-a', 'workspace-a:channel-b', 'workspace-b:channel-a'])
    memory.update(key, () => ({ ...emptyConversation, draft: key }));
  memory.forget('workspace-a', 'channel-a');
  expect([...memory.store.getState().keys()]).toEqual([
    'workspace-a:channel-b',
    'workspace-b:channel-a',
  ]);
  memory.forget('workspace-a');
  expect([...memory.store.getState().keys()]).toEqual(['workspace-b:channel-a']);
  expect(createTextMemory().store.getState().size).toBe(0);
});
