// Auth module ka composition root: saari auth dependencies yahin jodi jaati hain aur router banta hai.
//
// Baaki app ko sirf `createAuthModule(...)` aur uska result (`router`, `authenticate`) dikhta hai.

import { randomBytes } from 'node:crypto';
import { createAttemptLimiter } from './attempt-limiter.js';
import { createAuthController } from './auth.controller.js';
import { createAuthenticate } from './auth.middleware.js';
import { createAuthRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { createPasswordHasher } from './password-hasher.js';
import { createTokenService } from './token-service.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} deps.database  connected (ya connecting) createDatabase() ka result
 * @param {import('pino').Logger} deps.logger
 * @param {object} deps.mailer
 * @param {{ revokeAll: (userId: string) => Promise<number> }} [deps.sessions]  browser sessions registry (Redis ho tab)
 */
export function createAuthModule({ config, database, logger, mailer, sessions }) {
  let secret = config.auth.jwtSecret;
  if (!secret) {
    // Dev/test mein secret na ho to har startup par naya random secret (production mein config isse pehle hi rok deti hai).
    // Nuksaan: server restart par saare purane access tokens invalid. Asli secret .env mein AUTH_JWT_SECRET se do.
    secret = randomBytes(48).toString('base64url');
    logger.warn(
      'AUTH_JWT_SECRET is not set: using a random secret for this run (access tokens stop working after a restart)',
    );
  }
  if (config.env === 'production') {
    logger.warn(
      'Email delivery uses the in-memory test mailer: verification and reset emails are NOT delivered until a real provider adapter is added',
    );
  }

  const passwords = createPasswordHasher();
  const tokens = createTokenService({
    secret,
    accessTtlSeconds: config.auth.accessTokenTtlSeconds,
  });

  const limiters = {
    loginPair: createAttemptLimiter({ maxAttempts: 5, windowMs: 15 * MINUTE_MS }),
    loginIp: createAttemptLimiter({ maxAttempts: 30, windowMs: 15 * MINUTE_MS }),
    loginEmail: createAttemptLimiter({ maxAttempts: 20, windowMs: 15 * MINUTE_MS }),
    mailEmail: createAttemptLimiter({ maxAttempts: 3, windowMs: HOUR_MS }),
    mailIp: createAttemptLimiter({ maxAttempts: 20, windowMs: HOUR_MS }),
  };

  const authService = createAuthService({
    database,
    passwords,
    tokens,
    mailer,
    limiters,
    config,
    logger,
    sessions,
  });
  const authenticate = createAuthenticate(tokens);
  const controller = createAuthController({ authService });

  return { authService, authenticate, router: createAuthRouter({ controller, authenticate }) };
}
