// Wishlist ke routes (`/api/v1/wishlist`): sab login + `wishlist:manage:own` permission (customer aur seller). Database nahi to
// khaali router.
//   GET    /                 meri wishlist (public products, pagination)
//   PUT    /:productId       add (idempotent: 201 naya, 200 pehle se)
//   DELETE /:productId       hatana (nahi tha to 404)
import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import { wishlistListQuery, wishlistProductParams } from './wishlist.schemas.js';

export function createWishlistRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const guard = [authenticate, requirePermission(PERMISSIONS.WISHLIST_MANAGE_OWN)];

  router.get('/', ...guard, validate({ query: wishlistListQuery }), controller.list);
  router.put('/:productId', ...guard, validate({ params: wishlistProductParams }), controller.add);
  router.delete(
    '/:productId',
    ...guard,
    validate({ params: wishlistProductParams }),
    controller.remove,
  );
  return router;
}
