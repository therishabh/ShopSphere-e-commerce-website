import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
const EX = '/api/v1/examples';

const makeApp = (env = 'test') => createApp({ config: loadConfig({ NODE_ENV: env }) });

describe('404 and unknown routes', () => {
  const app = makeApp();

  test.each([
    ['GET', '/nope'],
    ['POST', '/nope'],
    ['GET', '/api'],
    ['GET', '/api/v1'],
    ['GET', '/api/v2/products'],
    ['GET', `${EX}/does-not-exist`],
  ])('%s %s -> safe JSON 404', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('404 body does not reflect the requested path or leak internals', async () => {
    const res = await request(app).get('/secret-%3Cscript%3E');
    expect(res.text).not.toMatch(/script|secret|stack|at /i);
  });

  test('undecodable URL parameter -> 400 JSON, not an HTML stack trace', async () => {
    const res = await request(app).get(`${EX}/echo/%E0%A4%A`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Bad Request' } });
  });
});

describe('module routers are mounted but expose no endpoints yet', () => {
  const app = makeApp();

  test.each(['auth', 'users', 'sellers', 'products', 'cart', 'orders', 'admin'])(
    '/api/v1/%s has no fake endpoints',
    async (name) => {
      for (const path of [`/api/v1/${name}`, `/api/v1/${name}/anything`]) {
        const res = await request(app).get(path);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    },
  );
});

describe('examples are not mounted in production', () => {
  test('GET examples -> 404 when NODE_ENV=production', async () => {
    const res = await request(makeApp('production')).get(`${EX}/ping`);
    expect(res.status).toBe(404);
  });
});

describe('res.send / params / query', () => {
  const app = makeApp();

  test('res.send with an explicit text type', async () => {
    const res = await request(app).get(`${EX}/ping`);
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/plain');
    expect(res.text).toBe('pong');
  });

  test('route params are URL-decoded', async () => {
    const res = await request(app).get(`${EX}/echo/hi%20there`);
    expect(res.body.params).toEqual({ value: 'hi there' });
  });

  test('repeated query keys become arrays; bracket syntax is not expanded', async () => {
    const res = await request(app).get(`${EX}/echo/x?x=1&x=2&a[b]=3`);
    expect(res.body.query).toEqual({ x: ['1', '2'], 'a[b]': '3' });
  });
});

describe('body parsing', () => {
  const app = makeApp();

  test('JSON body is parsed', async () => {
    const res = await request(app)
      .post(`${EX}/echo/json`)
      .send({ a: 1, b: [2] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { a: 1, b: [2] } });
  });

  test('malformed JSON -> 400 with a fixed message', async () => {
    const res = await request(app)
      .post(`${EX}/echo/json`)
      .set('Content-Type', 'application/json')
      .send('{"a": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Malformed request body' } });
  });

  test('non-JSON content type is rejected by route middleware with 415', async () => {
    const res = await request(app).post(`${EX}/echo/json`).type('text/plain').send('hi');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('body over the 100kb limit -> 413', async () => {
    const res = await request(app)
      .post(`${EX}/echo/json`)
      .send({ a: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('URL-encoded body is parsed (flat, extended=false)', async () => {
    const res = await request(app).post(`${EX}/echo/form`).type('form').send('a[b]=1&x=1&x=2');
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ 'a[b]': '1', x: ['1', '2'] });
  });

  test('JSON sent to the form endpoint -> 415', async () => {
    const res = await request(app).post(`${EX}/echo/form`).send({ a: 1 });
    expect(res.status).toBe(415);
  });
});

describe('REST status codes on the notes example', () => {
  let app;
  beforeEach(() => {
    app = makeApp();
  });

  const create = (text = 'hello') => request(app).post(`${EX}/notes`).send({ text });

  test('POST -> 201 with Location, then GET -> 200', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`${EX}/notes/1`);
    expect(created.body).toEqual({ id: 1, text: 'hello' });

    const got = await request(app).get(created.headers.location);
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ id: 1, text: 'hello' });
  });

  test('list honours ?limit', async () => {
    await create('a');
    await create('b');
    await create('c');
    const res = await request(app).get(`${EX}/notes?limit=2`);
    expect(res.body.items.map((n) => n.text)).toEqual(['a', 'b']);
  });

  test('PUT replaces -> 200; missing -> 404', async () => {
    await create();
    const ok = await request(app).put(`${EX}/notes/1`).send({ text: 'changed' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: 1, text: 'changed' });
    expect((await request(app).put(`${EX}/notes/99`).send({ text: 'x' })).status).toBe(404);
  });

  test('DELETE -> 204 with empty body, then GET -> 404', async () => {
    await create();
    const del = await request(app).delete(`${EX}/notes/1`);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    expect((await request(app).get(`${EX}/notes/1`)).status).toBe(404);
    expect((await request(app).delete(`${EX}/notes/1`)).status).toBe(404);
  });

  test.each([
    [{}, 'missing text'],
    [{ text: '' }, 'empty text'],
    [{ text: 'x'.repeat(201) }, 'too long'],
    [{ text: 'ok', extra: 1 }, 'unexpected field'],
    [{ text: 5 }, 'wrong type'],
  ])('invalid body %j (%s) -> 400 VALIDATION_ERROR', async (body) => {
    const res = await request(app).post(`${EX}/notes`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test('POST with JSON content type but empty body -> 400, not a crash', async () => {
    const res = await request(app).post(`${EX}/notes`).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  test.each(['abc', '0', '-1', '1.5', '01'])(
    'non-numeric id "%s" is rejected by route middleware with 400',
    async (id) => {
      const res = await request(app).get(`${EX}/notes/${id}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARAMETER');
    },
  );

  test('unsupported method -> 405 with Allow header', async () => {
    const collection = await request(app).delete(`${EX}/notes`);
    expect(collection.status).toBe(405);
    expect(collection.headers.allow).toBe('GET, POST, HEAD, OPTIONS');

    const item = await request(app).post(`${EX}/notes/1`).send({});
    expect(item.status).toBe(405);
    expect(item.headers.allow).toBe('GET, PUT, DELETE, HEAD, OPTIONS');
  });

  test('OPTIONS -> 204 with Allow header; HEAD mirrors GET', async () => {
    const options = await request(app).options(`${EX}/notes`);
    expect(options.status).toBe(204);
    expect(options.headers.allow).toBe('GET, POST, HEAD, OPTIONS');

    await create();
    const head = await request(app).head(`${EX}/notes/1`);
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
  });

  test('route ordering: /notes/latest is not captured by /notes/:id', async () => {
    expect((await request(app).get(`${EX}/notes/latest`)).status).toBe(404); // empty, a clean 404, not 400
    await create('first');
    await create('second');
    const res = await request(app).get(`${EX}/notes/latest`);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('second');
  });

  test('state is per app instance', async () => {
    await create();
    const other = makeApp();
    expect((await request(other).get(`${EX}/notes`)).body.items).toEqual([]);
  });
});

describe('nested router: /notes/:noteId/comments', () => {
  let app;
  beforeEach(async () => {
    app = makeApp();
    await request(app).post(`${EX}/notes`).send({ text: 'parent' });
  });

  test('parent param is visible; POST -> 201 + Location, GET lists', async () => {
    const created = await request(app).post(`${EX}/notes/1/comments`).send({ text: 'nice' });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`${EX}/notes/1/comments/1`);

    const list = await request(app).get(`${EX}/notes/1/comments`);
    expect(list.body).toEqual({ items: [{ id: 1, text: 'nice' }] });
  });

  test('comments of a missing note -> 404; bad noteId -> 400', async () => {
    expect((await request(app).get(`${EX}/notes/42/comments`)).status).toBe(404);
    expect((await request(app).get(`${EX}/notes/abc/comments`)).status).toBe(400);
  });

  test('deleting the note removes its comments route', async () => {
    await request(app).post(`${EX}/notes/1/comments`).send({ text: 'x' });
    await request(app).delete(`${EX}/notes/1`);
    expect((await request(app).get(`${EX}/notes/1/comments`)).status).toBe(404);
  });

  test('wrong method -> 405', async () => {
    const res = await request(app).delete(`${EX}/notes/1/comments`);
    expect(res.status).toBe(405);
  });
});

describe('res.redirect', () => {
  test('301 to a fixed same-origin location', async () => {
    const res = await request(makeApp()).get(`${EX}/old-notes`).redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`${EX}/notes`);
  });
});

describe('mount order', () => {
  const app = makeApp();

  test('health is reachable and unaffected by body parsing', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(res.status).toBe(200);
  });

  test('body parsers apply under /api/v1 only: bad JSON outside it is not parsed', async () => {
    const res = await request(app)
      .post('/nope')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(res.status).toBe(404);
  });
});
