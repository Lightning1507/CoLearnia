import type { AuthenticatedContext, ChannelAccessSnapshot } from '@colearnia/contracts';
import type { ClientSession } from 'mongoose';

// Shared internal ports; SCRUM-27 supplies ResolveChannelAccess in access-service.ts.
// Not a network endpoint or a client-supplied permission assertion.
export type ResolveChannelAccess = (input: {
  identity: AuthenticatedContext;
  workspaceId: string;
  channelId: string;
}) => Promise<ChannelAccessSnapshot>;

// M1 supplies the active transaction on the shared Mongoose connection.
// M1 prepares IDs/time before the retryable callback and reuses them on retries.
// Matches GeneralConversationFactory<ClientSession>.create from SCRUM-14.
// M2 creates a CHANNEL conversation only for TEXT; LIVE uses session conversations later.
export type CreateChannelConversation = (input: {
  workspaceId: string;
  channelId: string;
  conversationId: string;
  createdAt: Date;
  dbSession: ClientSession;
}) => Promise<{ conversationId: string }>;
