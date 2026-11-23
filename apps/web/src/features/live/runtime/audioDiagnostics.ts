// Deliberately omit SDP, addresses, track/device labels, identifiers and credentials.
const audioCounters = [
  'bytesSent',
  'bytesReceived',
  'packetsSent',
  'packetsReceived',
  'packetsLost',
  'audioLevel',
  'totalAudioEnergy',
  'totalSamplesDuration',
  'concealedSamples',
  'totalSamplesReceived',
  'jitterBufferEmittedCount',
  'silentConcealedSamples',
  'insertedSamplesForDeceleration',
  'removedSamplesForAcceleration',
] as const;

export function summarizeAudioStats(report: RTCStatsReport) {
  const result: Record<string, number | string>[] = [];
  report.forEach((entry: Record<string, unknown>) => {
    if (entry.kind !== 'audio' && entry.mediaType !== 'audio') return;
    if (!['inbound-rtp', 'outbound-rtp', 'media-source'].includes(String(entry.type))) return;
    const row: Record<string, number | string> = { type: String(entry.type) };
    for (const key of audioCounters) {
      const value = entry[key];
      if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
    }
    result.push(row);
  });
  return result;
}
