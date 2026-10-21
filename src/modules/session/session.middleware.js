// Browser session ka middleware: express-session (cookie) + Redis store, aur `authenticateSession`.
//
// Bearer-token auth (src/modules/auth) se ALAG raasta:
//   bearer : Authorization header, stateless JWT, API clients (mobile/scripts). CSRF ka sawal nahi.
//   session: HttpOnly cookie, server-side state Redis mein, browsers. CSRF protection zaruri (csrf.js).
// Dono ek hi cheez dete hain: `res.locals.auth = { userId, method }`; baad ka authorization (src/modules/authz) dono ke liye ek jaisa hai.

import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { AuthenticationError } from '../../errors/app-errors.js';
import { assertCsrfValid } from './csrf.js';
import { SESSION_KEY_PREFIX } from './session-registry.js';

/**
 * Cookie ke settings (ek jagah, taaki set karte aur clear karte waqt same rahein).
 *   httpOnly : JavaScript cookie padh nahi sakta -> XSS se session chori nahi.
 *   secure   : sirf HTTPS par bheji jaye (production mein). Dev (http://localhost) mein band, warna browser cookie rakhta hi nahi.
 *   sameSite : 'lax' -> doosri site se aane wali POST/fetch requests mein cookie nahi jaati (CSRF ki pehli deewar).
 *   path '/' + `__Host-` naam (production): cookie sirf isi host ki, subdomain se overwrite nahi ho sakti (cookie tossing).
 *   maxAge   : idle timeout (har request par badhta hai).
 */
export function cookieSettings(config) {
  const secure = config.env === 'production';
  return {
    name: secure ? '__Host-sid' : 'sid',
    secure,
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.session.idleMinutes * 60 * 1000,
    },
  };
}

/** express-session middleware (Redis store ke saath). Cookie sirf tab set hoti hai jab session mein kuch likha jaye. */
export function createSessionMiddleware({ config, redis, secret }) {
  const { name, options } = cookieSettings(config);
  return session({
    name,
    secret,
    store: new RedisStore({
      client: redis,
      prefix: SESSION_KEY_PREFIX,
      // Redis key ki umar = idle timeout; har request par `touch` se badhti hai.
      ttl: config.session.idleMinutes * 60,
    }),
    // resave false: badli hui hi session dobara likho. saveUninitialized false: anonymous visitors ke liye session/cookie nahi banti.
    resave: false,
    saveUninitialized: false,
    // rolling: har response par cookie ki expiry aage badhao (idle timeout).
    rolling: true,
    cookie: options,
  });
}

const challenge = { 'WWW-Authenticate': 'Bearer realm="shopsphere"' };

/**
 * Session se authenticate: cookie valid + user id session mein + absolute timeout nahi guzra. Unsafe method par CSRF check.
 * Order jaan-boojh kar aisa: pehle pehchan, phir CSRF (anonymous request ko "token missing" ki jagah seedha 401).
 * @param {{ absoluteSeconds: number, allowedOrigins: Set<string> }} options
 */
export function createAuthenticateSession({ absoluteSeconds, allowedOrigins }) {
  return function authenticateSession(req, res, next) {
    const sess = req.session;
    if (!sess?.userId)
      return next(new AuthenticationError('Authentication required', { headers: challenge }));

    // Absolute timeout: kitna bhi active ho, `createdAt` se itne ghante baad dobara login.
    if (Date.now() - sess.createdAt > absoluteSeconds * 1000) {
      return sess.destroy(() =>
        next(new AuthenticationError('Session expired', { headers: challenge })),
      );
    }

    try {
      assertCsrfValid(req, { allowedOrigins });
    } catch (err) {
      return next(err);
    }

    res.locals.auth = { userId: sess.userId, method: 'session' };
    next();
  };
}
