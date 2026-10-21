// Admin ke routes (`/api/v1/admin/...`). Sab routes admin permissions maangte hain (default deny: customer/seller 403).
// Database nahi to khaali router.

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import {
  auditListQuery,
  optionalNoteBody,
  productIdParams,
  productModerationListQuery,
  reasonBody,
  sellerIdParams,
  sellerListQuery,
} from './admin.schemas.js';

export function createAdminRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;

  const sellerReview = [authenticate, requirePermission(PERMISSIONS.ADMIN_SELLER_REVIEW)];
  const productModeration = [authenticate, requirePermission(PERMISSIONS.ADMIN_PRODUCT_MODERATE)];
  const auditRead = [authenticate, requirePermission(PERMISSIONS.ADMIN_AUDIT_READ)];

  router.get(
    '/sellers',
    ...sellerReview,
    validate({ query: sellerListQuery }),
    controller.listSellers,
  );
  router.post(
    '/sellers/:sellerId/approve',
    ...sellerReview,
    validate({ params: sellerIdParams, body: optionalNoteBody }),
    controller.sellerTransition('approve'),
  );
  router.post(
    '/sellers/:sellerId/reject',
    ...sellerReview,
    validate({ params: sellerIdParams, body: reasonBody }),
    controller.sellerTransition('reject'),
  );
  router.post(
    '/sellers/:sellerId/suspend',
    ...sellerReview,
    validate({ params: sellerIdParams, body: reasonBody }),
    controller.sellerTransition('suspend'),
  );
  router.post(
    '/sellers/:sellerId/reinstate',
    ...sellerReview,
    validate({ params: sellerIdParams, body: optionalNoteBody }),
    controller.sellerTransition('reinstate'),
  );

  router.get(
    '/products',
    ...productModeration,
    validate({ query: productModerationListQuery }),
    controller.listProducts,
  );
  router.post(
    '/products/:productId/approve',
    ...productModeration,
    validate({ params: productIdParams, body: optionalNoteBody }),
    controller.productDecision('approve'),
  );
  router.post(
    '/products/:productId/reject',
    ...productModeration,
    validate({ params: productIdParams, body: reasonBody }),
    controller.productDecision('reject'),
  );

  router.get(
    '/audit-events',
    ...auditRead,
    validate({ query: auditListQuery }),
    controller.listAuditEvents,
  );

  return router;
}
