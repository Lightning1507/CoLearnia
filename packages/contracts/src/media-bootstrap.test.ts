import { describe, expect, it } from 'vitest';
import {
  mediaBootstrapQuerySchema,
  mediaBootstrapResponseSchema,
  mediaContextHeaderSchema,
  mediaHttpContextIssueAckSchema,
  mediaHttpContextIssueInputSchema,
  mediaIceCredentialsBodySchema,
  mediaIceCredentialsResponseSchema,
  mediaRestParamsSchema,
  mediaTransportRestartIceAckSchema,
  mediaTransportRestartIceInputSchema,
} from './media-bootstrap.js';

const requestId = '30000000-0000-4000-8000-000000000001';
const epoch = '30000000-0000-4000-8000-000000000002';
const sessionId = '1'.repeat(24);
const context = { sessionId, epoch, callGeneration: 2 };
const command = { ...context, requestId, expectedPolicyRevision: 9 };
const token = 'A'.repeat(43);
const serverTime = '2026-11-08T10:00:00Z';
const expiresAt = '2026-11-08T10:01:00Z';

const ownership = {
  ...context,
  userId: '2'.repeat(24),
  authSessionId: '3'.repeat(24),
  socketId: 'tab-a-socket',
  audienceEpoch: 4,
};
const bindingFields = [
  'userId',
  'authSessionId',
  'socketId',
  'sessionId',
  'epoch',
  'callGeneration',
  'audienceEpoch',
] as const;

// Review example after token digest lookup and current ownership lookup. No runtime registry.
function proofDecision(
  auth: Pick<typeof ownership, 'userId' | 'authSessionId'> | null,
  header: string | undefined,
  current: typeof ownership | null,
  nowMs: number,
  requested = context,
) {
  if (!auth) return 'AUTH_REQUIRED';
  const binding = { ...ownership, expiresAt };
  if (
    !current ||
    !mediaContextHeaderSchema.safeParse(header).success ||
    header !== token ||
    auth.userId !== binding.userId ||
    auth.authSessionId !== binding.authSessionId ||
    requested.sessionId !== binding.sessionId ||
    requested.epoch !== binding.epoch ||
    requested.callGeneration !== binding.callGeneration ||
    Date.parse(binding.expiresAt) <= nowMs ||
    !bindingFields.every((field) => binding[field] === current[field])
  )
    return 'FORBIDDEN';
  return 'ALLOW';
}

