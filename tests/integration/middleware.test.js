import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createLogCapture } from '../helpers/log-capture.js';

const MW = '/api/v1/examples/middleware';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makeApp(env = 'test') {
  const capture = createLogCapture();
  const config = loadConfig({ NODE_ENV: env });
  return { app: createApp({ config, logger: capture.logger }), config, ...capture };
}

describe('request ID', () => {
  test('generates a UUID, returns it in X-Request-Id', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/nope');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  test('reuses a valid caller-supplied ID', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get('/nope').set('X-Request-Id', 'upstream-abc_123.4');
    expect(res.headers['x-request-id']).toBe('upstream-abc_123.4');
    expect(entries()[0].requestId).toBe('upstream-abc_123.4');
  });

  test.each(['short', 'has space in it 12345', '<script>alert(1)</script>', 'x'.repeat(129)])(
    'replaces an unsafe incoming ID: %s',
    async (bad) => {
      const { app } = makeApp();
      const res = await request(app).get('/nope').set('X-Request-Id', bad);
      expect(res.headers['x-request-id']).toMatch(UUID);
    },
  );

  test('present on every kind of response (health, static, 404, parse error)', async () => {
    const { app } = makeApp();
    const responses = [
      await request(app).get('/health/live'),
      await request(app).get('/static/example.txt'),
      await request(app).get('/nope'),
      await request(app)
        .post('/api/v1/examples/echo/json')
        .set('Content-Type', 'application/json')
        .send('{bad'),
    ];
    for (const res of responses) expect(res.headers['x-request-id']).toMatch(UUID);
  });

  test('concurrent requests get distinct IDs; res.locals is not shared', async () => {
    const { app } = makeApp();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app).get(`${MW}/chain`)),
    );
    const ids = results.map((r) => r.body.requestId);
    expect(new Set(ids).size).toBe(20);
    results.forEach((r) =>
      expect(r.body.trace).toEqual(['router-level', 'route-a', 'route-b', 'handler']),
    );
  });
});

describe('security headers', () => {
  test.each([
    ['health', '/health/live'],
    ['static', '/static/example.txt'],
    ['API 200', '/api/v1/examples/ping'],
    ['404', '/nope'],
  ])('%s response carries Helmet headers', async (_name, path) => {
    const { app } = makeApp();
    const res = await request(app).get(path);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('also on a request rejected by the body parser (headers precede parsing)', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/examples/echo/json')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('request logging', () => {
  test('one structured entry per request, correlated with the response header', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get('/api/v1/examples/ping');
    const list = entries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      service: 'shopsphere',
      msg: 'request completed',
      level: 30,
      method: 'GET',
      status: 200,
      route: '/ping',
      requestId: res.headers['x-request-id'],
    });
    expect(list[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('matched routes log the pattern, never path-parameter values', async () => {
    const { app, entries } = makeApp();
    await request(app).get('/api/v1/examples/echo/super-secret-reset-token');
    const [entry] = entries();
    expect(entry.route).toBe('/echo/:value');
    expect(entry.path).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('super-secret-reset-token');
  });

  test('unmatched requests log the path without the query string', async () => {
    const { app, entries } = makeApp();
    await request(app).get('/nope?token=abc123');
    expect(entries()[0]).toMatchObject({ status: 404, path: '/nope' });
  });

  test('health probes are not logged (conditional middleware) but still get an ID', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(entries()).toHaveLength(0);
  });

  test('requests rejected by the parser are logged too (logger precedes parsing)', async () => {
    const { app, entries } = makeApp();
    await request(app)
      .post('/api/v1/examples/echo/json')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ status: 400, level: 40 });
  });

  test('passwords, tokens, cookies, auth headers and bodies never reach the logs', async () => {
    const { app, text } = makeApp();
    await request(app)
      .post('/api/v1/examples/echo/json?token=query-secret-1')
      .set('Authorization', 'Bearer header-secret-2')
      .set('Cookie', 'sid=cookie-secret-3')
      .send({ password: 'body-secret-4', note: 'body-secret-5' });
    await request(app)
      .post('/api/v1/examples/echo/json?token=query-secret-1')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer header-secret-2')
      .send('{"password":"body-secret-6"'); // malformed -> error path
    const out = text();
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i <= 6; i++) expect(out).not.toMatch(new RegExp(`secret-${i}`));
  });
});

describe('teaching examples: middleware mechanics', () => {
  test('chaining: router-level -> route-level a -> b -> handler, in order', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${MW}/chain`);
    expect(res.body.trace).toEqual(['router-level', 'route-a', 'route-b', 'handler']);
  });

  test('res.locals carries the app-level request ID down to the handler', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${MW}/chain`);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  test('conditional middleware runs only when its predicate is true', async () => {
    const { app } = makeApp();
    expect((await request(app).get(`${MW}/conditional`)).body.trace).toEqual([
      'router-level',
      'handler',
    ]);
    expect((await request(app).get(`${MW}/conditional?debug=1`)).body.trace).toEqual([
      'router-level',
      'debug',
      'handler',
    ]);
  });

  test('a rejected request never reaches the controller', async () => {
    const { app } = makeApp();
    const stats = async () => (await request(app).get(`${MW}/stats`)).body.calls;

    expect((await request(app).get(`${MW}/guarded`)).status).toBe(403);
    expect((await request(app).get(`${MW}/guarded`).set('x-demo-role', 'customer')).status).toBe(
      403,
    );
    expect((await stats()).handler).toBe(0);

    const ok = await request(app).get(`${MW}/guarded`).set('x-demo-role', 'admin');
    expect(ok.status).toBe(200);
    expect((await stats()).handler).toBe(1);
  });

  test('rejected response is still ID-tagged, header-protected and logged', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get(`${MW}/guarded`);
    expect(res.status).toBe(403);
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(entries()[0]).toMatchObject({ status: 403, requestId: res.headers['x-request-id'] });
  });

  test('next(err) skips later middleware and the handler, and reaches error handling', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${MW}/fail`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.text).not.toContain('demo failure');
    const { calls } = (await request(app).get(`${MW}/stats`)).body;
    expect(calls).toEqual({ handler: 0, afterError: 0 });
  });

  test('req.app exposes app-level configuration inside a router', async () => {
    const { app, config } = makeApp();
    const res = await request(app).get(`${MW}/app-config`);
    expect(res.body).toEqual({ env: config.env, logLevel: config.logLevel });

    const custom = createApp({
      config: Object.freeze({ ...loadConfig({ NODE_ENV: 'development' }), logLevel: 'silent' }),
    });
    expect((await request(custom).get(`${MW}/app-config`)).body).toEqual({
      env: 'development',
      logLevel: 'silent',
    });
  });

  test('teaching middleware is not mounted in production', async () => {
    const { app } = makeApp('production');
    expect((await request(app).get(`${MW}/chain`)).status).toBe(404);
  });
});
