// Validation + API conventions ka teaching/demo router (`/api/v1/examples/validation/...`). Real products
// module NAHI hai (wo Phase 9 mein). Production mein mount nahi hota.
//
// Ye demo end-to-end dikhata hai: Zod schemas -> validate() middleware -> handler jo sirf *validated* data
// use karta hai. Data in-memory demo list hai; handler ka kaam wahi hai jo baad mein repository karega,
// lekin sach mein koi product business logic nahi hai.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ConflictError, NotFoundError } from '../errors/app-errors.js';
import { validate } from '../http/validate.js';
import { buildPagination } from '../http/query/pagination.js';
import {
  createProductBodySchema,
  productIdParamsSchema,
  productListQuerySchema,
} from '../modules/products/products.schemas.js';

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

export function createValidationExamplesRouter() {
  const products = seedProducts();
  const router = Router();

  // GET /demo-products?page=&limit=&sort=&q=&category=&minPrice=&maxPrice=&inStock=
  // validate() handler se pehle chalta hai; galat query yahin 400 ke saath ruk jaati hai.
  router.get('/demo-products', validate({ query: productListQuerySchema }), (_req, res) => {
    // res.locals.valid.query = validate() ke baad ka normalized data (raw req.query nahi).
    const query = res.locals.valid.query;
    const { items, total } = applyListQuery(products, query);
    res.json({
      items,
      pagination: buildPagination({ page: query.page, limit: query.limit, total }),
    });
  });

  // GET /demo-products/:productId (productId UUID hona chahiye)
  router.get(
    '/demo-products/:productId',
    validate({ params: productIdParamsSchema }),
    (_req, res) => {
      const product = products.find((p) => p.id === res.locals.valid.params.productId);
      if (!product) throw new NotFoundError('Product not found');
      res.json(product);
    },
  );

  // POST /demo-products: body strict (extra field reject), JSON content type zaruri.
  router.post('/demo-products', validate({ body: createProductBodySchema }), (req, res) => {
    const input = res.locals.valid.body;
    if (products.some((p) => p.sku === input.sku)) throw new ConflictError('SKU already exists');
    // id aur createdAt server decide karta hai (body strict hai, client ye fields bhej hi nahi sakta).
    const product = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
    products.push(product);
    res.status(201).location(`${req.baseUrl}/demo-products/${product.id}`).json(product);
  });

  return router;
}
