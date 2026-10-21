// Products ke routes (`/api/v1/products/...`). Do tarah ke routes ek hi router mein:
//   1. PUBLIC reads (login nahi chahiye): GET / (list + search/filter/sort/pagination) aur GET /:productId. Sirf ACTIVE products.
//   2. SELLER routes (login + permission + ownership): create, apni list/detail, edit, stock, submit, archive.
// Database nahi to khaali router (routes tab mount hi nahi hote).
//
// Seller routes: authenticate (bearer YA session) -> requirePermission -> validate -> controller (ownership service mein).
//
// Order ka dhyaan: literal path `/mine` ko `/:productId` se PEHLE rakhna zaruri hai, warna "mine" ko productId samajhkar 400 aata.
// (Express routes upar se neeche match karta hai.)

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import {
  createProductBodySchema,
  productIdParamsSchema,
  publicProductListQuerySchema,
  sellerProductListQuerySchema,
  stockAdjustBodySchema,
  stockBodySchema,
  updateProductBodySchema,
} from './products.schemas.js';

export function createProductsRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const params = validate({ params: productIdParamsSchema });

  // --- Public catalog (koi authenticate nahi) ---
  router.get('/', validate({ query: publicProductListQuerySchema }), controller.listPublic);

  // --- Seller: apne products padhna (literal `/mine` pehle) ---
  router.get(
    '/mine',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_READ_OWN),
    validate({ query: sellerProductListQuerySchema }),
    controller.listMine,
  );
  router.get(
    '/mine/:productId',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_READ_OWN),
    params,
    controller.getMine,
  );

  // --- Public detail (ACTIVE nahi to 404) ---
  router.get('/:productId', params, controller.getPublic);

  // --- Seller mutations ---
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
    '/:productId/stock/adjust',
    authenticate,
    requirePermission(PERMISSIONS.INVENTORY_UPDATE_OWN),
    validate({ params: productIdParamsSchema, body: stockAdjustBodySchema }),
    controller.adjustStock,
  );
  router.post(
    '/:productId/submit',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_SUBMIT_OWN),
    params,
    controller.submit,
  );
  router.delete(
    '/:productId',
    authenticate,
    requirePermission(PERMISSIONS.PRODUCT_ARCHIVE_OWN),
    params,
    controller.archive,
  );

  return router;
}
