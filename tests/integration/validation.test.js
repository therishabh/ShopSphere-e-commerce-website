import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import {
  createDemoProduct,
  getDemoProduct,
  listDemoProducts,
} from '../../src/examples/validation-examples.routes.js';
import { assertMatchesContract } from '../helpers/contract.js';

const BASE = '/api/v1/examples/validation/demo-products';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const makeApp = () => createApp({ config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });

const validProduct = {
  sku: 'PEN-BLUE-01',
  name: 'Blue pen',
  category: 'stationery',
  priceCents: 1500,
  currency: 'INR',
  stock: 40,
};

async function list(app, query = '') {
  const res = await request(app).get(`${BASE}${query}`);
  assertMatchesContract(listDemoProducts, res);
  return res;
}

describe('GET demo-products: pagination', () => {
  test('defaults: page 1, limit 20, newest first, full contract', async () => {
    const res = await list(makeApp());
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 12,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
    expect(res.body.items).toHaveLength(12);
    expect(res.body.items[0].sku).toBe('DEMO-012');
    expect(res.body.items.at(-1).sku).toBe('DEMO-001');
  });

  test('page and limit slice the result and drive the metadata', async () => {
    const app = makeApp();
    const first = await list(app, '?limit=5&page=1&sort=createdAt');
    const second = await list(app, '?limit=5&page=2&sort=createdAt');
    const third = await list(app, '?limit=5&page=3&sort=createdAt');
    expect(first.body.items.map((p) => p.sku)).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
      'DEMO-004',
      'DEMO-005',
    ]);
    expect(second.body.items.map((p) => p.sku)).toEqual([
      'DEMO-006',
      'DEMO-007',
      'DEMO-008',
      'DEMO-009',
      'DEMO-010',
    ]);
    expect(third.body.items.map((p) => p.sku)).toEqual(['DEMO-011', 'DEMO-012']);
    expect(first.body.pagination).toMatchObject({
      page: 1,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    });
    expect(second.body.pagination).toMatchObject({ page: 2, hasNext: true, hasPrev: true });
    expect(third.body.pagination).toMatchObject({ page: 3, hasNext: false, hasPrev: true });
  });

  test('a page past the end is a 200 with no items, not an error', async () => {
    const res = await list(makeApp(), '?limit=5&page=4');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.pagination).toMatchObject({
      page: 4,
      total: 12,
      totalPages: 3,
      hasNext: false,
      hasPrev: true,
    });
  });

  test('limit bounds: 1 and 100 are allowed', async () => {
    const app = makeApp();
    expect((await list(app, '?limit=1')).body.items).toHaveLength(1);
    expect((await list(app, '?limit=100')).status).toBe(200);
  });
});

describe('GET demo-products: sorting', () => {
  test.each([
    ['price', 'priceCents', 1],
    ['-price', 'priceCents', -1],
    ['name', 'name', 1],
    ['-createdAt', 'createdAt', -1],
  ])('sort=%s orders by %s', async (sort, column, direction) => {
    const res = await list(makeApp(), `?sort=${sort}`);
    const values = res.body.items.map((p) => p[column]);
    const expected = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * direction);
    expect(values).toEqual(expected);
  });

  test('multiple fields: category-like ties are broken by the next field', async () => {
    const res = await list(makeApp(), '?inStock=true&sort=-price,name&limit=3');
    const prices = res.body.items.map((p) => p.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });
});

describe('GET demo-products: filters and search', () => {
  test('category filter', async () => {
    const res = await list(makeApp(), '?category=shoes');
    expect(res.body.pagination.total).toBe(4);
    expect(res.body.items.every((p) => p.category === 'shoes')).toBe(true);
  });

  test('price range is inclusive', async () => {
    const res = await list(makeApp(), '?minPrice=50000&maxPrice=100000&sort=price');
    expect(res.body.items.map((p) => p.priceCents)).toEqual([50000, 75000, 100000]);
  });

  test('inStock true and false are complementary', async () => {
    const app = makeApp();
    const inStock = await list(app, '?inStock=true');
    const outOfStock = await list(app, '?inStock=false');
    expect(inStock.body.items.every((p) => p.stock > 0)).toBe(true);
    expect(outOfStock.body.items.every((p) => p.stock === 0)).toBe(true);
    expect(inStock.body.pagination.total + outOfStock.body.pagination.total).toBe(12);
  });

  test('search is case-insensitive and trimmed', async () => {
    const res = await list(makeApp(), '?q=%20WATCHES%20');
    expect(res.body.pagination.total).toBe(4);
    expect(res.body.items.every((p) => p.category === 'watches')).toBe(true);
  });

  test('search with no match returns an empty page with total 0', async () => {
    const res = await list(makeApp(), '?q=zzz');
    expect(res.body).toEqual({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });
  });

  test('filters, search, sort and pagination combine', async () => {
    const res = await list(
      makeApp(),
      '?category=shoes&inStock=true&q=demo&sort=-price&limit=2&page=2',
    );
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.items.every((p) => p.category === 'shoes' && p.stock > 0)).toBe(true);
  });
});

