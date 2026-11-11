import { useRef, useState } from 'react';
import type { ChannelAccessSnapshot, ChannelSummary, OwnUser } from '@colearnia/contracts';
import { RoomShell } from '../live/room/RoomShell';
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
    <article className="flex min-w-0 flex-1 flex-col" aria-label={`Chat ${channel.name}`}>
      <section className="grid content-start gap-3 px-5 py-6">
        <p className="text-sm text-[color:var(--workspace-muted)]">
          Panel fixture M2 · {identity.displayName}
        </p>
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
    <output
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--workspace-border)] px-3 py-1.5 text-xs text-[color:var(--workspace-muted)]"
      aria-label="Trạng thái cuộc gọi"
    >
      <span aria-hidden="true">●</span>
      {call.status === 'idle' ? 'Chưa tham gia cuộc gọi' : 'Cuộc gọi đang hoạt động'}
    </output>
  );
}

function FixtureRoom({ channel }: { channel: ChannelSummary }) {
  const [participantsOpen, setParticipantsOpen] = useState(true);
  const participantsButton = useRef<HTMLButtonElement>(null);

  return (
    <RoomShell
      channelName={channel.name}
      useWorkspaceWidth
      sessionId={
        channel.id === liveContextFixture.access.channelId
          ? liveContextFixture.sessionId
          : undefined
      }
      sidePanel={
        participantsOpen
          ? {
              label: 'Người tham gia',
              content: <p className="text-stone-600">Chưa có danh sách người tham gia.</p>,
              onBackToStage: () => {
                setParticipantsOpen(false);
                participantsButton.current?.focus();
              },
            }
          : undefined
      }
      controls={
        <button
          type="button"
          className="rounded-lg border border-stone-200 px-3 py-2"
          ref={participantsButton}
          aria-expanded={participantsOpen}
          onClick={() => setParticipantsOpen(!participantsOpen)}
        >
          Người tham gia
        </button>
      }
    />
  );
}

export function WorkspaceFixturePage() {
  const [panel, setPanel] = useState<WorkspacePanel>({ kind: 'empty' });
  const [showWorkspaceList, setShowWorkspaceList] = useState(false);
  const selected =
    panel.kind === 'empty'
      ? undefined
      : sidebarFixture.find(({ channel }) => channel.id === panel.channelId)?.channel;
  const selectedAccess = selected
    ? accessFixture.find(({ channelId }) => channelId === selected.id)
    : undefined;

  if (showWorkspaceList) {
    return (
      <main className="grid content-start gap-4 p-5" aria-label="Danh sách Workspace fixture">
        <h1 className="m-0 text-xl font-semibold tracking-normal">Danh sách Workspace</h1>
        <p className="text-sm text-[color:var(--workspace-muted)]">
          Dữ liệu minh họa · Chọn Workspace để tiếp tục.
        </p>
        <button
          type="button"
          className="justify-self-start rounded-lg border border-[color:var(--workspace-border)] px-4 py-3 text-sm"
          onClick={() => setShowWorkspaceList(false)}
        >
          {workspaceFixture.name}
        </button>
      </main>
    );
  }

  return (
    <WorkspaceShell
      workspace={workspaceFixture}
      channels={sidebarFixture}
      panel={panel}
      onOpenWorkspaceList={() => setShowWorkspaceList(true)}
      onSelectChannel={(channel) =>
        setPanel({ kind: channel.type === 'TEXT' ? 'text' : 'live', channelId: channel.id })
      }
      chatPanel={
        selected?.type === 'TEXT' && selectedAccess ? (
          <ChatPanel channel={selected} identity={currentUserFixture} access={selectedAccess} />
        ) : null
      }
      callPanel={selected?.type === 'LIVE' ? <FixtureRoom channel={selected} /> : null}
      persistentCallControls={<PersistentCallStatus />}
    />
  );
}
