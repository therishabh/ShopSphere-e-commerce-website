// Admin controller (sirf HTTP). Har action ka `actor` authorization middleware se (database ka role).

export function createAdminController({ adminService }) {
  return {
    async listSellers(_req, res) {
      res.json(await adminService.listSellers({ query: res.locals.valid.query }));
    },

    // Ek hi handler chaaron seller transitions ke liye: `action` route banate waqt tay hota hai (client se nahi aata).
    sellerTransition(action) {
      return async (_req, res) => {
        const { sellerId } = res.locals.valid.params;
        const reason = res.locals.valid.body?.reason;
        res.json(
          await adminService.transitionSeller({
            actor: res.locals.actor,
            sellerId,
            action,
            reason,
          }),
        );
      };
    },

    async listProducts(_req, res) {
      res.json(await adminService.listProducts({ query: res.locals.valid.query }));
    },

    productDecision(decision) {
      return async (_req, res) => {
        const { productId } = res.locals.valid.params;
        const reason = res.locals.valid.body?.reason;
        res.json(
          await adminService.moderateProduct({
            actor: res.locals.actor,
            productId,
            decision,
            reason,
          }),
        );
      };
    },

    async listAuditEvents(_req, res) {
      res.json(await adminService.listAuditEvents({ query: res.locals.valid.query }));
    },
  };
}
