import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { workspaceDocumentIdSchema, accessRevisionSchema } from '@colearnia/contracts';

const cursorSchema = z.strictObject({
  workspaceId: workspaceDocumentIdSchema,
  userId: workspaceDocumentIdSchema,
  membershipId: workspaceDocumentIdSchema,
  incarnation: z.number().int().positive(),
  mode: z.enum(['content', 'manage']),
  order: accessRevisionSchema,
  id: workspaceDocumentIdSchema,
});
export type ChannelCursor = z.infer<typeof cursorSchema>;
export function createChannelListCursor(secret: string) {
  // Encrypt scanned positions so an empty page never exposes an inaccessible channel ID.
  const key = createHash('sha256').update('channel-list:').update(secret).digest();
  return {
    encode(value: ChannelCursor) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const body = Buffer.concat([
        cipher.update(JSON.stringify(cursorSchema.parse(value)), 'utf8'),
        cipher.final(),
      ]);
      return [nonce, body, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
    },
    decode(value: string, scope: Omit<ChannelCursor, 'order' | 'id'>) {
      const parts = value.split('.');
      if (parts.length !== 3) throw new Error('Invalid cursor');
      const [nonce, body, tag] = parts.map((part) => Buffer.from(part, 'base64url'));
      if (!nonce || nonce.length !== 12 || !body?.length || !tag || tag.length !== 16)
        throw new Error('Invalid cursor');
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      const decoded = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      const result = cursorSchema.parse(JSON.parse(decoded));
      if (
        Object.entries(scope).some(([key, value]) => result[key as keyof ChannelCursor] !== value)
      )
        throw new Error('Invalid cursor scope');
      return result;
    },
  };
}
