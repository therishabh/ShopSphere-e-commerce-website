import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

const app = createApp({ config: loadConfig({ NODE_ENV: 'test' }) });

describe('express.static at /static', () => {
  test('serves a file with type and cache headers', async () => {
    const res = await request(app).get('/static/example.txt');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/plain');
    expect(res.text).toMatch(/express\.static/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('missing file falls through to the JSON 404', async () => {
    const res = await request(app).get('/static/missing.txt');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('no directory listing or index', async () => {
    expect((await request(app).get('/static/')).status).toBe(404);
  });

  test.each(['/static/.env', '/static/%2e%2e%2fpackage.json', '/static/..%2fpackage.json'])(
    'dotfiles and path traversal are not served: %s',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.text).not.toMatch(/shopsphere|"name"/);
    },
  );

  test('only GET/HEAD are served', async () => {
    const res = await request(app).post('/static/example.txt');
    expect(res.status).toBe(404);
  });
});
