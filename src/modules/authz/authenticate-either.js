// "Bearer ya session" authentication: protected routes (sellers, admin, products) dono tarah ke clients ko sambhalte hain.
//
// Rule (saaf alag raasta):
//   - `Authorization` header hai -> SIRF bearer token check hota hai. Cookie ko dekha hi nahi jaata, isliye bearer request par
//     kisi doosri site ka bheji cookie ka asar nahi (aur CSRF check nahi lagta: header browser apne aap nahi lagata).
//   - Header nahi -> session cookie. Isme unsafe methods par CSRF token + origin check zaruri hai.
// Dono ke baad `res.locals.auth = { userId, ..., method }` ek jaisa milta hai; aage authorization (requirePermission) dono ke liye same.

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.bearer  authenticate (src/modules/auth/auth.middleware.js)
 * @param {import('express').RequestHandler} [deps.session]  authenticateSession (Redis ho tab); na ho to sirf bearer
 */
export function createAuthenticateEither({ bearer, session }) {
  return function authenticateEither(req, res, next) {
    if (req.get('authorization') || !session) return bearer(req, res, next);
    return session(req, res, next);
  };
}
