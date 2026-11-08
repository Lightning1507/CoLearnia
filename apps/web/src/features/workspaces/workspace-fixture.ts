import {
  channelAccessSnapshotSchema,
  channelSummarySchema,
  liveContextSchema,
  ownUserSchema,
  workspaceSummarySchema,
  type ChannelAccessSnapshot,
  type ChannelSummary,
} from '@colearnia/contracts';
import type { SidebarChannel } from './shell-contract';

const ids = {
  workspace: '100000000000000000000001',
  owner: '100000000000000000000002',
  membership: '100000000000000000000003',
  text: '100000000000000000000004',
  live: '100000000000000000000005',
  privateChannel: '100000000000000000000006',
  session: '100000000000000000000007',
  participant: '100000000000000000000008',
} as const;

export const workspaceFixture = workspaceSummarySchema.parse({
  id: ids.workspace,
  name: 'Nhóm Ôn thi Khoa học',
  ownerId: ids.owner,
  revision: 4,
});

export const currentUserFixture = ownUserSchema.parse({
  id: ids.owner,
  displayName: 'Minh Anh',
  email: 'minh.anh@example.test',
  avatarUrl: null,
});

// This raw provider fixture intentionally contains a channel the current membership cannot read.
// Consumers receive buildSidebarProjection(), never this collection as authority.
export const rawChannelFixture = channelSummarySchema.array().parse([
  {
    id: ids.text,
    workspaceId: ids.workspace,
    name: 'thảo-luận-chung',
    type: 'TEXT',
    accessMode: 'WORKSPACE',
    revision: 2,
  },
  {
    id: ids.live,
    workspaceId: ids.workspace,
    name: 'Phòng học cuối tuần',
    type: 'LIVE',
    accessMode: 'WORKSPACE',
    revision: 5,
  },
  {
    id: ids.privateChannel,
    workspaceId: ids.workspace,
    name: 'Kế hoạch riêng của ban quản trị',
    type: 'TEXT',
    accessMode: 'PRIVATE',
    revision: 3,
  },
]);

export const accessFixture = channelAccessSnapshotSchema.array().parse([
  {
    workspaceId: ids.workspace,
    channelId: ids.text,
    channelType: 'TEXT',
    membershipId: ids.membership,
    membershipIncarnation: 1,
    membershipRevision: 6,
    channelRevision: 2,
    canReadContent: true,
    canManageChannel: false,
  },
  {
    workspaceId: ids.workspace,
    channelId: ids.live,
    channelType: 'LIVE',
    membershipId: ids.membership,
    membershipIncarnation: 1,
    membershipRevision: 6,
    channelRevision: 5,
    canReadContent: true,
    canManageChannel: false,
  },
  {
    workspaceId: ids.workspace,
    channelId: ids.privateChannel,
    channelType: 'TEXT',
    membershipId: ids.membership,
    membershipIncarnation: 1,
    membershipRevision: 6,
    channelRevision: 3,
    canReadContent: false,
    canManageChannel: true,
  },
]);

export function buildSidebarProjection(
  channels: readonly ChannelSummary[],
  access: readonly ChannelAccessSnapshot[],
): SidebarChannel[] {
  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  return access.flatMap((snapshot) => {
    const channel = channelsById.get(snapshot.channelId);
    if (
      !channel ||
      channel.workspaceId !== snapshot.workspaceId ||
      channel.type !== snapshot.channelType ||
      channel.revision !== snapshot.channelRevision
    ) {
      return [];
    }
    return [
      {
        channel,
        canReadContent: snapshot.canReadContent,
        canManageChannel: snapshot.canManageChannel,
      },
    ];
  });
}

export const sidebarFixture = buildSidebarProjection(rawChannelFixture, accessFixture);

const liveAccess = accessFixture.find(({ channelId }) => channelId === ids.live);
if (!liveAccess) throw new Error('LIVE access fixture is missing');

export const liveContextFixture = liveContextSchema.parse({
  auth: {
    userId: ids.owner,
    authSessionId: '100000000000000000000009',
    expiresAt: '2026-11-08T12:00:00.000Z',
  },
  sessionId: ids.session,
  epoch: '10000000-0000-4000-8000-000000000003',
  callGeneration: 1,
  access: liveAccess,
  participantId: ids.participant,
  role: 'HOST',
  host: { participantId: ids.participant, userId: ids.owner },
  scope: { type: 'MAIN' },
  audienceEpoch: 0,
  policyRevision: 1,
});
