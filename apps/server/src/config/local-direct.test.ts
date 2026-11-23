import { expect, it } from 'vitest';
import { loadConfig } from './env.js';
it('requires explicit local direct ICE and rejects production or non-loopback deployment', () => {
  expect(loadConfig({}).MEDIA_LOCAL_DIRECT).toBe(false);
  expect(loadConfig({ MEDIA_LOCAL_DIRECT: 'true' }).MEDIA_LOCAL_DIRECT).toBe(true);
  for (const values of [
    { NODE_ENV: 'production' },
    { HOST: '0.0.0.0' },
    { MEDIA_LISTEN_IP: '0.0.0.0' },
    { MEDIA_ANNOUNCED_ADDRESS: 'example.com' },
    { APP_ORIGIN: 'https://example.com' },
  ])
    expect(() => loadConfig({ MEDIA_LOCAL_DIRECT: 'true', ...values })).toThrow('loopback');
});
