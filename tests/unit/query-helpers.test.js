import { z } from 'zod';
import { booleanString, intString, searchTerm, slug } from '../../src/http/query/fields.js';
import { buildPagination, resolvePagination } from '../../src/http/query/pagination.js';
import { parseSort, sortFieldSchema } from '../../src/http/query/sorting.js';
import { buildListQuerySchema } from '../../src/http/query/list-query.js';
import { productListQuerySchema } from '../../src/modules/products/products.schemas.js';

const ok = (schema, value) => schema.safeParse(value);

describe('intString', () => {
  const schema = intString({ min: 1, max: 100 });

  test.each([
    ['1', 1],
    ['25', 25],
    ['100', 100],
  ])('accepts %p -> %p', (input, expected) => {
    expect(ok(schema, input)).toEqual({ success: true, data: expected });
  });

  test.each([
    '',
    ' 5',
    '5 ',
    '1e3',
    '-1',
    '+3',
    '1.5',
    'abc',
    '0',
    '101',
    '1234567890123456',
    null,
    5,
    ['1', '2'],
  ])('rejects %p', (input) => {
    expect(ok(schema, input).success).toBe(false);
  });
});

describe('booleanString', () => {
  test('maps only the exact strings true and false', () => {
    expect(ok(booleanString(), 'true').data).toBe(true);
    expect(ok(booleanString(), 'false').data).toBe(false);
  });

  test.each(['TRUE', '1', '0', 'yes', '', true, false])('rejects %p', (input) => {
    expect(ok(booleanString(), input).success).toBe(false);
  });
});

describe('searchTerm', () => {
  test('trims and keeps unicode', () => {
    expect(ok(searchTerm(), '  chappal  ').data).toBe('chappal');
    expect(ok(searchTerm(), 'चप्पल').data).toBe('चप्पल');
  });

  test.each(['', '   ', 'a\nb', 'a\u0000b', 'x'.repeat(101)])('rejects %j', (input) => {
    expect(ok(searchTerm(), input).success).toBe(false);
  });

  test('max is configurable', () => {
    expect(ok(searchTerm({ max: 3 }), 'abcd').success).toBe(false);
  });
});

describe('slug', () => {
  test.each(['shoes', 'home-decor', 'a1-b2'])('accepts %s', (value) => {
    expect(ok(slug(), value).success).toBe(true);
  });

  test.each(['Shoes', 'home decor', 'home--decor', '-shoes', 'shoes-', '', 'x'.repeat(61), 'a/b'])(
    'rejects %j',
    (value) => {
      expect(ok(slug(), value).success).toBe(false);
    },
  );
});

describe('sorting allowlist', () => {
  const allowed = { price: 'priceCents', createdAt: 'createdAt', name: 'name' };
  const schema = sortFieldSchema(allowed);

  test('maps API names to database columns and parses direction', () => {
    expect(ok(schema, '-price,name').data).toEqual([
      { field: 'price', column: 'priceCents', direction: 'desc' },
      { field: 'name', column: 'name', direction: 'asc' },
    ]);
  });

  test.each([
    'password',
    'priceCents',
    'price;DROP TABLE users',
    "price' OR '1'='1",
    'price,',
    ',price',
    '-',
    '',
    ' price',
    'price name',
    '__proto__',
    'constructor',
    'toString',
    '-__proto__',
    'price,createdAt,name,price',
    'price,-price',
    'price,price',
    'PRICE',
  ])('rejects %j', (value) => {
    expect(ok(schema, value).success).toBe(false);
  });

  test('accepts the maximum of three distinct fields', () => {
    expect(ok(schema, 'price,createdAt,-name').data).toHaveLength(3);
  });

  test('duplicate fields produce a readable issue', () => {
    const result = ok(schema, 'price,-price');
    expect(result.error.issues[0].message).toMatch(/only once/);
  });

  test('parseSort applies the same allowlist to developer-provided defaults', () => {
    expect(parseSort(allowed, '-createdAt')).toEqual([
      { field: 'createdAt', column: 'createdAt', direction: 'desc' },
    ]);
    expect(() => parseSort(allowed, '-secret')).toThrow();
  });

  test.each([{}, { 'a|b': 'x' }, { 'price)': 'x' }, { '1price': 'x' }])(
    'refuses an unsafe or empty allowlist %j',
    (bad) => {
      expect(() => sortFieldSchema(bad)).toThrow(/allowlist/);
    },
  );
});

