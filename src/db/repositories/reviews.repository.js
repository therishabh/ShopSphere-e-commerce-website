// Reviews ka data access. Sach ka source yahi collection hai; product ke rating fields iska cache hain
// (products.repository.js `applyRatingChange`). Review aur summary hamesha ek transaction mein badalte hain (reviews.service.js).
import { serialize } from '../serialize.js';

export function createReviewRepository({ Review }) {
  return {
    /** (productId, userId) unique index: duplicate review E11000 -> service ise 409 banati hai. */
    async create({ productId, userId, rating, title, body }) {
      const [review] = await Review.create([
        {
          productId,
          userId,
          rating,
          ...(title !== undefined ? { title } : {}),
          ...(body !== undefined ? { body } : {}),
        },
      ]);
      return serialize(review);
    },

    async findById(id) {
      return serialize(await Review.findById(id).lean());
    },

    /** Ek product ke reviews: sort allowlist se (createdAt/rating), `_id` tie-breaker, pagination. */
    async listForProduct(productId, query) {
      // `_id` tie-breaker ki direction sort key jaisi: index { productId, <key>, _id } dono directions serve karta hai.
      const entries = query.sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]);
      const sort = Object.fromEntries([...entries, ['_id', entries.at(-1)[1]]]);
      const filter = { productId };
      const [rows, total] = await Promise.all([
        Review.find(filter).sort(sort).skip(query.offset).limit(query.limit).lean(),
        Review.countDocuments(filter),
      ]);
      return { items: rows.map((row) => serialize(row)), total };
    },

    /**
     * Sirf review ka malik badal sakta hai: filter mein `userId` hai, isliye doosre ka review ID jaanne se bhi update nahi hota.
     * `returnDocument: 'before'` se purani rating milti hai (summary mein farak nikalne ke liye). @returns { before, after } ya null
     */
    async updateByOwner({ id, userId, set }) {
      const before = await Review.findOneAndUpdate(
        { _id: id, userId },
        { $set: set },
        { returnDocument: 'before', runValidators: true },
      ).lean();
      if (!before) return null;
      return { before: serialize(before), after: serialize({ ...before, ...set }) };
    },

    /** Delete: `userId` do to sirf malik ka; `undefined` (admin moderation) to koi bhi. @returns deleted review ya null */
    async delete({ id, userId }) {
      return serialize(
        await Review.findOneAndDelete({ _id: id, ...(userId ? { userId } : {}) }).lean(),
      );
    },
  };
}
