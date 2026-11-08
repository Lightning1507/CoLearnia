import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CallControllerOwner, type CallIdentity } from '../live/runtime/callController';
import { WorkspaceShell } from './WorkspaceShell';
import type { WorkspacePanel, WorkspaceShellProps } from './shell-contract';
import {
  accessFixture,
  buildSidebarProjection,
  rawChannelFixture,
  sidebarFixture,
  workspaceFixture,
} from './workspace-fixture';

const privateChannelName = 'Kế hoạch riêng của ban quản trị';

function renderShell(panel: WorkspacePanel, channels = sidebarFixture) {
  const props: WorkspaceShellProps = {
    workspace: workspaceFixture,
    channels,
    panel,
    onSelectChannel: vi.fn(),
    chatPanel: createElement('div', null, 'Nội dung chat nhạy cảm'),
    callPanel: createElement('div', null, 'Sân khấu cuộc gọi'),
    persistentCallControls: createElement('output', null, 'Call runtime ổn định'),
  };
  return renderToStaticMarkup(createElement(WorkspaceShell, props));
}

describe('WorkspaceShell', () => {
  it('renders only channels with readable access in the sidebar and accessibility tree', () => {
    const markup = renderShell({ kind: 'empty' });

    expect(markup).toContain('thảo-luận-chung');
    expect(markup).toContain('Phòng học cuối tuần');
    expect(markup).not.toContain(privateChannelName);
  });

  it('does not render stale panel content after access projection removes the selection', () => {
    const selected = sidebarFixture.find(({ channel }) => channel.type === 'TEXT');
    expect(selected).toBeDefined();
    const panel = { kind: 'text', channelId: selected!.channel.id } as const;
    expect(renderShell(panel)).toContain('Nội dung chat nhạy cảm');

    const revoked = sidebarFixture.filter(({ channel }) => channel.id !== selected!.channel.id);
    const markup = renderShell(panel, revoked);
    expect(markup).toContain('Kênh không còn khả dụng');
    expect(markup).not.toContain('Nội dung chat nhạy cảm');
    expect(markup).not.toContain(selected!.channel.name);
  });

  it('keeps the external call owner active while TEXT/LIVE panels switch', async () => {
    const owner = new CallControllerOwner();
    const initialize = vi.fn(() => vi.fn());
    const identity: CallIdentity = {
      sessionId: '100000000000000000000007',
      epoch: '10000000-0000-4000-8000-000000000003',
      participantId: '100000000000000000000008',
      callGeneration: 1,
    };
    const handle = await owner.acquire(identity, initialize);
    const text = sidebarFixture.find(({ channel }) => channel.type === 'TEXT')!.channel;
    const live = sidebarFixture.find(({ channel }) => channel.type === 'LIVE')!.channel;

    const panels: WorkspacePanel[] = [
      { kind: 'text', channelId: text.id },
      { kind: 'live', channelId: live.id },
      { kind: 'text', channelId: text.id },
      { kind: 'live', channelId: live.id },
    ];
    for (const panel of panels) {
      const markup = renderShell(panel);
      expect(markup).toContain('Call runtime ổn định');
      expect(owner.getSnapshot().status).toBe('active');
    }

    expect(await owner.acquire(identity, initialize)).toBe(handle);
    expect(initialize).toHaveBeenCalledTimes(1);
    owner.shutdown();
  });
});

describe('buildSidebarProjection', () => {
  it('rejects stale or mismatched provider snapshots instead of inventing access', () => {
    const stale = accessFixture.map((entry) =>
      entry.channelId === rawChannelFixture[0]?.id
        ? { ...entry, channelRevision: entry.channelRevision + 1 }
        : entry,
    );
    const projection = buildSidebarProjection(rawChannelFixture, stale);

    expect(projection.some(({ channel }) => channel.id === rawChannelFixture[0]?.id)).toBe(false);
  });
});
