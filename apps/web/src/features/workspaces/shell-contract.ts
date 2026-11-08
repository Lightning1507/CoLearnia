import type { ReactNode } from 'react';
import type { ChannelSummary, WorkspaceSummary } from '@colearnia/contracts';

// UI projection supplied by the data owner; never an authorization credential.
export type SidebarChannel = {
  channel: ChannelSummary;
  canReadContent: boolean;
  canManageChannel: boolean;
};

export type WorkspacePanel =
  { kind: 'empty' } | { kind: 'text'; channelId: string } | { kind: 'live'; channelId: string };

export type WorkspaceShellProps = {
  workspace: WorkspaceSummary;
  channels: readonly SidebarChannel[];
  panel: WorkspacePanel;
  onSelectChannel: (channel: ChannelSummary) => void;
  // M2 owns chat rendering; M3/M4 own call state outside the selected panel.
  chatPanel: ReactNode;
  callPanel: ReactNode;
  persistentCallControls: ReactNode;
};

export function readableSidebarChannels(channels: readonly SidebarChannel[], workspaceId: string) {
  return channels.filter(
    ({ channel, canReadContent }) => channel.workspaceId === workspaceId && canReadContent,
  );
}

export function resolvePanelChannel(
  channels: readonly SidebarChannel[],
  workspaceId: string,
  panel: WorkspacePanel,
) {
  if (panel.kind === 'empty') return undefined;

  const selected = readableSidebarChannels(channels, workspaceId).find(
    ({ channel }) => channel.id === panel.channelId,
  );
  const expectedType = panel.kind === 'text' ? 'TEXT' : 'LIVE';
  if (!selected || selected.channel.type !== expectedType) return undefined;
  return selected;
}
