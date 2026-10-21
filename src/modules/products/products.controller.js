// Products controller (sirf HTTP): request se validated data nikaalo, service ko do, response banao. Business rule yahan nahi.

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
    async archive(_req, res) {
      const { productId } = res.locals.valid.params;
      await productService.archive({ actor: res.locals.actor, productId });
      res.status(204).end();
    },
    async adjustStock(_req, res) {
      const { productId } = res.locals.valid.params;
      res.json(
        await productService.adjustStock({
          actor: res.locals.actor,
          productId,
          delta: res.locals.valid.body.delta,
        }),
      );
    },
    // Public reads (login nahi): res.locals.actor yahan set nahi hota.
    async listPublic(_req, res) {
      res.json(await productService.listPublic({ query: res.locals.valid.query }));
    },
    async getPublic(_req, res) {
      res.json(await productService.getPublic({ productId: res.locals.valid.params.productId }));
    },
    async listMine(_req, res) {
      res.json(
        await productService.listMine({ actor: res.locals.actor, query: res.locals.valid.query }),
      );
    },
    async getMine(_req, res) {
      res.json(
        await productService.getMine({
          actor: res.locals.actor,
          productId: res.locals.valid.params.productId,
        }),
      );
    },
  };
}
