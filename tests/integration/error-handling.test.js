// Integration tests: centralized error handling (src/errors/, src/http/error-handler.js) poori app ke through.
// Har error source (throw, rejected Promise, next(err), service/DB error, unknown route, parse error) ek jaisa
// safe response de aur logs mein sahi level par aaye. Teaching routes: src/examples/error-examples.routes.js.

import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createErrorHandler } from '../../src/http/error-handler.js';
import { notFound } from '../../src/http/not-found.js';
import { requestId } from '../../src/middleware/request-id.js';
import { createRequestLogger } from '../../src/middleware/request-logger.js';
import { createLogCapture } from '../helpers/log-capture.js';

// Error demo routes ka prefix.
const ERR = '/api/v1/examples/errors';

function makeApp(env = 'test') {
  const capture = createLogCapture('debug');
  const config = loadConfig({ NODE_ENV: env });
  return { app: createApp({ config, logger: capture.logger }), ...capture };
}

// Request ki 'request completed' line dhundta hai (findLast = list ko peeche se dekhta hai).
const lastRequestLog = (entries) => entries().findLast((e) => e.msg === 'request completed');

// Expected errors (validation, 401, 403, 404, 409, 429): apna status, stable code, koi stack/internal detail nahi.
describe('operational errors -> their own status and safe body', () => {
  test.each([
    ['validation', 400, 'VALIDATION_ERROR'],
    ['authentication', 401, 'UNAUTHENTICATED'],
    ['authorization', 403, 'FORBIDDEN'],
    ['not-found', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['rate-limit', 429, 'RATE_LIMITED'],
  ])('/raise/%s -> %i %s', async (kind, status, code) => {
    const { app } = makeApp();
    const res = await request(app).get(`${ERR}/raise/${kind}`);
    expect(res.status).toBe(status);
    expect(res.type).toBe('application/json');
    expect(res.body.error.code).toBe(code);
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(
      Object.keys(res.body.error).every((k) => ['code', 'message', 'details'].includes(k)),
    ).toBe(true);
  });

  test('validation details and rate-limit header reach the client', async () => {
    const { app } = makeApp();
    const v = await request(app).get(`${ERR}/raise/validation`);
    expect(v.body.error.details).toEqual([{ path: 'email', message: 'Invalid email' }]);
    const r = await request(app).get(`${ERR}/raise/rate-limit`);
    expect(r.headers['retry-after']).toBe('30');
  });

  test('operational errors do not produce an error-level log or a stack', async () => {
    const { app, entries, text } = makeApp();
    await request(app).get(`${ERR}/raise/conflict`);
    expect(entries().some((e) => e.level >= 50)).toBe(false);
    expect(text()).not.toContain('"stack"');
    expect(lastRequestLog(entries)).toMatchObject({
      status: 409,
      level: 40,
      errorCode: 'CONFLICT',
    });
  });

  test('error responses still carry request ID and security headers', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${ERR}/raise/not-found`);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

// Bug/infra failures: client ko hamesha generic 500; asli message + stack sirf server logs mein.
describe('unexpected errors -> generic 500, details stay in the logs', () => {
  test.each([
    ['sync throw', 'sync-throw'],
    ['rejected Promise (no wrapper)', 'async-reject'],
    ['next(err)', 'next-err'],
    ['thrown string', 'throw-string'],
  ])('%s', async (_name, path) => {
    const { app, entries } = makeApp();
    const res = await request(app).get(`${ERR}/${path}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
    });
    expect(res.text).not.toMatch(/secret internal detail|stack|at .*\.js/i);

    const unexpected = entries().find((e) => e.msg === 'unexpected error');
    expect(unexpected).toMatchObject({ level: 50, requestId: res.headers['x-request-id'] });
    expect(lastRequestLog(entries)).toMatchObject({
      status: 500,
      level: 50,
      errorCode: 'INTERNAL_ERROR',
    });
  });

  test('the real error and stack are logged server-side', async () => {
    const { app, entries } = makeApp();
    await request(app).get(`${ERR}/sync-throw`);
    const { err } = entries().find((e) => e.msg === 'unexpected error');
    expect(err.message).toBe('secret internal detail: sync');
    expect(err.stack).toContain('error-examples.routes.js');
  });
});

