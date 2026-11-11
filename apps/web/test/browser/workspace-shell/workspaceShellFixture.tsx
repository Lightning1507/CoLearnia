import { channelSummarySchema } from '@colearnia/contracts';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CallControllerProvider } from '../../../src/features/live/runtime/CallControllerProvider';
import { CallControllerOwner } from '../../../src/features/live/runtime/callController';
import { useCallSnapshot } from '../../../src/features/live/runtime/callControllerContext';
import { WorkspaceShell } from '../../../src/features/workspaces/WorkspaceShell';
import {
  sidebarFixture,
  workspaceFixture,
} from '../../../src/features/workspaces/workspace-fixture';
import '../../../src/styles/global.css';

const channelA = sidebarFixture.find(({ channel }) => channel.type === 'TEXT');
if (!channelA) throw new Error('Thiếu kênh TEXT cho kiểm thử');

const channelB = {
  ...channelA,
  channel: channelSummarySchema.parse({
    ...channelA.channel,
    id: '200000000000000000000001',
    name: 'W'.repeat(80),
  }),
};
const channels = [channelA, channelB];

function DraftComposer() {
  const [draft, setDraft] = useState('');
  return (
    <textarea aria-label="Bản nháp" value={draft} onChange={(e) => setDraft(e.target.value)} />
  );
}

function CallControls() {
  const call = useCallSnapshot();
  const [muted, setMuted] = useState(false);
  return (
    <button
      className="rounded-full border border-[color:var(--workspace-border)] px-3 py-1.5 text-xs"
      type="button"
      onClick={() => setMuted(!muted)}
    >
      {call.status === 'active' && (muted ? 'Bật mic cuộc gọi' : 'Tắt mic cuộc gọi')}
    </button>
  );
}

export function WorkspaceShellFixture() {
  const [channelId, setChannelId] = useState(channelB.channel.id);
  return (
    <WorkspaceShell
      workspace={workspaceFixture}
      channels={channels}
      panel={{ kind: 'text', channelId }}
      onSelectChannel={(channel) => setChannelId(channel.id)}
      chatPanel={<DraftComposer />}
      callPanel={null}
      persistentCallControls={<CallControls />}
    />
  );
}

if (import.meta.env.DEV) {
  const container = document.getElementById('root');
  if (!container) throw new Error('Thiếu root kiểm thử');
  const owner = new CallControllerOwner();
  const identity = {
    sessionId: '100000000000000000000007',
    epoch: '10000000-0000-4000-8000-000000000003',
    participantId: '100000000000000000000008',
    callGeneration: 1,
  };
  await owner.acquire(identity, () => () => {});
  const root = createRoot(container);
  import.meta.hot?.dispose(() => {
    root.unmount();
    owner.shutdown();
  });
  root.render(
    <StrictMode>
      <CallControllerProvider owner={owner}>
        <WorkspaceShellFixture />
      </CallControllerProvider>
    </StrictMode>,
  );
}
