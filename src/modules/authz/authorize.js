// Authorization middleware: `requirePermission('x')` route par lagao, authentication ke BAAD.
//
//   router.post('/admin/sellers/:sellerId/approve', authenticate, requirePermission(PERMISSIONS.ADMIN_SELLER_REVIEW), handler)
//
// Ye middleware token/session ke claims par bharosa NAHI karta: har baar user ko database se padhta hai (ek `_id` lookup) aur
// role + status wahin se leta hai. Fayda: admin ka role hata do ya user DISABLED kar do to uska access turant band, access token
// ki 15 minute ki umar ka intezaar nahi. Kharcha: har protected request par ek chhota DB read.

import { AuthenticationError, AuthorizationError } from '../../errors/app-errors.js';
import { can } from './permissions.js';

/**
 * @param {object} deps
 * @param {{ findById: (id: string) => Promise<object|null> }} deps.users  users repository
 * @param {import('pino').Logger} deps.logger
 */
export function createAuthorize({ users, logger }) {
  return function requirePermission(permission) {
    return async function authorize(_req, res, next) {
      const auth = res.locals.auth;
      // authenticate pehle chalna chahiye. Na chala ho to ye routing ki galti hai, lekin tab bhi default deny (401).
      if (!auth) return next(new AuthenticationError('Authentication required'));

      const user = await users.findById(auth.userId);
      // User delete hua ya DISABLED/pending hai: valid token ke bawajood access nahi.
      if (!user || user.status !== 'ACTIVE')
        return next(new AuthenticationError('Invalid or expired access token'));

      if (!can(user.role, permission)) {
        // Denial log hota hai (audit collection mein nahi: koi bhi spam karke use bhar sakta hai). Sirf IDs, koi token/body nahi.
        (res.locals.log ?? logger).warn(
          { userId: user.id, role: user.role, permission },
          'authorization denied',
        );
        return next(new AuthorizationError('You do not have permission to do this'));
      }

      // `actor` = authorization ke baad ka pakka (database se aaya) role + id. Services yahi use karti hain, token ka role nahi.
      res.locals.actor = { id: user.id, role: user.role };
      next();
    };
  };
}
