import { useState } from 'react';
import type {
  ChannelAccessSnapshot,
  ChannelSummary,
  LiveContext,
  OwnUser,
} from '@colearnia/contracts';
import { useCallSnapshot } from '../live/runtime/callControllerContext';
import { WorkspaceShell } from './WorkspaceShell';
import type { WorkspacePanel } from './shell-contract';
import {
  accessFixture,
  currentUserFixture,
  liveContextFixture,
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

function CallPanel({ context }: { context: LiveContext }) {
  const call = useCallSnapshot();
  return (
    <article className="workspace-fixture-panel" aria-label="Panel phòng trực tiếp">
      <header>
        <h2>Phòng học trực tiếp</h2>
        <p>Panel fixture M3/M4 · phạm vi {context.scope.type}</p>
      </header>
      <section>
        <strong>Call runtime: {call.status === 'idle' ? 'chưa tham gia' : call.status}</strong>
        <p>
          Chuyển panel chỉ đổi UI consumer. Join, thiết bị, signaling và kết thúc cuộc gọi không
          được kích hoạt tại đây.
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
      callPanel={<CallPanel context={liveContextFixture} />}
      persistentCallControls={<PersistentCallStatus />}
    />
  );
}
