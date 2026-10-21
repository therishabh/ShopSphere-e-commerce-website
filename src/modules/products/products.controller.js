// Products controller (sirf HTTP).

export function createProductsController({ productService }) {
  return {
    async create(_req, res) {
      const product = await productService.create({
        actor: res.locals.actor,
        input: res.locals.valid.body,
      });
      res.status(201).location(`/api/v1/products/${product.id}`).json(product);
    },

    async update(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(
        await productService.update({
          actor: res.locals.actor,
          productId,
          patch: res.locals.valid.body,
        }),
      );
    },

    async setStock(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(
        await productService.setStock({
          actor: res.locals.actor,
          productId,
          onHand: res.locals.valid.body.onHand,
        }),
      );
    },

    async submit(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(await productService.submit({ actor: res.locals.actor, productId }));
    },
  };
}
