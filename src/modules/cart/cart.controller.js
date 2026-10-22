// Cart controller (sirf HTTP): validated input service ko do, response banao. Business rule yahan nahi.
export function createCartController({ cartService }) {
  return {
    async get(_req, res) {
      res.json(await cartService.getCart({ actor: res.locals.actor }));
    },
    async addItem(_req, res) {
      const { productId, quantity } = res.locals.valid.body;
      const { created, cart } = await cartService.addItem({
        actor: res.locals.actor,
        productId,
        quantity,
      });
      res.status(created ? 201 : 200).json(cart);
    },
    async setQuantity(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(
        await cartService.setQuantity({
          actor: res.locals.actor,
          productId,
          quantity: res.locals.valid.body.quantity,
        }),
      );
    },
    async removeItem(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(await cartService.removeItem({ actor: res.locals.actor, productId }));
    },
    async clear(_req, res) {
      await cartService.clear({ actor: res.locals.actor });
      res.status(204).end();
    },
  };
}
