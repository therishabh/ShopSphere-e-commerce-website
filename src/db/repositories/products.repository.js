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

// Sort spec: allowlisted columns + `_id` tie-breaker. Tie-breaker ki direction aakhri sort key jaisi hai (asc -> _id asc, desc ->
// _id desc): is se wahi index (key ..., _id) forward aur backward dono directions serve karta hai aur MongoDB in-memory SORT nahi
// karta (models/catalog.models.js ke index comments dekho).
function sortSpec(sort) {
  const entries = sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]);
  return Object.fromEntries([...entries, ['_id', entries.at(-1)[1]]]);
}

// Normalized filters ko Mongo filter object mein badalta hai.
// `sellerId` do to sirf us seller ke products (seller ki apni list); `filters.status` tab hi lagta hai jab publicOnly false ho
// (public view mein status hamesha ACTIVE rehta hai, client use badal nahi sakta).
function buildFilter({ filters = {}, q }, { publicOnly, sellerId }) {
  const filter = {};
  // Customers ko sirf approved (ACTIVE) products dikhte hain. Seller/admin views publicOnly=false se.
  if (publicOnly) filter.status = 'ACTIVE';
  else if (filters.status !== undefined) filter.status = filters.status;
  if (sellerId !== undefined) filter.sellerId = sellerId;
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
    async list(query, { publicOnly = true, sellerId } = {}) {
      const filter = buildFilter(query, { publicOnly, sellerId });
      const [rows, total] = await Promise.all([
        Product.find(filter)
          .sort(sortSpec(query.sort))
          .skip(query.offset)
          .limit(query.limit)
          .lean(),
        Product.countDocuments(filter),
      ]);
      return { items: rows.map((row) => serialize(row)), total };
    },

    async findById(id, { publicOnly = true } = {}) {
      return serialize(
        await Product.findOne({ _id: id, ...(publicOnly ? { status: 'ACTIVE' } : {}) }).lean(),
      );
    },

    /** Sirf ownership/status check ke liye halka view: kis seller ka hai aur kis status mein. sellerId string deta hai. */
    async findOwnerView(id) {
      const row = await Product.findById(id).select('sellerId status stock').lean();
      return row
        ? {
            id: String(row._id),
            sellerId: String(row.sellerId),
            status: row.status,
            stock: row.stock,
          }
        : null;
    },

    /**
     * Owner ka update. Filter mein `sellerId` aur allowed `status` dono hain, isliye ownership check mein bug ho to bhi doosre
     * seller ki row update nahi hoti. @returns updated product ya null (match nahi hua)
     */
    async updateByOwner({ id, sellerId, allowedStatuses, set }) {
      return serialize(
        await Product.findOneAndUpdate(
          { _id: id, sellerId, status: { $in: allowedStatuses } },
          { $set: set },
          { returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    },

    /**
     * Stock (onHand) set karna. Filter mein `reserved <= naya onHand` hai: checkout mein ruka hua stock onHand se neeche nahi
     * ja sakta. Server-side validator bhi yahi rokta hai (dono jagah). Archived product ka stock nahi badalta.
     */
    async setStockByOwner({ id, sellerId, onHand }) {
      return serialize(
        await Product.findOneAndUpdate(
          { _id: id, sellerId, status: { $ne: 'ARCHIVED' }, 'stock.reserved': { $lte: onHand } },
          { $set: { 'stock.onHand': onHand } },
          { returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    },

    /** Status badalna jab abhi status `from` mein se ho (moderation, submit). `sellerId` do to ownership bhi filter mein judta hai. */
    async transitionStatus({ id, sellerId, from, to, set = {} }) {
      return serialize(
        await Product.findOneAndUpdate(
          { _id: id, ...(sellerId ? { sellerId } : {}), status: { $in: from } },
          { $set: { status: to, ...set } },
          { returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    },

    /**
     * Stock ko relative badalna (delta +/-), poori tarah ek atomic operation mein: filter aur `$inc` ek hi document par ek saath
     * lagte hain, to "padho, badlo, likho" wali race (lost update) nahi hoti. Filter ki `$expr` guard hai: naya onHand reserved se
     * neeche ya 1,000,000 se upar na jaye. Guard fail = null (service 409 deti hai). Archived product par nahi chalta.
     */
    async adjustStockByOwner({ id, sellerId, delta }) {
      const nextOnHand = { $add: ['$stock.onHand', delta] };
      return serialize(
        await Product.findOneAndUpdate(
          {
            _id: id,
            sellerId,
            status: { $ne: 'ARCHIVED' },
            $expr: {
              $and: [{ $gte: [nextOnHand, '$stock.reserved'] }, { $lte: [nextOnHand, 1_000_000] }],
            },
          },
          { $inc: { 'stock.onHand': delta } },
          { returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    },

    /**
     * Checkout ke liye stock rokna (Phase 10 isse call karega): available = onHand - reserved >= quantity ho tabhi `reserved`
     * badhta hai. Do customers aakhri unit ek saath maangein to MongoDB ek hi document par updates ko serial karta hai: pehla
     * jeetta hai, doosre ka filter fail hota hai (null). Oversell isliye nahi hota; validator (reserved <= onHand) doosri deewar hai.
     * Sirf ACTIVE (public) product reserve hota hai.
     */
    async reserve({ id, quantity }) {
      return serialize(
        await Product.findOneAndUpdate(
          {
            _id: id,
            status: 'ACTIVE',
            $expr: { $gte: [{ $subtract: ['$stock.onHand', '$stock.reserved'] }, quantity] },
          },
          { $inc: { 'stock.reserved': quantity } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /** Roka hua stock wapas chhodna (payment fail / cart expire). Reserved se zyada release nahi ho sakta (filter guard). */
    async release({ id, quantity }) {
      return serialize(
        await Product.findOneAndUpdate(
          { _id: id, 'stock.reserved': { $gte: quantity } },
          { $inc: { 'stock.reserved': -quantity } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /**
     * Review create/update/delete ke baad rating summary badalna. Do steps hain (`$inc`, phir average): isliye caller isse
     * hamesha transaction ke andar chalata hai, taaki review aur summary saath badlein ya saath rollback hon. `$inc` ek document
     * par concurrent reviews ko serial karta hai (write conflict par transaction retry).
     */
    async applyRatingChange({ id, countDelta, sumDelta }) {
      const updated = await Product.findOneAndUpdate(
        { _id: id },
        { $inc: { ratingCount: countDelta, ratingSum: sumDelta } },
        { returnDocument: 'after' },
      ).lean();
      if (!updated) return null;
      const average =
        updated.ratingCount > 0
          ? Math.round((updated.ratingSum / updated.ratingCount) * 100) / 100
          : 0;
      await Product.updateOne({ _id: id }, { $set: { ratingAverage: average } });
      return { ratingCount: updated.ratingCount, ratingAverage: average };
    },

    /** Seller suspend: uske ACTIVE products ON_HOLD (public se hat jaate hain). @returns kitne products badle */
    async holdActiveBySeller(sellerId) {
      const result = await Product.updateMany(
        { sellerId, status: 'ACTIVE' },
        { $set: { status: 'ON_HOLD' } },
      );
      return result.modifiedCount;
    },

    /** Seller reinstate: ON_HOLD products wapas ACTIVE. */
    async releaseHoldBySeller(sellerId) {
      const result = await Product.updateMany(
        { sellerId, status: 'ON_HOLD' },
        { $set: { status: 'ACTIVE' } },
      );
      return result.modifiedCount;
    },

    /** Public categories page ke liye: har category mein kitne ACTIVE products (index { status, categorySlug, ... } se). */
    async countActiveByCategory() {
      const rows = await Product.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
      ]);
      return Object.fromEntries(rows.map((r) => [r._id, r.count]));
    },

    /** Admin moderation list (status filter, sort, pagination). */
    async listForAdmin(query) {
      const filter = query.filters.status ? { status: query.filters.status } : {};
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
