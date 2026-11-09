import { useState } from 'react';
import type { ChannelAccessSnapshot, ChannelSummary, OwnUser } from '@colearnia/contracts';
import { RoomShell } from '../live/room/RoomShell';
import { useCallSnapshot } from '../live/runtime/callControllerContext';
import { WorkspaceShell } from './WorkspaceShell';
import type { WorkspacePanel } from './shell-contract';
import {
  accessFixture,
  currentUserFixture,
  sidebarFixture,
  workspaceFixture,
} from './workspace-fixture';

function ChatPanel({
  channel,
  identity,
  access,
}: {
  channel: ChannelSummary;
  identity: OwnUser;
  access: ChannelAccessSnapshot;
}) {
  return (
    <article className="workspace-fixture-panel" aria-label={`Chat ${channel.name}`}>
      <header>
        <h2>#{channel.name}</h2>
        <p>Panel fixture M2 · {identity.displayName}</p>
      </header>
      <section>
        <strong>Chào mừng đến kênh học tập chung.</strong>
        <p>
          Slot này chỉ nhận projection có quyền đọc ở revision {access.channelRevision}. Timeline,
          composer và realtime sẽ do M2 tích hợp sau.
        </p>
      </section>
    </article>
  );
}

function PersistentCallStatus() {
  const call = useCallSnapshot();
  return (
    <output className="workspace-call-badge" aria-label="Trạng thái cuộc gọi">
      <span aria-hidden="true">●</span>
      {call.status === 'idle' ? 'Chưa tham gia cuộc gọi' : 'Cuộc gọi đang hoạt động'}
    </output>
  );
}

export function WorkspaceFixturePage() {
  const [panel, setPanel] = useState<WorkspacePanel>({ kind: 'empty' });
  const selected =
    panel.kind === 'empty'
      ? undefined
      : sidebarFixture.find(({ channel }) => channel.id === panel.channelId)?.channel;
  const selectedAccess = selected
    ? accessFixture.find(({ channelId }) => channelId === selected.id)
    : undefined;

  return (
    <WorkspaceShell
      workspace={workspaceFixture}
      channels={sidebarFixture}
      panel={panel}
      onSelectChannel={(channel) =>
        setPanel({ kind: channel.type === 'TEXT' ? 'text' : 'live', channelId: channel.id })
      }
      chatPanel={
        selected?.type === 'TEXT' && selectedAccess ? (
          <ChatPanel channel={selected} identity={currentUserFixture} access={selectedAccess} />
        ) : null
      }
      callPanel={selected?.type === 'LIVE' ? <RoomShell channelName={selected.name} /> : null}
      persistentCallControls={<PersistentCallStatus />}
    />
  );
}
