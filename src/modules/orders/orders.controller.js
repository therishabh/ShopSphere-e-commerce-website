// Orders controller (sirf HTTP): validated input service ko do, response banao. Business rule yahan nahi.
export function createOrdersController({ orderService }) {
  return {
    async checkout(_req, res) {
      const result = await orderService.createCheckout({
        actor: res.locals.actor,
        idempotencyKey: res.locals.idempotencyKey,
        input: res.locals.valid.body,
      });
      // Replay: client ko pata chale ki ye naya kaam nahi, pehle ka hi response hai.
      if (result.replayed) res.set('Idempotent-Replayed', 'true');
      res.status(result.status).json(result.body);
    },
    async listMine(_req, res) {
      res.json(
        await orderService.listMine({ actor: res.locals.actor, query: res.locals.valid.query }),
      );
    },
    async getMine(_req, res) {
      const { orderId } = res.locals.valid.params;
      res.json(await orderService.getMine({ actor: res.locals.actor, orderId }));
    },
    async cancelMine(_req, res) {
      const { orderId } = res.locals.valid.params;
      res.json(await orderService.cancelMine({ actor: res.locals.actor, orderId }));
    },

    async listForSeller(_req, res) {
      res.json(
        await orderService.listForSeller({
          actor: res.locals.actor,
          query: res.locals.valid.query,
        }),
      );
    },
    async getForSeller(_req, res) {
      const { orderId } = res.locals.valid.params;
      res.json(await orderService.getForSeller({ actor: res.locals.actor, orderId }));
    },
    async sellerTransition(_req, res) {
      const { orderId } = res.locals.valid.params;
      res.json(
        await orderService.sellerTransition({
          actor: res.locals.actor,
          orderId,
          to: res.locals.valid.body.status,
        }),
      );
    },

    async listForAdmin(_req, res) {
      res.json(await orderService.listForAdmin({ query: res.locals.valid.query }));
    },
    async getForAdmin(_req, res) {
      const { orderId } = res.locals.valid.params;
      res.json(await orderService.getForAdmin({ orderId }));
    },
    async adminTransition(_req, res) {
      const { orderId } = res.locals.valid.params;
      const { status, reason } = res.locals.valid.body;
      res.json(
        await orderService.adminTransition({
          actor: res.locals.actor,
          orderId,
          to: status,
          reason,
        }),
      );
    },
    async reconcile(_req, res) {
      res.json(
        await orderService.reconcile({
          actor: res.locals.actor,
          olderThanMinutes: res.locals.valid.body.olderThanMinutes,
        }),
      );
    },
  };
}
