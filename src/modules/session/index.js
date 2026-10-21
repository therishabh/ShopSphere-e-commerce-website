// Session module ka composition root: Redis-backed cookie sessions + routes.
//
// Ye module tabhi banta hai jab Redis configured ho (REDIS_URL). Nahi hai to session routes mount nahi hote aur sirf bearer auth chalta hai.

import { randomBytes } from 'node:crypto';
import { createSessionController } from './session.controller.js';
import {
  cookieSettings,
  createAuthenticateSession,
  createSessionMiddleware,
} from './session.middleware.js';
import { createSessionRouter } from './session.routes.js';

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} deps.database
 * @param {{ client: object }} deps.redis  createRedis() ka result
 * @param {import('pino').Logger} deps.logger
 * @param {object} deps.authService
 * @param {{ add: Function, remove: Function, revokeAll: Function }} deps.registry
 */
export function createSessionModule({ config, database, redis, logger, authService, registry }) {
  let secret = config.session.secret;
  if (!secret) {
    // Dev mein secret na ho to har run par naya random (production mein config isse pehle rok deti hai). Restart par purani cookies bekaar.
    secret = randomBytes(48).toString('base64url');
    logger.warn(
      'SESSION_SECRET is not set: using a random secret for this run (existing session cookies stop working after a restart)',
    );
  }

  const cookie = cookieSettings(config);
  const absoluteSeconds = config.session.absoluteHours * 3600;
  // CSRF origin check ke liye allowed origin: frontend ka (APP_BASE_URL). Request ka apna origin bhi allowed hai (csrf.js).
  const allowedOrigins = new Set([new URL(config.auth.appBaseUrl).origin]);

  const middleware = createSessionMiddleware({ config, redis: redis.client, secret });
  const authenticate = createAuthenticateSession({ absoluteSeconds, allowedOrigins });
  const controller = createSessionController({
    config,
    authService,
    database,
    registry,
    cookie,
    allowedOrigins,
  });

  return {
    middleware,
    authenticate,
    router: createSessionRouter({ controller, authenticateSession: authenticate }),
  };
}
