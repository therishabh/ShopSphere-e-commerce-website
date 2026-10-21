import request from 'supertest';
import { Validator } from '@seriousme/openapi-schema-validator';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import {
  createDemoProduct,
  getDemoProduct,
  listDemoProducts,
} from '../../src/examples/validation-examples.routes.js';
import { assertMatchesContract } from '../helpers/contract.js';

const makeApp = (env = {}) =>
  createApp({ config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }) });

describe('GET /openapi.json', () => {
  test('serves a valid OpenAPI 3.0 document as JSON', async () => {
    const res = await request(makeApp()).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    const result = await new Validator().validate(structuredClone(res.body));
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  test('is generated once and identical on every request', async () => {
    const app = makeApp();
    const a = await request(app).get('/openapi.json');
    const b = await request(app).get('/openapi.json');
    expect(a.body).toEqual(b.body);
  });

  test('documents exactly the contract-mounted operations', async () => {
    const { body } = await request(makeApp()).get('/openapi.json');
    const operations = Object.entries(body.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(
        ([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`,
      ),
    );
    expect(operations.sort()).toEqual([
      'GET /examples/validation/demo-products listDemoProducts',
      'GET /examples/validation/demo-products/{productId} getDemoProduct',
      'POST /examples/validation/demo-products createDemoProduct',
    ]);
  });

  test('documented query parameters match what the validator really accepts', async () => {
    const app = makeApp();
    const { body } = await request(app).get('/openapi.json');
    const documented = body.paths['/examples/validation/demo-products'].get.parameters.map(
      (p) => p.name,
    );
    for (const name of documented) {
      const sample = {
        page: '1',
        limit: '1',
        sort: 'price',
        q: 'x',
        category: 'shoes',
        minPrice: '1',
        maxPrice: '2',
        inStock: 'true',
      }[name];
      const res = await request(app).get(
        `/api/v1/examples/validation/demo-products?${name}=${sample}`,
      );
      expect(res.status).toBe(200);
    }
    const undocumented = await request(app).get(
      '/api/v1/examples/validation/demo-products?notDocumented=1',
    );
    expect(undocumented.status).toBe(400);
  });

  test('documented body fields match what the validator really requires', async () => {
    const app = makeApp();
    const { body } = await request(app).get('/openapi.json');
    const schema =
      body.paths['/examples/validation/demo-products'].post.requestBody.content['application/json']
        .schema;
    const complete = {
      sku: 'SKU-001',
      name: 'n',
      category: 'c',
      priceCents: 1,
      currency: 'INR',
      stock: 0,
    };
    expect(
      (await request(app).post('/api/v1/examples/validation/demo-products').send(complete)).status,
    ).toBe(201);
    for (const field of schema.required) {
      const without = { ...complete };
      delete without[field];
      const res = await request(app)
        .post('/api/v1/examples/validation/demo-products')
        .send(without);
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.path)).toContain(field);
    }
    const extra = await request(app)
      .post('/api/v1/examples/validation/demo-products')
      .send({ ...complete, sku: 'SKU-002', extra: 1 });
    expect(extra.status).toBe(400);
  });

  test('every documented operation is reachable at its documented method and path', async () => {
    const app = makeApp();
    const { body: spec } = await request(app).get('/openapi.json');
    const base = `/api/v1${'/examples/validation/demo-products'}`;
    const [first] = (await request(app).get(base)).body.items;

    const reachable = {
      listDemoProducts: [() => request(app).get(base), listDemoProducts, 200],
      getDemoProduct: [() => request(app).get(`${base}/${first.id}`), getDemoProduct, 200],
      createDemoProduct: [
        () =>
          request(app).post(base).send({
            sku: 'NEW-001',
            name: 'n',
            category: 'c',
            priceCents: 1,
            currency: 'INR',
            stock: 1,
          }),
        createDemoProduct,
        201,
      ],
    };

    const documentedIds = Object.values(spec.paths).flatMap((methods) =>
      Object.values(methods).map((op) => op.operationId),
    );
    expect(Object.keys(reachable).sort()).toEqual(documentedIds.sort());

    for (const [call, contract, status] of Object.values(reachable)) {
      const res = await call();
      expect(res.status).toBe(status);
      assertMatchesContract(contract, res);
    }
  });

  test('documented statuses are the only ones the routes produce', async () => {
    const app = makeApp();
    const base = '/api/v1/examples/validation/demo-products';
    const responses = [
      [listDemoProducts, await request(app).get(`${base}?limit=0`)],
      [getDemoProduct, await request(app).get(`${base}/not-a-uuid`)],
      [getDemoProduct, await request(app).get(`${base}/3f2b8c1e-6a4d-4e0b-9c1a-2b7d5e8f9a10`)],
      [createDemoProduct, await request(app).post(base).type('text/plain').send('x')],
      [createDemoProduct, await request(app).post(base).send({})],
    ];
    for (const [contract, res] of responses) assertMatchesContract(contract, res);
  });
});

describe('Swagger UI at /docs', () => {
  test('/docs redirects to /docs/ and the page loads the UI from same-origin files', async () => {
    const app = makeApp();
    const redirect = await request(app).get('/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/docs/');

    const page = await request(app).get('/docs/');
    expect(page.status).toBe(200);
    expect(page.type).toBe('text/html');
    expect(page.text).toContain('swagger-ui');
    expect(page.text).toContain('./swagger-initializer.js');
    expect(page.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(page.text).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  test('works under Helmet CSP: no inline script needed, script-src is self only', async () => {
    const res = await request(makeApp()).get('/docs/');
    expect(res.headers['content-security-policy']).toMatch(/script-src 'self'(;|$)/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('initializer points at the spec relative to /docs/', async () => {
    const res = await request(makeApp()).get('/docs/swagger-initializer.js');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/javascript');
    expect(res.text).toContain("url: '../openapi.json'");
    expect(res.text).not.toContain('petstore');
  });

  test('UI bundle and stylesheet are served', async () => {
    const app = makeApp();
    expect((await request(app).get('/docs/swagger-ui-bundle.js')).status).toBe(200);
    expect((await request(app).get('/docs/swagger-ui.css')).status).toBe(200);
  });

  test('unknown files under /docs fall through to the safe 404', async () => {
    const res = await request(makeApp()).get('/docs/nope.js');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('docs switch', () => {
  test.each(['/docs/', '/openapi.json', '/docs/swagger-initializer.js'])(
    '%s is off by default in production',
    async (path) => {
      const res = await request(makeApp({ NODE_ENV: 'production' })).get(path);
      expect(res.status).toBe(404);
    },
  );

  test('API_DOCS_ENABLED=true turns docs on in production (and the spec is empty: examples are not mounted)', async () => {
    const app = makeApp({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' });
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual({});
    expect((await request(app).get('/docs/')).status).toBe(200);
  });

  test('API_DOCS_ENABLED=false turns docs off in development', async () => {
    const res = await request(makeApp({ NODE_ENV: 'development', API_DOCS_ENABLED: 'false' })).get(
      '/openapi.json',
    );
    expect(res.status).toBe(404);
  });

  test('contract routes are not mounted in production', async () => {
    const res = await request(makeApp({ NODE_ENV: 'production' })).get(
      '/api/v1/examples/validation/demo-products',
    );
    expect(res.status).toBe(404);
  });
});
