// Products ka data access. Phase 5 ki "normalized query" (validate() ka output) seedha yahan Mongo query mein badalti hai:
//   { page, limit, offset, sort: [{ column, direction }], q?, filters: { category?, minPrice?, maxPrice?, inStock? } }
//
// Security: `sort[].column` allowlist map se aaya hai (user ka string nahi), aur filter values Zod se validated primitives
// (string/number/boolean) hain, objects nahi: isliye `{ "$ne": null }` jaisa NoSQL operator injection ka raasta nahi.
// (Search text ko regex banane se pehle escape karte hain, neeche dekho.)

import { serialize } from '../serialize.js';

// Regex ke special characters ( . * + ? ^ $ { } ( ) | [ ] \ ) ko literal bana deta hai.
// Bina iske `q=.*` pura catalog match karta aur `(a+)+$` jaisa pattern server ko atka sakta tha (ReDoS).
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Available stock = onHand - reserved (computed). `inStock` isi par chalta hai.
const AVAILABLE = { $subtract: ['$stock.onHand', '$stock.reserved'] };

// Normalized filters ko Mongo filter object mein badalta hai.
function buildFilter({ filters = {}, q }, { publicOnly }) {
  const filter = {};
  // Customers ko sirf approved (ACTIVE) products dikhte hain. Seller/admin views publicOnly=false se.
  if (publicOnly) filter.status = 'ACTIVE';
  if (filters.category !== undefined) filter.categorySlug = filters.category;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    filter.priceCents = {
      ...(filters.minPrice !== undefined ? { $gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { $lte: filters.maxPrice } : {}),
    };
  }
  if (filters.inStock === true) filter.$expr = { $gt: [AVAILABLE, 0] };
  if (filters.inStock === false) filter.$expr = { $lte: [AVAILABLE, 0] };
  // Search: name mein case-insensitive substring. Index use nahi hota; bade catalog ke liye Phase 13 mein text index /
  // Atlas Search.
  if (q !== undefined) filter.name = { $regex: escapeRegex(q), $options: 'i' };
  return filter;
}

export function createProductRepository({ Product }) {
  return {
    /**
     * Ek page + total count. Do alag queries hain jo saath (parallel) chalti hain, ek transaction nahi: concurrent
     * writes ke beech count aur items mein halka sa farak aa sakta hai, jo list pages ke liye theek hai.
     * `_id` ko last sort key banate hain (tie-breaker): bina iske same price/date wali rows pages ke beech kabhi
     * repeat ya miss ho sakti hain.
     */
    async list(query, { publicOnly = true } = {}) {
      const filter = buildFilter(query, { publicOnly });
      const sort = Object.fromEntries([
        ...query.sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]),
        ['_id', 1],
      ]);
      const [rows, total] = await Promise.all([
        Product.find(filter).sort(sort).skip(query.offset).limit(query.limit).lean(),
        Product.countDocuments(filter),
      ]);
      return { items: rows.map((row) => serialize(row)), total };
    },

    async findById(id, { publicOnly = true } = {}) {
      return serialize(
        await Product.findOne({ _id: id, ...(publicOnly ? { status: 'ACTIVE' } : {}) }).lean(),
      );
    },

    /** Stock product document ke andar hi hai, isliye ek hi write mein product + inventory banta hai (atomic). */
    async create({
      sellerId,
      categoryId,
      categorySlug,
      sku,
      name,
      description,
      priceCents,
      currency,
      status,
      stock,
    }) {
      const [product] = await Product.create([
        {
          sellerId,
          categoryId,
          categorySlug,
          sku,
          name,
          description,
          priceCents,
          currency,
          ...(status ? { status } : {}),
          stock: { onHand: stock, reserved: 0 },
        },
      ]);
      return serialize(product);
    },
  };
}