describe('pagination helpers', () => {
  test('resolvePagination applies defaults and computes the offset', () => {
    expect(resolvePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, offset: 20 });
    expect(resolvePagination({ page: 2 }, { defaultLimit: 5 })).toEqual({
      page: 2,
      limit: 5,
      offset: 5,
    });
  });

  test.each([
    [
      { page: 1, limit: 20, total: 0 },
      { totalPages: 0, hasNext: false, hasPrev: false },
    ],
    [
      { page: 1, limit: 20, total: 20 },
      { totalPages: 1, hasNext: false, hasPrev: false },
    ],
    [
      { page: 1, limit: 20, total: 21 },
      { totalPages: 2, hasNext: true, hasPrev: false },
    ],
    [
      { page: 3, limit: 20, total: 45 },
      { totalPages: 3, hasNext: false, hasPrev: true },
    ],
    [
      { page: 9, limit: 20, total: 45 },
      { totalPages: 3, hasNext: false, hasPrev: true },
    ],
  ])('buildPagination %j', (input, expected) => {
    expect(buildPagination(input)).toEqual({ ...input, ...expected });
  });
});

describe('buildListQuerySchema', () => {
  const schema = buildListQuerySchema({
    sortable: { price: 'priceCents' },
    defaultSort: 'price',
    search: true,
    filters: { color: z.enum(['red', 'blue']) },
    defaultLimit: 5,
  });

  test('empty query -> defaults', () => {
    expect(ok(schema, {}).data).toEqual({
      page: 1,
      limit: 5,
      offset: 0,
      sort: [{ field: 'price', column: 'priceCents', direction: 'asc' }],
      filters: {},
    });
  });

  test('full query is normalized', () => {
    expect(
      ok(schema, { page: '2', limit: '10', sort: '-price', q: ' lamp ', color: 'red' }).data,
    ).toEqual({
      page: 2,
      limit: 10,
      offset: 10,
      sort: [{ field: 'price', column: 'priceCents', direction: 'desc' }],
      q: 'lamp',
      filters: { color: 'red' },
    });
  });

  test.each([
    [{ colour: 'red' }, 'unknown key'],
    [{ color: 'green' }, 'filter value outside enum'],
    [{ page: '0' }, 'page below minimum'],
    [{ limit: '101' }, 'limit above maximum'],
    [{ page: '10001' }, 'page above maximum'],
    [{ sort: 'color' }, 'sort field outside allowlist'],
    [{ q: '' }, 'empty search'],
    [{ page: ['1', '2'] }, 'repeated key'],
  ])('rejects %j (%s)', (input) => {
    expect(ok(schema, input).success).toBe(false);
  });

  test('search is only accepted when enabled', () => {
    const noSearch = buildListQuerySchema({
      sortable: { price: 'priceCents' },
      defaultSort: 'price',
    });
    expect(ok(noSearch, { q: 'x' }).success).toBe(false);
  });

  test('an invalid default sort fails at build time, not at request time', () => {
    expect(() =>
      buildListQuerySchema({ sortable: { price: 'priceCents' }, defaultSort: '-secret' }),
    ).toThrow();
  });

  test('checkFilters can reject combinations and its issue path is reported', () => {
    const ranged = buildListQuerySchema({
      sortable: { price: 'priceCents' },
      defaultSort: 'price',
      filters: { min: intString({ min: 0, max: 10 }), max: intString({ min: 0, max: 10 }) },
      checkFilters: (value, ctx) => {
        if (value.min > value.max)
          ctx.addIssue({ code: 'custom', path: ['min'], message: 'min > max' });
      },
    });
    const result = ok(ranged, { min: '5', max: '1' });
    expect(result.success).toBe(false);
    expect(result.error.issues[0]).toMatchObject({ path: ['min'], message: 'min > max' });
    expect(ok(ranged, { min: '1', max: '5' }).data.filters).toEqual({ min: 1, max: 5 });
  });
});

describe('productListQuerySchema', () => {
  test('sort columns come only from the allowlist map', () => {
    const { sort } = ok(productListQuerySchema, { sort: 'price,-name' }).data;
    expect(sort.map((s) => s.column)).toEqual(['priceCents', 'name']);
  });

  test('default sort is newest first', () => {
    expect(ok(productListQuerySchema, {}).data.sort).toEqual([
      { field: 'createdAt', column: 'createdAt', direction: 'desc' },
    ]);
  });

  test('minPrice above maxPrice is rejected', () => {
    expect(ok(productListQuerySchema, { minPrice: '500', maxPrice: '100' }).success).toBe(false);
    expect(ok(productListQuerySchema, { minPrice: '100', maxPrice: '100' }).success).toBe(true);
  });

  test('all filters together', () => {
    expect(
      ok(productListQuerySchema, {
        category: 'shoes',
        minPrice: '1',
        maxPrice: '9',
        inStock: 'true',
      }).data.filters,
    ).toEqual({ category: 'shoes', minPrice: 1, maxPrice: 9, inStock: true });
  });
});
