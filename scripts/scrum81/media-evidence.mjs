// Browser-compatible; never returns SDP, addresses, ports, IDs, URLs or ICE credentials.
const known = (value, values) => (values.includes(value) ? value : null);
const number = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
const difference = (before, after, key) => {
  const a = number(before?.[key]);
  const b = number(after?.[key]);
  return a !== null && b !== null && b >= a ? b - a : null;
};

export function summarizeMedia(before, after) {
  const transports = [];
  for (const transport of after.values()) {
    if (transport.type !== 'transport') continue;
    const previous = before.get(transport.id);
    const pair = after.get(transport.selectedCandidatePairId);
    const oldPair = before.get(previous?.selectedCandidatePairId);
    const stable = Boolean(
      pair &&
      oldPair &&
      pair.id === oldPair.id &&
      pair.localCandidateId === oldPair.localCandidateId &&
      pair.remoteCandidateId === oldPair.remoteCandidateId &&
      pair.timestamp > oldPair.timestamp &&
      transport.timestamp > previous?.timestamp,
    );
    const local = after.get(pair?.localCandidateId);
    const remote = after.get(pair?.remoteCandidateId);
    const rtp = [];
    for (const row of after.values()) {
      if (!['inbound-rtp', 'outbound-rtp'].includes(row.type) || row.isRemote) continue;
      if (row.transportId !== transport.id) continue;
      const old = before.get(row.id);
      const comparable =
        stable &&
        old?.type === row.type &&
        old?.transportId === row.transportId &&
        old?.ssrc === row.ssrc &&
        row.timestamp > old?.timestamp;
      const delta = (key) => (comparable ? difference(old, row, key) : null);
      rtp.push({
        direction: row.type === 'inbound-rtp' ? 'receive' : 'send',
        kind: known(row.kind, ['audio', 'video']),
        bytes: delta(row.type === 'inbound-rtp' ? 'bytesReceived' : 'bytesSent'),
        packets: delta(row.type === 'inbound-rtp' ? 'packetsReceived' : 'packetsSent'),
        framesDecoded: delta('framesDecoded'),
        totalSamplesReceived: delta('totalSamplesReceived'),
        totalAudioEnergy: delta('totalAudioEnergy'),
      });
    }
    const connected = transport.dtlsState === 'connected' && pair?.state === 'succeeded';
    transports.push({
      stableSelectedPair: stable,
      dtlsState: known(transport.dtlsState, ['new', 'connecting', 'connected', 'closed', 'failed']),
      pairState: known(pair?.state, ['frozen', 'waiting', 'in-progress', 'failed', 'succeeded']),
      localType: known(local?.candidateType, ['host', 'srflx', 'prflx', 'relay']),
      remoteType: known(remote?.candidateType, ['host', 'srflx', 'prflx', 'relay']),
      protocol: known(local?.protocol, ['udp', 'tcp']),
      relayProtocol: known(local?.relayProtocol, ['udp', 'tcp', 'tls']),
      rttSeconds: number(pair?.currentRoundTripTime),
      pairBytesSent: stable ? difference(oldPair, pair, 'bytesSent') : null,
      pairBytesReceived: stable ? difference(oldPair, pair, 'bytesReceived') : null,
      selectedRelayWithRtp: Boolean(
        stable &&
        connected &&
        local?.candidateType === 'relay' &&
        rtp.some((row) => row.bytes > 0 && row.packets > 0),
      ),
      rtp,
    });
  }
  return {
    scope: 'local-stats-observation-only',
    transports,
    acceptance: 'Requires independent networks, both clients and human media checks; no task PASS',
  };
}

// Accepts an already-owned RTCPeerConnection or mediasoup Transport. Does not close it.
export async function sampleMedia(connection, durationMs = 5000) {
  if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 30_000) {
    throw new Error('Sample duration must be 1000..30000 ms');
  }
  const before = await connection.getStats();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  const after = await connection.getStats();
  return {
    observedAt: new Date().toISOString(),
    durationMs,
    ...summarizeMedia(before, after),
  };
}
