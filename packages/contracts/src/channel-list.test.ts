import { expect, it } from 'vitest';
import {
  channelListQuerySchema,
  channelListResponseSchema,
  managedChannelListResponseSchema,
} from './workspace.js';

const item = {
  id: '507f1f77bcf86cd799439011',
  workspaceId: '507f1f77bcf86cd799439012',
  name: 'Nghiên cứu',
  type: 'TEXT',
  accessMode: 'PRIVATE',
  revision: 0,
};
const response = (row: object) => ({
  requestId: '1c3b90f0-0c26-4e98-9a60-000000000001',
  data: { items: [row], nextCursor: null },
});
it('bounds pagination and rejects unrecognized query fields', () => {
  expect(channelListQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(channelListQuerySchema.parse({ limit: '50', after: 'signed.position' })).toEqual({
    limit: 50,
    after: 'signed.position',
  });
  for (const query of [
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { after: '' },
    { role: 'ADMIN' },
  ])
    expect(channelListQuerySchema.safeParse(query).success).toBe(false);
});
it('keeps management metadata strict and excludes content from both lists', () => {
  expect(channelListResponseSchema.safeParse(response(item)).success).toBe(true);
  expect(
    managedChannelListResponseSchema.safeParse(response({ ...item, canReadContent: false }))
      .success,
  ).toBe(true);
  expect(
    channelListResponseSchema.safeParse(response({ ...item, canReadContent: false })).success,
  ).toBe(false);
  for (const field of ['text', 'lastMessage', 'conversationId', 'files', 'participants']) {
    expect(
      managedChannelListResponseSchema.safeParse(
        response({
          ...item,
          canReadContent: false,
          [field]: 'private',
        }),
      ).success,
    ).toBe(false);
  }
});
