import { expect, it } from 'vitest';
import { createChannelListCursor } from './channel-list-cursor.js';

const codec = createChannelListCursor('test-only-cursor-signing-secret');
const scope = {
  workspaceId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  membershipId: '507f1f77bcf86cd799439013',
  incarnation: 1,
  mode: 'content' as const,
};
it('round-trips a channel position and rejects tampering and changed scope', () => {
  const position = { ...scope, order: 7, id: '507f1f77bcf86cd799439014' };
  const encoded = codec.encode(position);
  expect(codec.decode(encoded, scope)).toEqual(position);
  for (const changed of [
    { ...scope, mode: 'manage' as const },
    { ...scope, incarnation: 2 },
    { ...scope, userId: '507f1f77bcf86cd799439015' },
  ])
    expect(() => codec.decode(encoded, changed)).toThrow();
  expect(() => codec.decode(encoded + 'x', scope)).toThrow();
  expect(() => codec.decode(encoded + '.extra', scope)).toThrow();
});
