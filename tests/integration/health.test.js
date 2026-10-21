import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createReadiness } from '../../src/health/readiness.js';
import { loadConfig } from '../../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test' });

describe('createApp', () => {
  test('builds an app without opening a port', () => {
    const app = createApp({ config });
    expect(typeof app.handle).toBe('function');
    expect(app.locals.config).toBe(config);
  });

  test('does not advertise the framework', async () => {
    const res = await request(createApp({ config })).get('/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /health/live', () => {
  test('returns 200 even when a dependency is down', async () => {
    const readiness = createReadiness({
      checks: { db: async () => Promise.reject(new Error('x')) },
    });
    const res = await request(createApp({ config, readiness })).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'live' });
  });
});

describe('GET /health/ready', () => {
  test('returns 200 when all dependencies are up', async () => {
    const readiness = createReadiness({ checks: { db: async () => {} } });
    const res = await request(createApp({ config, readiness })).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { db: 'up' } });
  });

  test('returns 503 when a required dependency is down', async () => {
    const readiness = createReadiness({
      checks: { db: async () => Promise.reject(new Error('refused')) },
    });
    const res = await request(createApp({ config, readiness })).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { db: 'down' } });
  });

  test('flips to 503 during shutdown', async () => {
    const readiness = createReadiness();
    const app = createApp({ config, readiness });
    expect((await request(app).get('/health/ready')).status).toBe(200);
    readiness.markShuttingDown();
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('shutting_down');
  });
});