// Async service ka domain error apna status rakhta hai; DB driver ka error (host/port wala) client ko leak nahi hota.
describe('errors from async services and database adapters', () => {
  test('service domain errors keep their status (409, 404) and success still works', async () => {
    const { app } = makeApp();
    expect((await request(app).get(`${ERR}/service/reserve/taken`)).status).toBe(409);
    expect((await request(app).get(`${ERR}/service/reserve/missing`)).status).toBe(404);
    const ok = await request(app).get(`${ERR}/service/reserve/abc`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ sku: 'abc', reserved: true });
  });

  test('database driver failure -> generic 500, host/port never reach the client', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get(`${ERR}/service/load`);
    expect(res.status).toBe(500);
    expect(res.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|5432|db-internal/);
    const { err } = entries().find((e) => e.msg === 'unexpected error');
    expect(err.message).toContain('10.0.0.5:5432'); // available for diagnosis
  });
});

// 404, malformed JSON, bada body, ZodError: sab ek hi error handler se nikalte hain.
describe('404 and framework errors use the same pipeline', () => {
  test('unknown route -> NotFoundError via the final 404 handler', async () => {
    const { app, entries } = makeApp();
    const res = await request(app).get('/definitely/not/here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    expect(lastRequestLog(entries)).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
  });

  test('malformed JSON and oversized body keep fixed messages', async () => {
    const { app } = makeApp();
    const bad = await request(app)
      .post('/api/v1/examples/echo/json')
      .set('Content-Type', 'application/json')
      .send('{"secretField": ');
    expect(bad.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Malformed request body' });
    expect(bad.text).not.toContain('secretField');

    const big = await request(app)
      .post('/api/v1/examples/echo/json')
      .send({ a: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
  });

  test('ZodError thrown inside a handler becomes a 400 with field details', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/examples/notes').send({ text: '', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});

// Handler mein NODE_ENV ka branch nahi hai: production aur development ke bodies same (safety config par depend nahi karti).
describe('safe responses do not depend on NODE_ENV', () => {
  // Handler ke andar koi env branch nahi hai: production aur development ke bodies same hote hain.
  // Chhota alag Express app jisme asli errorHandler lagaya hai, taaki production-mode me 500 bhi test kar sakein
  // (full app mein teaching routes production mein mounted hi nahi hote).
  function hostApp(env) {
    const capture = createLogCapture();
    const app = express();
    app.set('env', env);
    app.use(requestId);
    app.use(createRequestLogger(capture.logger));
    app.get('/boom', () => {
      throw new Error('internal detail with stack');
    });
    app.get('/async-boom', async () => {
      throw new TypeError('cannot read properties of undefined');
    });
    app.use(notFound);
    app.use(createErrorHandler({ logger: capture.logger }));
    return { app, ...capture };
  }

  test.each(['production', 'development'])('%s: 500s expose nothing internal', async (env) => {
    const { app } = hostApp(env);
    for (const path of ['/boom', '/async-boom']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
      });
      expect(res.text).not.toMatch(/internal detail|TypeError|stack|node_modules|\.js:\d+/);
    }
  });

  test('production: unknown route, same as everywhere', async () => {
    const { app } = makeApp('production');
    const res = await request(app).get('/nope');
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('production full app: teaching error routes are not mounted', async () => {
    const { app } = makeApp('production');
    expect((await request(app).get(`${ERR}/sync-throw`)).status).toBe(404);
  });
});

// Response ke headers jaane ke baad error: JSON error nahi bhej sakte; connection band hota hai aur client ko
// truncated response milta hai. Isliye yahan asli server (app.listen(0)) aur raw `http.get` use hota hai.
describe('error after the response has started', () => {
  test('client sees a truncated response (connection closed), error is logged with headersSent', async () => {
    const { app, entries } = makeApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const outcome = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${server.address().port}${ERR}/after-headers`, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('error', () => {}); // socket destroyed: 'aborted' error expected
          res.on('close', () => resolve({ status: res.statusCode, body, complete: res.complete }));
        });
      });
      expect(outcome.status).toBe(200); // headers were already out
      expect(outcome.body).toBe('partial'); // and no JSON error body was appended
      expect(outcome.complete).toBe(false); // truncated -> client can tell it failed
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(entries().find((e) => e.msg === 'unexpected error')).toMatchObject({
      level: 50,
      headersSent: true,
    });
  });
});
