// `/api/v1` ka router: API ke saare routes yahin se jude hain.
// Is file ko prefixes aur parsers ki jaankari hai; har feature ke andar ka detail uske apne module mein hai.

// `express` default export (json/urlencoded parsers ke liye) aur `Router` named export dono chahiye.
import express, { Router } from 'express';
// Feature modules: abhi sab khaali hain (URL space reserved); apne-apne phase mein bharenge.
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { createSellersRouter } from '../modules/sellers/sellers.routes.js';
import { createProductsRouter } from '../modules/products/products.routes.js';
import { createCartRouter } from '../modules/cart/cart.routes.js';
import { createOrdersRouter } from '../modules/orders/orders.routes.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
// Teaching examples: sirf seekhne/demo ke liye, production mein mount nahi hote.
import { createHttpExamplesRouter } from '../examples/http-examples.routes.js';
import { createMiddlewareExamplesRouter } from '../examples/middleware-examples.routes.js';
import { createErrorExamplesRouter } from '../examples/error-examples.routes.js';

// Request body ki maximum size. Isse bada body bhejne par 413 (Payload Too Large) milta hai,
// taaki koi bahut bada body bhejkar server ki memory na kha sake.
export const BODY_LIMIT = '100kb';

/**
 * `/api/v1` par mount hone wala router. Andar ka order jaan-boojh kar aisa hai:
 *   1. body parsers (sirf API routes par lagte hain, explicit size limit ke saath)
 *   2. feature module routers
 *   3. teaching examples (sirf non-production mein)
 * Jo request yahan match nahi hoti wo app-level 404 handler tak jaati hai.
 */
export function createApiRouter({ config }) {
  const api = Router();

  // Parsers routes se PEHLE hone chahiye, warna handler ko `req.body` khaali milega.
  // express.json: `Content-Type: application/json` wali body ko JS object banata hai (req.body).
  api.use(express.json({ limit: BODY_LIMIT }));
  // express.urlencoded: HTML form wali body (`a=1&b=2`) parse karta hai.
  // `extended: false` = simple parsing; `a[b]=1` jaisi nested keys object mein expand nahi hoti (zyada safe).
  api.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));

  // Har feature ka router apne prefix par mount hota hai: e.g. /api/v1/auth/...
  api.use('/auth', createAuthRouter());
  api.use('/users', createUsersRouter());
  api.use('/sellers', createSellersRouter());
  api.use('/products', createProductsRouter());
  api.use('/cart', createCartRouter());
  api.use('/orders', createOrdersRouter());
  api.use('/admin', createAdminRouter());

  // Teaching examples production mein expose nahi hone chahiye (wo real feature nahi hain).
  if (config.env !== 'production') {
    // Zyada specific prefixes pehle mount karo: '/examples/middleware' ko '/examples' se pehle,
    // warna '/examples' wala router unke requests pehle pakad leta.
    api.use('/examples/middleware', createMiddlewareExamplesRouter());
    api.use('/examples/errors', createErrorExamplesRouter());
    api.use('/examples', createHttpExamplesRouter());
  }

  return api;
}
