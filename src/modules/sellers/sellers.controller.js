// Sellers controller: sirf HTTP. `res.locals.actor` authorization middleware ne rakha hai (database se aaya role/id).

export function createSellersController({ sellerService }) {
  return {
    async apply(_req, res) {
      const profile = await sellerService.apply({
        actor: res.locals.actor,
        input: res.locals.valid.body,
      });
      res.status(201).location(`/api/v1/sellers/me`).json(profile);
    },

    async me(_req, res) {
      res.json(await sellerService.getOwn({ actor: res.locals.actor }));
    },
  };
}
