import type { ReactNode, RefObject } from 'react';
import type {
  ChannelSummary,
  TextHistoryMessage,
  WorkspaceRole,
  WorkspaceSummary,
} from '@colearnia/contracts';

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
  onOpenWorkspaceList: () => void;
  workspaceChoices?: {
    items: readonly WorkspaceSummary[];
    pending: boolean;
    failed: boolean;
    loadingMore: boolean;
    onMore?: () => void;
    onRetry: () => void;
    onChoose: (workspace: WorkspaceSummary) => void;
  };
  user?: { displayName: string; role: WorkspaceRole };
  onPickerOpen?: () => void;
  createChannel?: ReactNode;
  workspaceActions?: ReactNode;
  searchMessages?: readonly TextHistoryMessage[];
  workspaceMenuTriggerRef?: RefObject<HTMLButtonElement | null>;
  // M2 owns chat rendering; M3/M4 own call state outside the selected panel.
  chatPanel: ReactNode;
  retainedChatPanel?: ReactNode;
  callPanel: ReactNode;
  persistentCallControls: ReactNode;
  sidebarControls?: ReactNode;
  sidebarStatus?: ReactNode;
  contentOverride?: ReactNode;
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
