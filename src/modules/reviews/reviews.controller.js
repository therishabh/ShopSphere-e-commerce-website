// Reviews controller (sirf HTTP).
export function createReviewsController({ reviewService }) {
  return {
    async listForProduct(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(await reviewService.listForProduct({ productId, query: res.locals.valid.query }));
    },
    async create(_req, res) {
      const { productId } = res.locals.valid.params;
      const review = await reviewService.create({
        actor: res.locals.actor,
        productId,
        input: res.locals.valid.body,
      });
      res.status(201).location(`/api/v1/reviews/${review.id}`).json(review);
    },
    async update(_req, res) {
      const { reviewId } = res.locals.valid.params;
      res.json(
        await reviewService.update({
          actor: res.locals.actor,
          reviewId,
          patch: res.locals.valid.body,
        }),
      );
    },
    async remove(_req, res) {
      const { reviewId } = res.locals.valid.params;
      await reviewService.remove({ actor: res.locals.actor, reviewId });
      res.status(204).end();
    },
  };
}