describe('GET demo-products: invalid queries -> 400 with field details', () => {
  test.each([
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'limit=1e2',
    'limit=%2010',
    'page=0',
    'page=10001',
    'page=1&page=2',
    'sort=password',
    'sort=priceCents',
    'sort=-',
    'sort=price,price',
    'sort=price,createdAt,name,price',
    'sort=__proto__',
    'sort=constructor',
    'sort=price%3BDROP%20TABLE%20users',
    'minPrice=-1',
    'minPrice=1.5',
    'minPrice=500&maxPrice=100',
    'maxPrice=999999999999',
    'inStock=yes',
    'inStock=1',
    'category=Home%20Decor',
    'category=UPPER',
    'q=',
    'q=%20%20',
    `q=${'x'.repeat(101)}`,
    'q=a%0Ab',
    'unknown=1',
    'role=admin',
    'sortBy=price',
    'filter[category]=shoes',
  ])('?%s', async (query) => {
    const res = await request(makeApp()).get(`${BASE}?${query}`);
    expect(res.status).toBe(400);
    assertMatchesContract(listDemoProducts, res);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(res.body.error.details.every((d) => d.source === 'query')).toBe(true);
  });

  test('every problem is reported together, with the offending field named', async () => {
    const res = await request(makeApp()).get(`${BASE}?limit=0&page=x&sort=password&bogus=1`);
    const paths = res.body.error.details.map((d) => d.path).sort();
    expect(paths).toEqual(['', 'limit', 'page', 'sort']);
  });

  test('error responses never leak internals', async () => {
    const res = await request(makeApp()).get(`${BASE}?sort=password`);
    expect(res.text).not.toMatch(/stack|node_modules|priceCents|at .*\.js/);
  });
});

describe('GET demo-products/:productId', () => {
  test('existing id -> 200 and the contract shape', async () => {
    const app = makeApp();
    const [first] = (await list(app)).body.items;
    const res = await request(app).get(`${BASE}/${first.id}`);
    assertMatchesContract(getDemoProduct, res);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(first);
  });

  test('well-formed but unknown id -> 404 NOT_FOUND', async () => {
    const res = await request(makeApp()).get(`${BASE}/3f2b8c1e-6a4d-4e0b-9c1a-2b7d5e8f9a10`);
    assertMatchesContract(getDemoProduct, res);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test.each([
    'abc',
    '123',
    '0',
    '-1',
    '3f2b8c1e-6a4d-4e0b-9c1a-2b7d5e8f9a1',
    '3f2b8c1e-6a4d-4e0b-9c1a-2b7d5e8f9a100',
    'zzzzzzzz-6a4d-4e0b-9c1a-2b7d5e8f9a10',
    "1'%20OR%20'1'='1",
    '..%2f..%2fetc%2fpasswd',
    '%3Cscript%3E',
  ])('invalid id %s -> 400 with source params', async (id) => {
    const res = await request(makeApp()).get(`${BASE}/${id}`);
    assertMatchesContract(getDemoProduct, res);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ source: 'params', path: 'productId' });
  });
});

