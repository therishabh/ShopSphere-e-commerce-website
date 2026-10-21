// Wishlist ka data access. Ek row = (userId, productId); unique index duplicate rokta hai.
import { Types } from 'mongoose';
import { serialize } from '../serialize.js';

export function createWishlistRepository({ WishlistItem }) {
  return {
    /**
     * Idempotent add: upsert + `$setOnInsert`. Row pehle se ho to kuch nahi badalta; do requests ek saath aayein to unique index
     * ek hi row banne deta hai (doosri upsert ko duplicate-key aata hai jo driver retry karke match kar leta hai ya hum 11000
     * pakadte hain). @returns true agar nayi row bani, false agar pehle se thi
     */
    async add({ userId, productId }) {
      try {
        const result = await WishlistItem.updateOne(
          { userId, productId },
          { $setOnInsert: { userId, productId } },
          { upsert: true },
        );
        return result.upsertedCount === 1;
      } catch (err) {
        if (err?.code === 11000) return false; // race: doosre request ne abhi bana di
        throw err;
      }
    },

    /** @returns true agar row thi aur hata di, false agar thi hi nahi */
    async remove({ userId, productId }) {
      const result = await WishlistItem.deleteOne({ userId, productId });
      return result.deletedCount === 1;
    },

    /**
     * User ki wishlist, newest first, sirf wo products jo abhi public (ACTIVE) hain: archived/hold/rejected product wishlist
     * mein row rehti hai par dikhta nahi. Count bhi isi filter ke baad chahiye, isliye `$lookup` + `$facet` ek hi query mein
     * (alag find + count se page aur total mein mismatch hota). Aggregation `userId` ko cast nahi karta, isliye ObjectId banaya.
     */
    async listForUser(userId, query) {
      const direction = query.sort[0].direction === 'asc' ? 1 : -1;
      const [result] = await WishlistItem.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        // $sort $lookup se PEHLE: tab index { userId, createdAt, _id } use hota hai. $lookup/$unwind order nahi badalte.
        { $sort: { createdAt: direction, _id: direction } },
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        { $match: { 'product.status': 'ACTIVE' } },
        {
          $facet: {
            items: [{ $skip: query.offset }, { $limit: query.limit }],
            total: [{ $count: 'n' }],
          },
        },
      ]);
      return {
        items: result.items.map((row) => ({
          addedAt: row.createdAt,
          product: serialize(row.product),
        })),
        total: result.total[0]?.n ?? 0,
      };
    },
  };
}
