// Sellers ke routes (`/api/v1/sellers/...`). Database nahi to khaali router (fake endpoint nahi).
//
// Har route: authenticate (bearer YA session) -> requirePermission -> validate -> controller.

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import { applyBody } from './sellers.schemas.js';

export function createSellersRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;

  router.post(
    '/apply',
    authenticate,
    requirePermission(PERMISSIONS.SELLER_APPLY),
    validate({ body: applyBody }),
    controller.apply,
  );
  router.get('/me', authenticate, requirePermission(PERMISSIONS.SELLER_READ_OWN), controller.me);

  return router;
}
