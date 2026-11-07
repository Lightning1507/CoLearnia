import type {
  AuthenticatedContext,
  ChannelAccessSnapshot,
  ChannelType,
} from '@colearnia/contracts';
import type { ClientSession } from 'mongoose';

// Internal function signatures for consumer review; no implementation or network endpoint.
export type ResolveChannelAccess = (input: {
  identity: AuthenticatedContext;
  workspaceId: string;
  channelId: string;
}) => Promise<ChannelAccessSnapshot>;

// M1 supplies the active transaction on the shared Mongoose connection.
// M2 creates a CHANNEL conversation only for TEXT; LIVE uses session conversations later.
export type CreateChannelConversation = (input: {
  workspaceId: string;
  channelId: string;
  channelType: Extract<ChannelType, 'TEXT'>;
  dbSession: ClientSession;
}) => Promise<{ conversationId: string }>;