describe('SCRUM-58 bootstrap, context proof and ICE contracts', () => {
  it('parses REST path and decimal query without accepting repeated or extra parameters', () => {
    expect(mediaRestParamsSchema.parse({ sessionId })).toEqual({ sessionId });
    expect(mediaRestParamsSchema.safeParse({ sessionId: epoch }).success).toBe(false);
    const query = { epoch, callGeneration: '2' };
    expect(mediaBootstrapQuerySchema.parse(query)).toEqual({ epoch, callGeneration: 2 });
    for (const value of ['0', '2e0', ' 2', ['2'], '9007199254740992']) {
      expect(mediaBootstrapQuerySchema.safeParse({ ...query, callGeneration: value }).success).toBe(
        false,
      );
    }
    expect(mediaBootstrapQuerySchema.safeParse({ ...query, token }).success).toBe(false);
  });

  it('returns only call context and Router capabilities in bootstrap', () => {
    const routerRtpCapabilities = {
      codecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          preferredPayloadType: 100,
          clockRate: 48000,
          channels: 2,
        },
      ],
      headerExtensions: [
        { kind: 'audio', uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level', preferredId: 10 },
      ],
    };
    const response = { requestId, data: { ...context, routerRtpCapabilities } };
    expect(mediaBootstrapResponseSchema.parse(response)).toEqual(response);
    expect(
      mediaBootstrapResponseSchema.safeParse({
        ...response,
        data: { ...response.data, producers: [] },
      }).success,
    ).toBe(false);
    const [codec] = routerRtpCapabilities.codecs;
    expect(
      mediaBootstrapResponseSchema.safeParse({
        ...response,
        data: {
          ...response.data,
          routerRtpCapabilities: {
            ...routerRtpCapabilities,
            codecs: [{ ...codec, parameters: { privateData: {} } }],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts ICE credentials only in the result and requires a TURN credential pair', () => {
    const body = { requestId, epoch, callGeneration: 2 };
    expect(mediaIceCredentialsBodySchema.parse(body)).toEqual(body);
    expect(
      mediaIceCredentialsBodySchema.safeParse({ ...body, urls: 'turn:other.invalid' }).success,
    ).toBe(false);
    const turn = {
      urls: ['turn:relay.invalid?transport=udp'],
      username: 'fixture-user',
      credential: 'fixture-credential',
    };
    const data = {
      ...context,
      serverTime,
      expiresAt,
      iceServers: [{ urls: 'stun:relay.invalid' }, turn],
    };
    expect(mediaIceCredentialsResponseSchema.parse({ requestId, data })).toEqual({
      requestId,
      data,
    });
    expect(
      mediaIceCredentialsResponseSchema.safeParse({
        requestId,
        data: { ...data, iceServers: [{ urls: turn.urls, username: turn.username }] },
      }).success,
    ).toBe(false);
    expect(
      mediaIceCredentialsResponseSchema.safeParse({
        requestId,
        data: { ...data, turnSharedSecret: 'fixture' },
      }).success,
    ).toBe(false);
  });

  it('issues proof through the authenticated socket command with an empty payload', () => {
    const issue = { ...command, payload: {} };
    const ack = { requestId, data: { status: 'completed', result: { token, expiresAt } } };
    expect(mediaHttpContextIssueInputSchema.parse(issue)).toEqual(issue);
    expect(
      mediaHttpContextIssueInputSchema.safeParse({
        ...issue,
        payload: { socketId: 'tab-b-socket' },
      }).success,
    ).toBe(false);
    expect(mediaHttpContextIssueAckSchema.parse(ack)).toEqual(ack);
    expect(mediaContextHeaderSchema.safeParse(`${token}=`).success).toBe(false);
    expect(mediaContextHeaderSchema.safeParse([token, token]).success).toBe(false);
  });

  it('denies the same-cookie tab without proof, stale ownership and proof without auth', () => {
    const now = Date.parse(serverTime);
    expect(proofDecision(ownership, token, ownership, now)).toBe('ALLOW');
    expect(proofDecision(ownership, undefined, ownership, now)).toBe('FORBIDDEN');
    expect(proofDecision(ownership, token, null, now)).toBe('FORBIDDEN');
    expect(proofDecision(null, token, ownership, now)).toBe('AUTH_REQUIRED');
    expect(proofDecision(ownership, token, ownership, now, { ...context, callGeneration: 3 })).toBe(
      'FORBIDDEN',
    );
    const takeover = { ...ownership, socketId: 'tab-b-socket', callGeneration: 3 };
    expect(proofDecision(ownership, token, takeover, now)).toBe('FORBIDDEN');
    expect(proofDecision(ownership, token, { ...ownership, audienceEpoch: 5 }, now)).toBe(
      'FORBIDDEN',
    );
    expect(proofDecision(ownership, token, ownership, Date.parse(expiresAt))).toBe('FORBIDDEN');
  });

  it('keeps ICE generation separate and discards a late ack after takeover or a newer restart', () => {
    const transportId = 'fixture-transport';
    const pending = mediaTransportRestartIceInputSchema.parse({
      ...command,
      payload: { transportId, expectedIceGeneration: 0 },
    });
    const result = {
      transportId,
      iceGeneration: 1,
      iceParameters: { usernameFragment: 'fixture', password: 'fixture-password' },
    };
    const ack = mediaTransportRestartIceAckSchema.parse({
      requestId,
      data: { status: 'completed', result },
    });
    if (!('data' in ack)) throw new Error('Expected a completed ICE restart');
    const current = { ...context, requestId, transportId, iceGeneration: 0 };
    const appliesTo = (active: typeof current) =>
      pending.sessionId === active.sessionId &&
      pending.epoch === active.epoch &&
      pending.callGeneration === active.callGeneration &&
      pending.requestId === active.requestId &&
      ack.requestId === active.requestId &&
      pending.payload.transportId === active.transportId &&
      ack.data.result.transportId === active.transportId &&
      pending.payload.expectedIceGeneration === active.iceGeneration &&
      ack.data.result.iceGeneration === active.iceGeneration + 1;
    expect(appliesTo(current)).toBe(true);
    expect(appliesTo({ ...current, callGeneration: 3 })).toBe(false);
    expect(appliesTo({ ...current, iceGeneration: 2 })).toBe(false);
    expect(appliesTo({ ...current, transportId: 'replacement-transport' })).toBe(false);
    expect(appliesTo({ ...current, requestId: '30000000-0000-4000-8000-000000000003' })).toBe(
      false,
    );
    expect(
      mediaTransportRestartIceAckSchema.safeParse({
        ...ack,
        data: { ...ack.data, result: { ...result, iceGeneration: 0 } },
      }).success,
    ).toBe(false);
    expect(
      mediaTransportRestartIceInputSchema.safeParse({
        ...pending,
        payload: { ...pending.payload, expectedIceGeneration: -1 },
      }).success,
    ).toBe(false);
  });
});
