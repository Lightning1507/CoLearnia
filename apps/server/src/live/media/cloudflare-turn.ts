import { mediaIceCredentialsResponseSchema } from '@colearnia/contracts';
import type { AppConfig } from '../../config/env.js';
import { mediaIceTtlSeconds } from './media-bootstrap.js';

export function createCloudflareTurnProvider(
  config: Pick<AppConfig, 'TURN_KEY_ID' | 'TURN_KEY_API_TOKEN'>,
  request = fetch,
) {
  return async (signal: AbortSignal) => {
    if (!config.TURN_KEY_ID || !config.TURN_KEY_API_TOKEN)
      throw new Error('TURN provider unavailable');
    const key = encodeURIComponent(config.TURN_KEY_ID);
    const response = await request(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${config.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({ ttl: mediaIceTtlSeconds }),
      },
    );
    if (response.status !== 201) throw new Error('TURN credential request failed');
    const raw: unknown = await response.json();
    const iceServers = mediaIceCredentialsResponseSchema.shape.data.shape.iceServers
      .max(8)
      .parse(raw && typeof raw === 'object' && 'iceServers' in raw ? raw.iceServers : undefined)
      .map((server) => ({
        ...server,
        urls: [server.urls].flat().filter((url) => !/:53(?:[/?]|$)/.test(url)),
      }))
      .filter(({ urls }) => urls.length > 0);
    if (!iceServers.some(({ urls }) => urls.some((url) => /^turns?:/i.test(url))))
      throw new Error('TURN credential response did not include a relay');
    return iceServers;
  };
}
