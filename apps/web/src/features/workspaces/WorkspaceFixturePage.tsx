import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChannelSummary } from '@colearnia/contracts';
import { TextFixturePanel } from '../text/TextTimeline';
import { RoomShell, useCallSnapshot } from '../live';
import { WorkspaceShell } from './WorkspaceShell';
import type { WorkspacePanel } from './shell-contract';
import {
  accessFixture,
  currentUserFixture,
  liveContextFixture,
  sidebarFixture,
  workspaceFixture,
} from './workspace-fixture';

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
  const workspaceListHeading = useRef<HTMLHeadingElement>(null);
  const workspaceMenuTrigger = useRef<HTMLButtonElement>(null);
  const restoreWorkspaceFocus = useRef(false);
  useLayoutEffect(() => {
    if (showWorkspaceList) {
      workspaceListHeading.current?.focus({ preventScroll: true });
    }
  }, [showWorkspaceList]);
  useEffect(() => {
    if (showWorkspaceList || !restoreWorkspaceFocus.current) return;
    // Restore navigation focus after the remounted LIVE panel's StrictMode effects.
    const frame = requestAnimationFrame(() => {
      restoreWorkspaceFocus.current = false;
      workspaceMenuTrigger.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showWorkspaceList]);
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
        <h1
          className="m-0 text-xl font-semibold tracking-normal"
          ref={workspaceListHeading}
          tabIndex={-1}
        >
          Danh sách Workspace
        </h1>
        <p className="text-sm text-[color:var(--workspace-muted)]">
          Dữ liệu minh họa · Chọn Workspace để tiếp tục.
        </p>
        <button
          type="button"
          className="justify-self-start rounded-lg border border-[color:var(--workspace-border)] px-4 py-3 text-sm"
          onClick={() => {
            restoreWorkspaceFocus.current = true;
            setShowWorkspaceList(false);
          }}
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
      workspaceMenuTriggerRef={workspaceMenuTrigger}
      onSelectChannel={(channel) =>
        setPanel({ kind: channel.type === 'TEXT' ? 'text' : 'live', channelId: channel.id })
      }
      chatPanel={
        selected?.type === 'TEXT' && selectedAccess ? (
          <TextFixturePanel
            key={selected.id + ':' + selectedAccess.channelRevision}
            channelId={selected.id}
            senderId={currentUserFixture.id}
            displayName={currentUserFixture.displayName}
          />
        ) : null
      }
      callPanel={selected?.type === 'LIVE' ? <FixtureRoom channel={selected} /> : null}
      persistentCallControls={<PersistentCallStatus />}
    />
  );
}
