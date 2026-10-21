import { Router } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../errors/app-errors.js';

/**
 * Error-handling teaching examples, mounted at /api/v1/examples/errors (never in production).
 * Each route fails in a different way; the central error handler must turn every one into the
 * same safe response shape. None of these use try/catch or an async wrapper: Express 5 forwards
 * thrown errors and rejected Promises to the error handler on its own.
 */

// "kind" -> error jo throw hota hai. Har ek operational (expected) error ka example.
const OPERATIONAL = {
  validation: () =>
    new ValidationError('Validation failed', {
      details: [{ path: 'email', message: 'Invalid email' }],
    }),
  authentication: () => new AuthenticationError(),
  authorization: () => new AuthorizationError(),
  'not-found': () => new NotFoundError('Product not found'),
  conflict: () => new ConflictError('SKU already exists'),
  'rate-limit': () => new RateLimitError({ retryAfterSeconds: 30 }),
};

// Ek "database adapter" ki nakal: driver ke errors me internal detail hota hai
// (host, port, query). Ye detail client tak kabhi nahi jaani chahiye.
const fakeDatabase = {
  async findProduct() {
    throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432 (db-internal)'), {
      code: 'ECONNREFUSED',
    });
  },
};

// Ek "service": domain rule ke liye AppError throw karti hai, driver ke errors ko wapas bhej deti hai.
const fakeService = {
  async reserveSku(sku) {
    if (sku === 'taken') throw new ConflictError('SKU already exists');
    if (sku === 'missing') throw new NotFoundError('SKU not found');
    return { sku, reserved: true };
  },
  async loadProduct() {
    return fakeDatabase.findProduct(); // DB fail -> yahi error upar jayega, kisi wrapper ke bina
  },
};

export function createErrorExamplesRouter() {
  const router = Router();

  // Operational AppErrors, har class ke liye ek.
  router.get('/raise/:kind', (req, _res) => {
    const make = OPERATIONAL[req.params.kind];
    if (!make) throw new NotFoundError('Unknown error kind');
    throw make();
  });

  // Sync throw: programming error -> 500, message client ko nahi dikhega.
  router.get('/sync-throw', () => {
    throw new Error('secret internal detail: sync');
  });

  // Rejected Promise bina try/catch aur bina wrapper ke (Express 5 khud pakadta hai).
  router.get('/async-reject', async () => {
    await Promise.reject(new Error('secret internal detail: async'));
  });

  // next(err): middleware se error forward karna.
  router.get('/next-err', (_req, _res, next) => {
    next(new Error('secret internal detail: next'));
  });

  // Non-Error value throw karna (bura practice, lekin handler ko crash nahi karna chahiye).
  router.get('/throw-string', () => {
    throw 'secret internal detail: string';
  });

  // Async service ka domain error (expected) aur database adapter ka error (unexpected).
  router.get('/service/reserve/:sku', async (req, res) => {
    res.json(await fakeService.reserveSku(req.params.sku));
  });
  router.get('/service/load', async (_req, res) => {
    res.json(await fakeService.loadProduct());
  });

  // Response shuru hone ke baad error: headers + thoda body bhej diya, phir fail. Ab JSON error response
  // nahi ban sakta; handler ko Express ke default handler ko delegate karna hai (connection band hoga).
  router.get('/after-headers', (_req, res, next) => {
    res.status(200).type('text/plain');
    res.write('partial');
    next(new Error('failed after headers were sent'));
  });

  return router;
}
