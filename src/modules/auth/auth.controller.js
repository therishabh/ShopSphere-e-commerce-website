// Auth controller: sirf HTTP ka kaam (request se validated data nikalna, service ko call karna, status code + response dena).
// Koi business logic yahan nahi: wo auth.service.js mein hai.
//
// Validated data `res.locals.valid.body` mein hai (validate() middleware ne rakha), raw `req.body` nahi.

// Client ke IP/user-agent: rate limiting aur session record ke liye. (`req.ip` proxy ke peeche sahi tab hoga jab trust proxy
// configure ho: Phase 11. Tab tak sab requests ek hi IP dikh sakti hain.)
const clientInfo = (req) => ({ ip: req.ip ?? 'unknown', userAgent: req.get('user-agent') });

export function createAuthController({ authService }) {
  return {
    // 202 Accepted: kaam (email bhejna) baad mein hota hai, aur naya/existing dono ke liye same jawab.
    async signup(req, res) {
      res
        .status(202)
        .json(await authService.signup({ ...res.locals.valid.body, ...clientInfo(req) }));
    },

    async login(req, res) {
      res.json(await authService.login({ ...res.locals.valid.body, ...clientInfo(req) }));
    },

    async refresh(req, res) {
      res.json(await authService.refresh({ ...res.locals.valid.body, ...clientInfo(req) }));
    },

    // 204 No Content: body khaali. Token galat ho to bhi 204 (kuch pata nahi chalna chahiye).
    async logout(_req, res) {
      await authService.logout(res.locals.valid.body);
      res.status(204).end();
    },

    async logoutAll(_req, res) {
      await authService.logoutAll({ userId: res.locals.auth.userId });
      res.status(204).end();
    },

    async me(_req, res) {
      res.json({ user: await authService.getCurrentUser({ userId: res.locals.auth.userId }) });
    },

    async verifyEmail(_req, res) {
      res.json(await authService.verifyEmail(res.locals.valid.body));
    },

    async resendVerification(req, res) {
      res
        .status(202)
        .json(
          await authService.resendVerification({ ...res.locals.valid.body, ...clientInfo(req) }),
        );
    },

    async forgotPassword(req, res) {
      res
        .status(202)
        .json(await authService.forgotPassword({ ...res.locals.valid.body, ...clientInfo(req) }));
    },

    async resetPassword(_req, res) {
      res.json(await authService.resetPassword(res.locals.valid.body));
    },
  };
}
