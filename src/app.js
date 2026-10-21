import express from 'express';
import { createReadiness } from './health/readiness.js';
import { createHealthRouter } from './health/health.routes.js';

/**
 * Build the Express app. Opens no port and reads no process-level state, so
 * tests and the server both construct it the same way.
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

  return app;
}
