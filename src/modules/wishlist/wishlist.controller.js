// Wishlist controller (sirf HTTP).
export function createWishlistController({ wishlistService }) {
  return {
    async list(_req, res) {
      res.json(
        await wishlistService.list({ actor: res.locals.actor, query: res.locals.valid.query }),
      );
    },
    async add(_req, res) {
      const { productId } = res.locals.valid.params;
      const { created } = await wishlistService.add({ actor: res.locals.actor, productId });
      res.status(created ? 201 : 200).json({ productId, inWishlist: true });
    },
    async remove(_req, res) {
      const { productId } = res.locals.valid.params;
      await wishlistService.remove({ actor: res.locals.actor, productId });
      res.status(204).end();
    },
  };
}
