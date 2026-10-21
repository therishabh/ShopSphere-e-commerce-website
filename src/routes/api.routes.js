import express, { Router } from 'express';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { createSellersRouter } from '../modules/sellers/sellers.routes.js';
import { createProductsRouter } from '../modules/products/products.routes.js';
import { createCartRouter } from '../modules/cart/cart.routes.js';
import { createOrdersRouter } from '../modules/orders/orders.routes.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { createHttpExamplesRouter } from '../examples/http-examples.routes.js';
import { createMiddlewareExamplesRouter } from '../examples/middleware-examples.routes.js';

export const BODY_LIMIT = '100kb';

/**
 * Router mounted at /api/v1. Order inside is deliberate:
 *   1. body parsers (apply only to API routes, with an explicit size limit)
 *   2. feature module routers
 *   3. teaching examples (non-production only)
 * Unmatched requests fall through to the app-level 404 handler.
 */
export function createApiRouter({ config }) {
  const api = Router();

  api.use(express.json({ limit: BODY_LIMIT }));
  api.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));

  api.use('/auth', createAuthRouter());
  api.use('/users', createUsersRouter());
  api.use('/sellers', createSellersRouter());
  api.use('/products', createProductsRouter());
  api.use('/cart', createCartRouter());
  api.use('/orders', createOrdersRouter());
  api.use('/admin', createAdminRouter());

  if (config.env !== 'production') {
    api.use('/examples/middleware', createMiddlewareExamplesRouter());
    api.use('/examples', createHttpExamplesRouter());
  }

  return api;
}
