// Integration tests: createApp() aur /health endpoints, Supertest ke saath.
// Supertest app ko bina port kholein seedha request bhej deta hai, isliye tests tez aur isolated hote hain.

import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createReadiness } from '../../src/health/readiness.js';
import { loadConfig } from '../../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test' });

// App bina port ke ban jaana chahiye (server.js se alag hone ka fayda).
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

// Liveness dependency down hone par bhi 200 deta hai (restart ka decision, traffic ka nahi).
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

// Readiness dependencies par depend karti hai: 200 ya 503.
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
