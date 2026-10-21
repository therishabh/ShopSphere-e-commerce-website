// Middleware concepts ka teaching/demo router (`/api/v1/examples/middleware/...`). Real feature nahi hai.
// Har endpoint ek middleware concept dikhata hai: chaining, conditional middleware, pipeline rokna,
// next(err), req.app. Production mein mount nahi hota. Saath mein tests/integration/middleware.test.js padho.

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

/** Ek middleware banata hai jo request-scoped trace list mein `label` jodta hai aur aage badh jaata hai (`next()`). */
function trace(label) {
  return (_req, res, next) => {
    // `res.locals` ek request ka scratchpad hai. Naya array banate hain (purani list copy + label) taaki
    // original array mutate na ho.
    res.locals.trace = [...(res.locals.trace ?? []), label];
    next();
  };
}

/**
 * Demo guard (authentication NAHI hai): jab tak caller `x-demo-role: <role>` header na bheje tab tak 403 ke
 * saath pipeline rok deta hai. Asli authentication/authorization Phase 7-8 mein aayega.
 */
function requireDemoRole(role) {
  return (req, res, next) => {
    if (req.get('x-demo-role') !== role) {
      // `return` zaruri hai: response bhejne ke baad function yahin khatam ho, warna neeche `next()` bhi chal
      // jaata aur handler chal jaata (double response).
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }
    next();
  };
}

export function createMiddlewareExamplesRouter() {
  // Har router instance (yaani har app) ke fresh counters, taaki tests ek doosre se alag rahein.
  // Ye counters prove karte hain ki kaunsa handler/middleware sach mein chala.
  const calls = { handler: 0, afterError: 0 };

  const router = Router();

  // Router-level middleware: is router mein aane wali har request par chalta hai (har route se pehle).
  router.use(trace('router-level'));

  // Chaining: router-level -> route-level a -> route-level b -> handler. Har ek `next()` call karta hai.
  // `res.locals` trace aur requestId dono ko carry karta hai; requestId app-level `requestId` middleware ne rakha tha.
  router.get('/chain', trace('route-a'), trace('route-b'), (_req, res) => {
    res.json({ requestId: res.locals.requestId, trace: [...res.locals.trace, 'handler'] });
  });

  // Conditional middleware: 'debug' step sirf ?debug=1 par chalta hai (`when` helper, src/middleware/conditional.js).
  router.get(
    '/conditional',
    when((req) => req.query.debug === '1', trace('debug')),
    (_req, res) => {
      res.json({ trace: [...res.locals.trace, 'handler'] });
    },
  );

  // Pipeline rokna: reject hui request ko guard khud response de deta hai aur handler kabhi chalta nahi
  // (`/stats` mein handler count 0 rehta hai).
  router.get('/guarded', requireDemoRole('admin'), (_req, res) => {
    calls.handler += 1;
    res.json({ ok: true });
  });

  // next(err): baaki saare normal middleware/handlers skip ho jaate hain aur request error handling par jaati hai.
  // `Object.assign(new Error(...), { status: 400 })` = library jaisa error (status ke saath); central handler
  // use 400 BAD_REQUEST mein badalta hai aur 'demo failure' message client ko nahi dikhata.
  router.get(
    '/fail',
    (_req, _res, next) => next(Object.assign(new Error('demo failure'), { status: 400 })),
    (_req, _res, next) => {
      // Ye kabhi nahi chalna chahiye (upar next(err) ho chuka); counter 0 rehna chahiye.
      calls.afterError += 1;
      next();
    },
    (_req, res) => {
      calls.handler += 1;
      res.json({ ok: true });
    },
  );

  // req.app: router ke andar se app-level config tak pahunchna, bina import kiye. (`app.locals.config` app.js mein set hua)
  router.get('/app-config', (req, res) => {
    const { env, logLevel } = req.app.locals.config;
    res.json({ env, logLevel });
  });

  // Counters dikhata hai (tests isse verify karte hain ki rejected request controller tak nahi pahunchi).
  router.get('/stats', (_req, res) => {
    res.json({ calls });
  });

  return router;
}
