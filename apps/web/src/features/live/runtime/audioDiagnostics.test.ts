import { expect, it } from 'vitest';
import { summarizeAudioStats } from './audioDiagnostics';

it('keeps audio counters and omits private identifiers, device labels and network addresses', () => {
  const report = new Map([
    [
      'audio',
      {
        type: 'inbound-rtp',
        kind: 'audio',
        bytesReceived: 2048,
        packetsReceived: 10,
        audioLevel: 0.2,
        id: 'private-id',
        address: 'private-address',
        trackIdentifier: 'private-track',
      },
    ],
    ['video', { type: 'inbound-rtp', kind: 'video', bytesReceived: 9000 }],
    ['candidate', { type: 'local-candidate', kind: 'audio', address: 'private-address' }],
  ]) as unknown as RTCStatsReport;
  expect(summarizeAudioStats(report)).toEqual([
    { type: 'inbound-rtp', bytesReceived: 2048, packetsReceived: 10, audioLevel: 0.2 },
  ]);
});
