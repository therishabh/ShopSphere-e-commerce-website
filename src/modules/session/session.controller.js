// Session controller: browser login/logout/me/csrf (HTTP ka kaam). Credentials ki jaanch AuthService karti hai (bearer login wahi
// rules), yahan sirf session banana/todna hai.

import { promisify } from 'node:util';
import { AuthenticationError } from '../../errors/app-errors.js';
import { assertOriginValid, generateCsrfToken } from './csrf.js';

// express-session ke callback-style methods ko promise mein.
const regenerate = (req) => promisify(req.session.regenerate.bind(req.session))();
const save = (req) => promisify(req.session.save.bind(req.session))();
const destroy = (req) => promisify(req.session.destroy.bind(req.session))();

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} deps.authService  verifyCredentials() / logoutAll()
 * @param {object} deps.database  repositories (users, audit)
 * @param {{ add: Function, remove: Function }} deps.registry
 * @param {{ name: string, secure: boolean, options: object }} deps.cookie  cookieSettings() ka result
 * @param {Set<string>} deps.allowedOrigins
 */
export function createSessionController({
  config,
  authService,
  database,
  registry,
  cookie,
  allowedOrigins,
}) {
  // Cookie clear karte waqt wahi path/secure/sameSite/httpOnly dene padte hain jo set karte waqt the, warna browser use nahi hatata.
  const { maxAge, ...clearOptions } = cookie.options; // eslint-disable-line no-unused-vars

  return {
    /** Login par sirf origin check (token abhi hai hi nahi): login-CSRF (attacker victim ko apne account mein login karaye) rokta hai. */
    originGuard(req, _res, next) {
      try {
        assertOriginValid(req, { allowedOrigins });
        next();
      } catch (err) {
        next(err);
      }
    },

    async login(req, res) {
      // Secure cookie plain HTTP par browser/express-session chupchaap set hi nahi karte (login "safal" dikhta par session nahi
      // banti). Production mein ye proxy misconfiguration hai (TRUST_PROXY_HOPS / X-Forwarded-Proto): saaf error do.
      if (cookie.secure && !req.secure) {
        throw new Error(
          'Session cookie is Secure but this request is not HTTPS: set TRUST_PROXY_HOPS and make the proxy send X-Forwarded-Proto',
        );
      }

      const user = await authService.verifyCredentials({
        ...res.locals.valid.body,
        ip: req.ip ?? 'unknown',
      });

      // Session fixation se bachav: login se pehle ki session id (attacker ne pehle se jaan li ho) ko khatam karke NAYI id banao.
      await regenerate(req);
      req.session.userId = user.id;
      req.session.createdAt = Date.now();
      req.session.csrfToken = generateCsrfToken();
      await save(req);
      await registry.add(user.id, req.sessionID);
      await database.repositories.audit.record({
        actorId: user.id,
        action: 'session.login',
        entityType: 'User',
        entityId: user.id,
      });

      res.json({
        user,
        csrfToken: req.session.csrfToken,
        csrfHeader: 'X-CSRF-Token',
        idleTimeoutSeconds: config.session.idleMinutes * 60,
        absoluteTimeoutSeconds: config.session.absoluteHours * 3600,
      });
    },

    async logout(req, res) {
      await registry.remove(req.session.userId, req.sessionID);
      await destroy(req);
      res.clearCookie(cookie.name, clearOptions);
      res.status(204).end();
    },

    /** Sab devices se logout: bearer refresh tokens + saari browser sessions (current bhi). */
    async logoutAll(req, res) {
      await authService.logoutAll({ userId: req.session.userId });
      res.clearCookie(cookie.name, clearOptions);
      res.status(204).end();
    },

    async me(req, res) {
      const user = await database.repositories.users.findById(req.session.userId);
      if (!user || user.status !== 'ACTIVE')
        throw new AuthenticationError('Authentication required');
      res.json({ user });
    },

    /** Page reload ke baad SPA ko CSRF token wapas chahiye (login response ka token JS memory se gaya): yahan se milta hai. */
    csrf(req, res) {
      res.json({ csrfToken: req.session.csrfToken, csrfHeader: 'X-CSRF-Token' });
    },
  };
}
