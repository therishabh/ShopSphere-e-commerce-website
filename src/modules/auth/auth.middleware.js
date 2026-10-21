// Authentication middleware: request ke Bearer access token ko verify karke `res.locals.auth` mein user ki pehchan rakhta hai.
//
// Boundary: ye middleware sirf "aap kaun ho" (authentication) tay karta hai. "Aap ye kar sakte ho ya nahi" (authorization,
// roles/ownership) alag cheez hai aur Phase 8 mein aati hai.
//
// Token Authorization header se aata hai: `Authorization: Bearer <access token>`. Header (cookie nahi) isliye ki browser
// cookie apne aap har request ke saath jaati hai (CSRF ka khatra), jabki header JS ko khud lagana padta hai.

import { AuthenticationError } from '../../errors/app-errors.js';

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

// 401 ke saath `WWW-Authenticate` header standard hai: client ko batata hai kaunsa scheme chahiye.
const challenge = (extra = '') => ({ 'WWW-Authenticate': `Bearer realm="shopsphere"${extra}` });

/**
 * @param {{ verifyAccessToken: (token: string) => Promise<{ userId: string, role: string }> }} tokens
 * Success par `res.locals.auth = { userId, role }`. Token nahi/galat/expired par 401 (kaaran client ko nahi batate).
 */
export function createAuthenticate(tokens) {
  return async function authenticate(req, res, next) {
    const header = req.get('authorization');
    if (!header)
      return next(new AuthenticationError('Authentication required', { headers: challenge() }));

    const match = BEARER.exec(header);
    if (!match) {
      return next(
        new AuthenticationError('Invalid or expired access token', {
          headers: challenge(', error="invalid_token"'),
        }),
      );
    }

    try {
      res.locals.auth = await tokens.verifyAccessToken(match[1]);
    } catch {
      // Expired, galat signature, galat audience... sab ek jaisa 401: attacker ko ye nahi dikhta ki kya galat tha.
      return next(
        new AuthenticationError('Invalid or expired access token', {
          headers: challenge(', error="invalid_token"'),
        }),
      );
    }
    next();
  };
}
