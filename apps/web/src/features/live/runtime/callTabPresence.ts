// UX hints only. No authority, room metadata, tickets, or media cross this channel.
export function createCallTabPresence(
  userId: string,
  changed: (active: boolean) => void,
  focus: () => void,
) {
  const id = crypto.randomUUID();
  let channel: BroadcastChannel | undefined;
  let active = false;
  let disposed = false;
  const peers = new Map<string, number>();
  let selected: string | undefined;
  const refresh = () => {
    for (const [peer, seen] of peers) if (Date.now() - seen > 10000) peers.delete(peer);
    selected = peers.keys().next().value;
    changed(selected !== undefined);
  };
  const send = (type: string, target?: string) => {
    try {
      channel?.postMessage({ type, id, ...(target ? { target } : {}) });
    } catch {
      // Unsupported/failed delivery must never replace server ownership checks.
    }
  };
  try {
    if (typeof window.BroadcastChannel === 'function') {
      channel = new window.BroadcastChannel(`colearnia-call-presence:${userId}`);
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (disposed || !data || typeof data !== 'object') return;
        const packet = data as Record<string, unknown>;
        if (typeof packet.id !== 'string' || packet.id.length > 64 || packet.id === id) return;
        if (packet.type === 'active') {
          // Bound untrusted same-origin hints; timestamps come from this receiver.
          if (peers.has(packet.id) || peers.size < 32) peers.set(packet.id, Date.now());
        } else if (packet.type === 'release') peers.delete(packet.id);
        else if (packet.type === 'probe' && active) send('active');
        else if (packet.type === 'focus' && packet.target === id && active) focus();
        refresh();
      };
      send('probe');
    }
  } catch {
    channel = undefined;
  }
  const timer = setInterval(() => {
    if (active) send('active');
    refresh();
  }, 2000);
  return {
    setActive(value: boolean) {
      if (disposed || value === active) return;
      active = value;
      send(value ? 'active' : 'release');
    },
    focusOther() {
      refresh();
      if (selected) send('focus', selected);
    },
    probe() {
      refresh();
      send('probe');
    },
    dispose() {
      if (disposed) return;
      send('release');
      disposed = true;
      clearInterval(timer);
      channel?.close();
      peers.clear();
    },
  };
}
