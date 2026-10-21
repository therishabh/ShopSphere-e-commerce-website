import path from 'node:path';
import express from 'express';
import { createReadiness } from './health/readiness.js';
import { createHealthRouter } from './health/health.routes.js';
import { createApiRouter } from './routes/api.routes.js';
import { notFound } from './http/not-found.js';
import { clientErrorHandler } from './http/client-errors.js';
import { createLogger } from './logging/logger.js';
import { requestId } from './middleware/request-id.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { unless } from './middleware/conditional.js';

const isHealthCheck = (req) => req.path.startsWith('/health');

const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

/**
 * Build the Express app. Opens no port and reads no process-level state, so
 * tests and the server both construct it the same way.
 *
 * Middleware order (each step is deliberate; see docs/modules/middleware.md and
 * docs/modules/routing-and-http.md):
 *   request ID -> request logger -> security headers -> health -> static assets
 *   -> /api/v1 (parsers + modules) -> 404 -> error handler
 *
 * @param {object} options
 * @param {object} options.config validated config from loadConfig()
 * @param {object} [options.readiness] readiness tracker; defaults to one with no checks
 * @param {object} [options.logger] pino logger; defaults to one built from config.logLevel
 */
export function createApp({
  config,
  readiness = createReadiness(),
  logger = createLogger({ level: config.logLevel }),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.config = config;

  // 1. ID first: everything after (logs, errors, handlers) can reference it.
  app.use(requestId);
  // 2. Logger second: its 'close' hook sees the final status of every response,
  //    including 404s and parser errors raised later. Probes are skipped to avoid noise.
  app.use(unless(isHealthCheck, createRequestLogger(logger)));
  // 3. Headers before any code path that can respond.
  app.use(securityHeaders());

  app.use('/health', createHealthRouter(readiness));

  // Static example: files under ./public served at /static. No directory index,
  // dotfiles ignored, short browser cache. Mounted before the API so asset
  // requests never reach body parsing.
  app.use(
    '/static',
    express.static(PUBLIC_DIR, { index: false, dotfiles: 'ignore', maxAge: '1h' }),
  );

  app.use('/api/v1', createApiRouter({ config }));

  app.use(notFound);
  app.use(clientErrorHandler);

  return app;
}
