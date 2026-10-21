// Reviews ka business logic: create / list / update / delete (owner), aur rating summary ka hisaab.
//
// Rules:
//   - Review sirf public (ACTIVE) product par; product ka seller apne product par review nahi likh sakta (403).
//   - Ek user, ek product, ek review: database ka unique index (productId, userId) enforce karta hai (race mein bhi), service
//     E11000 ko saaf 409 message deti hai.
//   - Review badalna/hatana sirf uska malik: review ID jaanne se kuch nahi hota (service check + query filter mein userId).
//   - Review aur product ka rating summary (ratingCount/ratingSum/ratingAverage) HAMESHA ek transaction mein badalte hain: do
//     documents ek saath badalne hain, aur beech mein fail hone par summary galat reh jaati.
import { AuthorizationError, ConflictError, NotFoundError } from '../../errors/app-errors.js';
import { buildPagination } from '../../http/query/pagination.js';

// Response ka shape (allowlist): userId nahi jaati, sirf reviewer ka naam.
const toReview = (review, reviewerName) => ({
  id: review.id,
  productId: String(review.productId),
  rating: review.rating,
  title: review.title,
  body: review.body,
  ...(reviewerName !== undefined ? { reviewer: { name: reviewerName } } : {}),
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

export function createReviewService({ database, logger }) {
  const repos = database.repositories;

  // Review exist kare aur actor ka ho; warna 404 (nahi mila) ya 403 (kisi aur ka). Log mein warning sirf 403 par.
  async function requireOwnReview(actor, reviewId) {
    const review = await repos.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    if (String(review.userId) !== actor.id) {
      logger?.warn(
        { userId: actor.id, reviewId },
        'ownership check failed: review belongs to another user',
      );
      throw new AuthorizationError('You do not own this review');
    }
    return review;
  }

  return {
    /** Public reviews (login nahi). Product ACTIVE nahi to 404, taaki hidden product ka wajood na khule. */
    async listForProduct({ productId, query }) {
      const product = await repos.products.findById(productId, { publicOnly: true });
      if (!product) throw new NotFoundError('Product not found');
      const { items, total } = await repos.reviews.listForProduct(productId, query);
      const names = await repos.users.findNamesByIds([
        ...new Set(items.map((r) => String(r.userId))),
      ]);
      return {
        items: items.map((r) => toReview(r, names.get(String(r.userId)) ?? 'Former user')),
        pagination: buildPagination({ page: query.page, limit: query.limit, total }),
      };
    },

    async create({ actor, productId, input }) {
      const product = await repos.products.findById(productId, { publicOnly: true });
      if (!product) throw new NotFoundError('Product not found');
      const seller = await repos.sellerProfiles.findById(product.sellerId);
      if (seller && String(seller.userId) === actor.id)
        throw new AuthorizationError('You cannot review your own product');
      try {
        return await database.transaction(async ({ reviews, products }) => {
          const review = await reviews.create({ productId, userId: actor.id, ...input });
          await products.applyRatingChange({
            id: productId,
            countDelta: 1,
            sumDelta: review.rating,
          });
          return toReview(review);
        });
      } catch (err) {
        if (err?.code === 11000) throw new ConflictError('You have already reviewed this product');
        throw err;
      }
    },

    async update({ actor, reviewId, patch }) {
      await requireOwnReview(actor, reviewId);
      return database.transaction(async ({ reviews, products }) => {
        const result = await reviews.updateByOwner({ id: reviewId, userId: actor.id, set: patch });
        if (!result) throw new NotFoundError('Review not found');
        if (patch.rating !== undefined && patch.rating !== result.before.rating) {
          await products.applyRatingChange({
            id: result.before.productId,
            countDelta: 0,
            sumDelta: patch.rating - result.before.rating,
          });
        }
        return toReview(result.after);
      });
    },

    async remove({ actor, reviewId }) {
      await requireOwnReview(actor, reviewId);
      return database.transaction(async ({ reviews, products }) => {
        const removed = await reviews.delete({ id: reviewId, userId: actor.id });
        if (!removed) throw new NotFoundError('Review not found');
        await products.applyRatingChange({
          id: removed.productId,
          countDelta: -1,
          sumDelta: -removed.rating,
        });
      });
    },
  };
}
