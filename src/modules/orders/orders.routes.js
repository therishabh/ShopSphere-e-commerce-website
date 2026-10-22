// Orders ke routes. Do routers, database ho tabhi asli (warna khaali router: 404).
//
// createOrdersRouter -> `/api/v1/orders`:
//   POST   /                         checkout (Idempotency-Key header zaruri; body: shippingAddress + paymentToken)
//   GET    /                         meri order history (pagination, ?status=, sort)
//   GET    /seller                   (seller) mere orders (sirf paid ke baad ke), items + address
//   GET    /seller/:orderId          (seller) ek order
//   PATCH  /seller/:orderId/status   (seller) PROCESSING | SHIPPED | DELIVERED
//   GET    /:orderId                 mera order + payment + timeline
//   POST   /:orderId/cancel          mera PAID order cancel (stock wapas + refund)
// Literal `/seller` ko `/:orderId` se PEHLE rakha hai (warna "seller" ko orderId samajhkar 400 aata).
//
// createAdminOrdersRouter -> `/api/v1/admin/orders`:
//   GET /, GET /:orderId, PATCH /:orderId/status (cancel/refund bhi), POST /reconcile (atke payments/refunds)
import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import { requireIdempotencyKey } from './idempotency-key.js';
import {
  adminStatusBody,
  checkoutBody,
  orderIdParams,
  orderListQuery,
  reconcileBody,
  sellerStatusBody,
} from './orders.schemas.js';

export function createOrdersRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const params = validate({ params: orderIdParams });

  router.post(
    '/',
    authenticate,
    requirePermission(PERMISSIONS.ORDER_CREATE),
    requireIdempotencyKey,
    validate({ body: checkoutBody }),
    controller.checkout,
  );
  router.get(
    '/',
    authenticate,
    requirePermission(PERMISSIONS.ORDER_READ_OWN),
    validate({ query: orderListQuery }),
    controller.listMine,
  );

  // --- Seller (literal `/seller` pehle) ---
  router.get(
    '/seller',
    authenticate,
    requirePermission(PERMISSIONS.SELLER_ORDER_READ_OWN),
    validate({ query: orderListQuery }),
    controller.listForSeller,
  );
  router.get(
    '/seller/:orderId',
    authenticate,
    requirePermission(PERMISSIONS.SELLER_ORDER_READ_OWN),
    params,
    controller.getForSeller,
  );
  router.patch(
    '/seller/:orderId/status',
    authenticate,
    requirePermission(PERMISSIONS.SELLER_ORDER_FULFIL),
    validate({ params: orderIdParams, body: sellerStatusBody }),
    controller.sellerTransition,
  );

  router.get(
    '/:orderId',
    authenticate,
    requirePermission(PERMISSIONS.ORDER_READ_OWN),
    params,
    controller.getMine,
  );
  router.post(
    '/:orderId/cancel',
    authenticate,
    requirePermission(PERMISSIONS.ORDER_CANCEL_OWN),
    params,
    controller.cancelMine,
  );
  return router;
}

export function createAdminOrdersRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const read = [authenticate, requirePermission(PERMISSIONS.ADMIN_ORDER_READ)];
  const manage = [authenticate, requirePermission(PERMISSIONS.ADMIN_ORDER_MANAGE)];

  router.get('/', ...read, validate({ query: orderListQuery }), controller.listForAdmin);
  router.post('/reconcile', ...manage, validate({ body: reconcileBody }), controller.reconcile);
  router.get('/:orderId', ...read, validate({ params: orderIdParams }), controller.getForAdmin);
  router.patch(
    '/:orderId/status',
    ...manage,
    validate({ params: orderIdParams, body: adminStatusBody }),
    controller.adminTransition,
  );
  return router;
}