describe('POST demo-products', () => {
  test('valid body -> 201, Location, server-assigned id and createdAt, then it is listed', async () => {
    const app = makeApp();
    const res = await request(app).post(BASE).send(validProduct);
    assertMatchesContract(createDemoProduct, res);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(validProduct);
    expect(res.body.id).toMatch(UUID_PATTERN);
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    expect(res.headers.location).toBe(`${BASE}/${res.body.id}`);

    const fetched = await request(app).get(res.headers.location);
    expect(fetched.body).toEqual(res.body);
    expect((await list(app)).body.pagination.total).toBe(13);
  });

  test('strings are trimmed and optional fields are accepted', async () => {
    const res = await request(makeApp())
      .post(BASE)
      .send({ ...validProduct, name: '  Blue pen  ', description: '  smooth  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Blue pen', description: 'smooth' });
  });

  test('duplicate sku -> 409 CONFLICT', async () => {
    const app = makeApp();
    await request(app).post(BASE).send(validProduct);
    const res = await request(app).post(BASE).send(validProduct);
    assertMatchesContract(createDemoProduct, res);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test.each([
    ['empty object', {}],
    ['missing sku', { ...validProduct, sku: undefined }],
    ['lowercase sku', { ...validProduct, sku: 'pen-blue' }],
    ['sku too short', { ...validProduct, sku: 'AB' }],
    ['empty name', { ...validProduct, name: '   ' }],
    ['name too long', { ...validProduct, name: 'x'.repeat(121) }],
    ['description too long', { ...validProduct, description: 'x'.repeat(2001) }],
    ['bad category slug', { ...validProduct, category: 'Home Decor' }],
    ['price as string', { ...validProduct, priceCents: '1500' }],
    ['fractional price', { ...validProduct, priceCents: 15.5 }],
    ['negative price', { ...validProduct, priceCents: -1 }],
    ['price above maximum', { ...validProduct, priceCents: 100_000_001 }],
    ['unknown currency', { ...validProduct, currency: 'GBP' }],
    ['fractional stock', { ...validProduct, stock: 1.5 }],
    ['negative stock', { ...validProduct, stock: -1 }],
    ['stock above maximum', { ...validProduct, stock: 1_000_001 }],
    ['null value', { ...validProduct, stock: null }],
    ['unexpected field id', { ...validProduct, id: '3f2b8c1e-6a4d-4e0b-9c1a-2b7d5e8f9a10' }],
    ['unexpected field role', { ...validProduct, role: 'admin' }],
    ['unexpected field createdAt', { ...validProduct, createdAt: '2020-01-01T00:00:00.000Z' }],
    ['unexpected nested field', { ...validProduct, __proto__: { admin: true }, isAdmin: true }],
    ['array instead of object', []],
  ])('%s -> 400 VALIDATION_ERROR (body)', async (_name, body) => {
    const res = await request(makeApp())
      .post(BASE)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));
    expect(res.status).toBe(400);
    assertMatchesContract(createDemoProduct, res);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.every((d) => d.source === 'body')).toBe(true);
  });

  test('rejected input is never stored', async () => {
    const app = makeApp();
    await request(app)
      .post(BASE)
      .send({ ...validProduct, role: 'admin' });
    expect((await list(app)).body.pagination.total).toBe(12);
  });

  test('the unexpected field is named in the error', async () => {
    const res = await request(makeApp())
      .post(BASE)
      .send({ ...validProduct, role: 'admin' });
    expect(res.body.error.details[0].message).toMatch(/role/);
  });

  test('all body problems are reported at once', async () => {
    const res = await request(makeApp()).post(BASE).send({ sku: 'x', priceCents: -1 });
    expect(res.body.error.details.length).toBeGreaterThan(3);
  });

  test('non-JSON content type -> 415', async () => {
    const res = await request(makeApp()).post(BASE).type('text/plain').send('sku=1');
    assertMatchesContract(createDemoProduct, res);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('form encoded body is not accepted either', async () => {
    const res = await request(makeApp()).post(BASE).type('form').send('sku=PEN-1&name=x');
    expect(res.status).toBe(415);
  });

  test('malformed JSON -> 400 BAD_REQUEST with a fixed message', async () => {
    const res = await request(makeApp())
      .post(BASE)
      .set('Content-Type', 'application/json')
      .send('{"sku": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Malformed request body' });
  });

  test.each(['"hello"', '42', 'null', 'true'])(
    'top-level JSON %s is rejected by the parser as 400 BAD_REQUEST',
    async (raw) => {
      const res = await request(makeApp())
        .post(BASE)
        .set('Content-Type', 'application/json')
        .send(raw);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    },
  );

  test('empty JSON body -> validation error listing required fields', async () => {
    const res = await request(makeApp()).post(BASE).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['sku', 'name', 'category', 'priceCents', 'currency', 'stock']),
    );
  });

  test('body over the size limit -> 413 before validation', async () => {
    const res = await request(makeApp())
      .post(BASE)
      .send({ ...validProduct, description: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe('response contract', () => {
  test('success responses carry no envelope: a single resource is the bare object', async () => {
    const res = await request(makeApp()).post(BASE).send(validProduct);
    expect(Object.keys(res.body).sort()).toEqual(
      ['category', 'createdAt', 'currency', 'id', 'name', 'priceCents', 'sku', 'stock'].sort(),
    );
  });

  test('collections are { items, pagination } and nothing else', async () => {
    const res = await list(makeApp());
    expect(Object.keys(res.body).sort()).toEqual(['items', 'pagination']);
  });

  test('error responses are { error: { code, message, details? } } and nothing else', async () => {
    const res = await request(makeApp()).get(`${BASE}?limit=0`);
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'details', 'message']);
  });
});
