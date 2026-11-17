import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { preflight, stagingOrigin } from './staging-preflight.mjs';
import { sampleMedia, summarizeMedia } from './media-evidence.mjs';

function stats(timestamp, bytes, relay = true) {
  return new Map(
    [
      { id: 't', type: 'transport', selectedCandidatePairId: 'p', dtlsState: 'connected' },
      {
        id: 'p',
        type: 'candidate-pair',
        state: 'succeeded',
        localCandidateId: 'l',
        remoteCandidateId: 'r',
        bytesSent: bytes,
        bytesReceived: bytes,
      },
      {
        id: 'l',
        type: 'local-candidate',
        candidateType: relay ? 'relay' : 'host',
        protocol: 'udp',
        relayProtocol: 'tls',
        address: 'private-address',
        port: 1234,
        usernameFragment: 'private-ufrag',
        url: 'turn:private-host',
      },
      { id: 'r', type: 'remote-candidate', candidateType: 'host' },
      {
        id: 'a',
        type: 'inbound-rtp',
        transportId: 't',
        kind: 'audio',
        ssrc: 123,
        bytesReceived: bytes,
        packetsReceived: bytes / 10,
        totalSamplesReceived: bytes * 2,
        totalAudioEnergy: bytes / 100,
      },
    ].map((row) => [row.id, { ...row, timestamp }]),
  );
}

test('requires an explicit HTTPS origin and rejects credential-bearing targets', () => {
  assert.equal(stagingOrigin('https://staging.example.com/'), 'https://staging.example.com');
  for (const value of [
    'http://staging.example.com',
    'https://user:secret@staging.example.com',
    'https://staging.example.com/api',
    'https://staging.example.com/?token=secret',
    'https://staging.example.com/#secret',
  ])
    assert.throws(() => stagingOrigin(value));
});

test('preflight whitelists output and remains distinct from acceptance', async () => {
  const paths = [];
  const result = await preflight('https://staging.example.com', {
    lookup: async () => ({ address: 'private-address' }),
    probe: async (url) => {
      paths.push(new URL(url).pathname);
      return {
        status: url.endsWith('/me') ? 401 : 200,
        authRequired: url.endsWith('/me'),
        size: 12,
        contentType: 'text/html',
        data: {
          name: 'CoLearnia',
          ready: true,
          database: 'connected',
          media: 'connected',
          secret: 'private-body',
        },
      };
    },
  });
  assert.equal(result.status, 'PASS');
  assert.match(result.acceptance, /BLOCKED/);
  assert.deepEqual(paths, ['/', '/api/v1/system/status', '/api/v1/auth/me']);
  assert.doesNotMatch(JSON.stringify(result), /private-address|private-body/);
});

test('DNS failure makes no HTTP requests and exposes no resolver error', async () => {
  const result = await preflight('https://staging.example.com', {
    lookup: async () => {
      throw new Error('private-address');
    },
    probe: () => assert.fail('must stop after DNS failure'),
  });
  assert.equal(result.status, 'FAIL');
  assert.doesNotMatch(JSON.stringify(result), /private-address/);
});

test('HTTP 200 alone, redirects, disabled media and auth bypass do not pass', async () => {
  for (const response of [
    { status: 200 },
    { status: 401 },
    { status: 302, contentType: 'text/html', size: 10 },
    {
      status: 200,
      contentType: 'text/html',
      size: 10,
      data: { name: 'CoLearnia', ready: true, database: 'connected', media: 'disabled' },
    },
    { error: 'tls-or-network-error' },
  ]) {
    const result = await preflight('https://staging.example.com', {
      lookup: async () => ({}),
      probe: async () => response,
    });
    assert.equal(result.status, 'FAIL');
  }
});

test('CLI rejects unknown flags without echoing private inputs', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/scrum81/staging-preflight.mjs', '--token', 'private-token'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout + result.stderr, /private-token/);
});

test('selected relay and RTP deltas produce a limited observation without private stats', () => {
  const result = summarizeMedia(stats(1000, 100), stats(6000, 500));
  const transport = result.transports[0];
  assert.equal(transport.selectedRelayWithRtp, true);
  assert.equal(transport.rtp[0].bytes, 400);
  assert.equal(transport.rtp[0].totalAudioEnergy, 4);
  assert.doesNotMatch(JSON.stringify(result), /private-|ssrc|username|turn:|1234/);
  assert.match(result.acceptance, /no task PASS/);
});

