import path from 'node:path';
import express from 'express';
import { createReadiness } from './health/readiness.js';
import { createHealthRouter } from './health/health.routes.js';
import { createApiRouter } from './routes/api.routes.js';
import { notFound } from './http/not-found.js';
import { clientErrorHandler } from './http/client-errors.js';

const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

/**
 * Build the Express app. Opens no port and reads no process-level state, so
 * tests and the server both construct it the same way.
 *
 * Mount order (each step is deliberate, see docs/modules/routing-and-http.md):
 *   health -> static assets -> /api/v1 (parsers + modules) -> 404 -> error handler
 *
 * @param {object} options
 * @param {object} options.config validated config from loadConfig()
 * @param {object} [options.readiness] readiness tracker; defaults to one with no checks
 */
export function createApp({ config, readiness = createReadiness() }) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.config = config;

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
