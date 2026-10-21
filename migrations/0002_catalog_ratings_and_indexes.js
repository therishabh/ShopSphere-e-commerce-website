// Migration 0002 (Phase 9): products mein rating summary fields, naye indexes aur stricter validator.
//
// Order zaruri hai:
//   1. Backfill: purane products mein ratingCount/ratingSum/ratingAverage nahi hain. Validator pehle lagta to un documents ka
//      agla update fail hota (missing field `$gte` match nahi karta), isliye pehle fields bharte hain.
//   2. Rating summary ko reviews collection se dobara gin lete hain (seed ya purane data mein reviews ho sakte hain).
//   3. Validator update (`collMod`) aur indexes sync.
// Idempotent: dobara chalane par wahi result.
import { COLLECTION_VALIDATORS } from '../src/db/models/validators.js';

export const name = '0002_catalog_ratings_and_indexes';

export async function up({ database }) {
  const { connection, models } = database;
  const { Product, Review, WishlistItem } = models;

  // 1. Fields ka default (sirf unhe jinke paas nahi hain).
  await Product.collection.updateMany(
    { ratingCount: { $exists: false } },
    { $set: { ratingCount: 0, ratingSum: 0, ratingAverage: 0 } },
  );

  // 2. Reviews se summary dobara nikaalo (sach ka source reviews hain, product ke fields unka cache hain).
  const totals = await Review.collection
    .aggregate([{ $group: { _id: '$productId', count: { $sum: 1 }, sum: { $sum: '$rating' } } }])
    .toArray();
  for (const { _id, count, sum } of totals) {
    await Product.collection.updateOne(
      { _id },
      {
        $set: {
          ratingCount: count,
          ratingSum: sum,
          ratingAverage: Math.round((sum / count) * 100) / 100,
        },
      },
    );
  }

  // 3. Validator + indexes.
  await connection.db.command({
    collMod: 'products',
    validator: COLLECTION_VALIDATORS.products,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  for (const model of [Product, Review, WishlistItem]) await model.syncIndexes();
}
