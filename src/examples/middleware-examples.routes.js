import { Router } from 'express';
import { when } from '../middleware/conditional.js';

/**
 * Middleware teaching examples, mounted at /api/v1/examples/middleware (never in
 * production). Production middleware lives in src/middleware/; nothing in this file
 * is used by real features.
 *
 * Handlers report what ran (trace / call counters) so tests and readers can see the
 * pipeline's behaviour directly.
 */

/** Builds a middleware that appends `label` to the request-scoped trace and continues. */
function trace(label) {
  return (_req, res, next) => {
    res.locals.trace = [...(res.locals.trace ?? []), label];
    next();
  };
}

/**
 * Demo guard (NOT authentication): ends the pipeline with a 403 unless the caller sends
 * x-demo-role: <role>. Real authn/authz arrive in Phases 7-8.
 */
function requireDemoRole(role) {
  return (req, res, next) => {
    if (req.get('x-demo-role') !== role) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }
    next();
  };
}

export function createMiddlewareExamplesRouter() {
  // Fresh counters per router instance (per app), so tests are isolated.
  const calls = { handler: 0, afterError: 0 };

  const router = Router();

  // Router-level middleware: runs for every request that enters this router.
  router.use(trace('router-level'));

  // Chaining: router-level -> route-level a -> route-level b -> handler. Each calls next().
  // res.locals carries the trace; requestId was put there by the app-level requestId middleware.
  router.get('/chain', trace('route-a'), trace('route-b'), (_req, res) => {
    res.json({ requestId: res.locals.requestId, trace: [...res.locals.trace, 'handler'] });
  });

  // Conditional middleware: the debug step only runs when ?debug=1.
  router.get(
    '/conditional',
    when((req) => req.query.debug === '1', trace('debug')),
    (_req, res) => {
      res.json({ trace: [...res.locals.trace, 'handler'] });
    },
  );

  // Stopping the pipeline: a rejected request gets a response from the guard and the
  // handler never runs (see /stats).
  router.get('/guarded', requireDemoRole('admin'), (_req, res) => {
    calls.handler += 1;
    res.json({ ok: true });
  });

  // next(err): skips every remaining normal middleware/handler and goes to error handling.
  router.get(
    '/fail',
    (_req, _res, next) => next(Object.assign(new Error('demo failure'), { status: 400 })),
    (_req, _res, next) => {
      calls.afterError += 1;
      next();
    },
    (_req, res) => {
      calls.handler += 1;
      res.json({ ok: true });
    },
  );

  // req.app: reach app-level configuration from inside a router without importing it.
  router.get('/app-config', (req, res) => {
    const { env, logLevel } = req.app.locals.config;
    res.json({ env, logLevel });
  });

  router.get('/stats', (_req, res) => {
    res.json({ calls });
  });

  return router;
}
