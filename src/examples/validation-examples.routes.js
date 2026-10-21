// Validation + API conventions ka teaching/demo router (`/api/v1/examples/validation/...`). Real products
// module NAHI hai (wo Phase 9 mein). Production mein mount nahi hota.
//
// Ye demo end-to-end dikhata hai: contract (schemas) -> validate middleware -> handler jo sirf *validated* data
// use karta hai -> response jo contract ke schema se match karta hai. Data in-memory demo list hai; handler ka
// kaam wahi hai jo baad mein repository karega, lekin sach mein koi product business logic nahi hai.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ConflictError, NotFoundError } from '../errors/app-errors.js';
import { buildPagination } from '../http/query/pagination.js';
import {
  createProductBodySchema,
  productIdParamsSchema,
  productListQuerySchema,
  productListResponseSchema,
  productSchema,
} from '../modules/products/products.schemas.js';
import { defineRoute } from '../openapi/contract.js';

const BASE_PATH = '/examples/validation';
const TAGS = ['Validation examples'];

// Contracts: har route ka poora description. Inhi se route register hota hai aur OpenAPI banta hai.
export const listDemoProducts = defineRoute({
  method: 'get',
  basePath: BASE_PATH,
  path: '/demo-products',
  operationId: 'listDemoProducts',
  summary: 'List demo products (pagination, sorting, filters, search)',
  tags: TAGS,
  request: { query: productListQuerySchema },
  responses: { 200: { description: 'A page of products', schema: productListResponseSchema } },
});

export const getDemoProduct = defineRoute({
  method: 'get',
  basePath: BASE_PATH,
  path: '/demo-products/:productId',
  operationId: 'getDemoProduct',
  summary: 'Get one demo product by UUID',
  tags: TAGS,
  request: { params: productIdParamsSchema },
  responses: {
    200: { description: 'The product', schema: productSchema },
    404: { description: 'Product not found' },
  },
});

export const createDemoProduct = defineRoute({
  method: 'post',
  basePath: BASE_PATH,
  path: '/demo-products',
  operationId: 'createDemoProduct',
  summary: 'Create a demo product (strict body validation)',
  tags: TAGS,
  request: { body: createProductBodySchema },
  responses: {
    201: {
      description: 'Created; Location header points to the new product',
      schema: productSchema,
    },
    409: { description: 'SKU already exists' },
  },
});

// Demo data: kuch fixed products taaki filters/sort/pagination ke results dekhe ja sakein.
function seedProducts() {
  const categories = ['shoes', 'bags', 'watches'];
  const base = Date.UTC(2026, 0, 1);
  return Array.from({ length: 12 }, (_, i) => ({
    id: randomUUID(),
    sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
    name: `Demo ${categories[i % 3]} ${i + 1}`,
    category: categories[i % 3],
    priceCents: (i + 1) * 25_000,
    currency: 'INR',
    stock: i % 4 === 0 ? 0 : (i + 1) * 3,
    createdAt: new Date(base + i * 86_400_000).toISOString(),
  }));
}

// Normalized query ko in-memory list par lagata hai. Ye wahi kaam hai jo Phase 9 mein Prisma query karegi.
// `query.sort[].column` allowlist se aaya hai (user ka string nahi), isliye `item[column]` safe hai.
function applyListQuery(all, query) {
  const { filters, q, sort } = query;
  let rows = all.filter(
    (p) =>
      (filters.category === undefined || p.category === filters.category) &&
      (filters.minPrice === undefined || p.priceCents >= filters.minPrice) &&
      (filters.maxPrice === undefined || p.priceCents <= filters.maxPrice) &&
      (filters.inStock === undefined || p.stock > 0 === filters.inStock) &&
      (q === undefined || p.name.toLowerCase().includes(q.toLowerCase())),
  );
  const total = rows.length;
  rows = [...rows].sort((a, b) => {
    for (const { column, direction } of sort) {
      if (a[column] === b[column]) continue;
      const order = a[column] < b[column] ? -1 : 1;
      return direction === 'asc' ? order : -order;
    }
    return 0;
  });
  return { items: rows.slice(query.offset, query.offset + query.limit), total };
}

/** @param {{mount: Function}} registry createContractRegistry() */
export function createValidationExamplesRouter(registry) {
  const products = seedProducts();
  const router = Router();

  registry.mount(router, listDemoProducts, (_req, res) => {
    // res.locals.valid.query = validate() ke baad ka normalized data (raw req.query nahi).
    const query = res.locals.valid.query;
    const { items, total } = applyListQuery(products, query);
    res.json({
      items,
      pagination: buildPagination({ page: query.page, limit: query.limit, total }),
    });
  });

  registry.mount(router, getDemoProduct, (_req, res) => {
    const product = products.find((p) => p.id === res.locals.valid.params.productId);
    if (!product) throw new NotFoundError('Product not found');
    res.json(product);
  });

  registry.mount(router, createDemoProduct, (req, res) => {
    const input = res.locals.valid.body;
    if (products.some((p) => p.sku === input.sku)) throw new ConflictError('SKU already exists');
    // id aur createdAt server decide karta hai (body strict hai, client ye fields bhej hi nahi sakta).
    const product = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
    products.push(product);
    res.status(201).location(`${req.baseUrl}/demo-products/${product.id}`).json(product);
  });

  return router;
}
