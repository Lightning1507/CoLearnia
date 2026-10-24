import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, systemStatusSchema } from '@colearnia/contracts';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig({ NODE_ENV: 'test' });

describe('HTTP foundation', () => {
  const app = createApp(config, () => ({
    name: 'CoLearnia',
    database: 'disconnected',
    media: 'disabled',
    ready: false,
  }));

  it('keeps liveness separate from dependency readiness', async () => {
    expect((await request(app).get('/health/live')).status).toBe(200);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(systemStatusSchema.parse(response.body.data).ready).toBe(false);
  });

  it('returns a consistent error for unknown routes without leaking implementation', async () => {
    const response = await request(app).get('/api/v1/workspaces');
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects invalid JSON with a client error', async () => {
    const response = await request(app)
      .post('/api/v1/unknown')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_JSON');
  });

  it('only advertises readiness when dependencies report ready', async () => {
    const readyApp = createApp(config, () => ({
      name: 'CoLearnia',
      database: 'connected',
      media: 'connected',
      ready: true,
    }));
    expect((await request(readyApp).get('/health/ready')).status).toBe(200);
  });
});
