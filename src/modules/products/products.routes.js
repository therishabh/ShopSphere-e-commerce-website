// Products ke routes (`/api/v1/products/...`). Phase 8 mein sirf seller ke ownership-protected mutations hain; public catalog
// (list/search/detail), reviews, wishlist Phase 9 mein. Database nahi to khaali router.
//
// Har route: authenticate (bearer YA session) -> requirePermission -> validate -> controller (ownership service mein).

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import {
  createProductBodySchema,
  productIdParamsSchema,
  stockBodySchema,
  updateProductBodySchema,
} from './products.schemas.js';

export function createProductsRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const params = validate({ params: productIdParamsSchema });

  router.post(
    '/',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_CREATE),
    validate({ body: createProductBodySchema }),
    controller.create,
  );
  router.patch(
    '/:productId',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_UPDATE_OWN),
    validate({ params: productIdParamsSchema, body: updateProductBodySchema }),
    controller.update,
  );
  router.put(
    '/:productId/stock',
    authenticate,
    requirePermission(PERMISSIONS.INVENTORY_UPDATE_OWN),
    validate({ params: productIdParamsSchema, body: stockBodySchema }),
    controller.setStock,
  );
  router.post(
    '/:productId/submit',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_SUBMIT_OWN),
    params,
    controller.submit,
  );

  return router;
}