test('gathered but unselected relay does not prove relay traffic', () => {
  const before = stats(1000, 100, false);
  const after = stats(6000, 500, false);
  after.set('unused', { type: 'local-candidate', candidateType: 'relay' });
  assert.equal(summarizeMedia(before, after).transports[0].selectedRelayWithRtp, false);
});

test('remote relay with growing RTP does not prove local TURN use on SEND or RECV', () => {
  for (const direction of ['inbound-rtp', 'outbound-rtp']) {
    const before = stats(1000, 100, false);
    const after = stats(6000, 500, false);
    for (const [report, bytes] of [
      [before, 100],
      [after, 500],
    ]) {
      report.get('r').candidateType = 'relay';
      if (direction === 'outbound-rtp') {
        Object.assign(report.get('a'), {
          type: direction,
          bytesSent: bytes,
          packetsSent: bytes / 10,
        });
      }
    }
    const transport = summarizeMedia(before, after).transports[0];
    assert.equal(transport.localType, 'host');
    assert.equal(transport.remoteType, 'relay');
    assert.equal(transport.rtp[0].bytes, 400);
    assert.equal(transport.rtp[0].packets, 40);
    assert.equal(transport.selectedRelayWithRtp, false);
  }
});

test('local selected relay with growing outbound RTP records SEND observation', () => {
  const before = stats(1000, 100);
  const after = stats(6000, 500);
  for (const [report, bytes] of [
    [before, 100],
    [after, 500],
  ]) {
    Object.assign(report.get('a'), {
      type: 'outbound-rtp',
      bytesSent: bytes,
      packetsSent: bytes / 10,
    });
  }
  const transport = summarizeMedia(before, after).transports[0];
  assert.equal(transport.localType, 'relay');
  assert.equal(transport.remoteType, 'host');
  assert.equal(transport.rtp[0].direction, 'send');
  assert.equal(transport.rtp[0].bytes, 400);
  assert.equal(transport.selectedRelayWithRtp, true);
});

test('pair traffic without RTP, remote-only RTP and unrelated transports do not prove media', () => {
  for (const change of [
    (report) => report.delete('a'),
    (report) => {
      report.get('a').isRemote = true;
    },
    (report) => {
      report.get('a').transportId = 'other';
    },
    (report) => {
      report.get('a').packetsReceived = 10;
    },
  ]) {
    const before = stats(1000, 100);
    const after = stats(6000, 500);
    change(after);
    assert.equal(summarizeMedia(before, after).transports[0].selectedRelayWithRtp, false);
  }
});

test('reset counters, changed pairs, missing stats and failed DTLS are inconclusive', () => {
  for (const change of [
    (report) => {
      report.get('a').bytesReceived = 0;
    },
    (report) => {
      report.get('t').selectedCandidatePairId = 'new-pair';
    },
    (report) => {
      report.get('p').localCandidateId = 'new-candidate';
    },
    (report) => {
      report.get('t').dtlsState = 'failed';
    },
    (report) => {
      report.get('p').state = 'failed';
    },
    (report) => {
      report.get('a').ssrc = 456;
    },
    (report) => {
      report.get('a').timestamp = 1000;
    },
    (report) => {
      report.get('a').bytesReceived = Number.NaN;
    },
  ]) {
    const before = stats(1000, 100);
    const after = stats(6000, 500);
    change(after);
    assert.equal(summarizeMedia(before, after).transports[0].selectedRelayWithRtp, false);
  }
  assert.deepEqual(summarizeMedia(new Map(), new Map()).transports, []);
});

test('zero audio energy stays zero and cannot claim audible speech', () => {
  const before = stats(1000, 100);
  const after = stats(6000, 500);
  before.get('a').totalAudioEnergy = 0;
  after.get('a').totalAudioEnergy = 0;
  const result = summarizeMedia(before, after);
  assert.equal(result.transports[0].rtp[0].totalAudioEnergy, 0);
  assert.match(result.acceptance, /human media checks/);
});

test('sampling rejects unbounded durations before reading a live connection', async () => {
  const connection = { getStats: () => assert.fail('must not read stats') };
  for (const duration of [0, 999, 30_001, Infinity]) {
    await assert.rejects(sampleMedia(connection, duration));
  }
});
