// Reviews ke routes. Paths do alag prefixes par hain, isliye ye router `/api/v1` ke root par mount hota hai (poore paths yahin):
//   GET    /products/:productId/reviews   public list (sort, pagination)
//   POST   /products/:productId/reviews   review likhna (login + permission; ek user ek product par ek)
//   PATCH  /reviews/:reviewId             apna review badalna (sirf malik)
//   DELETE /reviews/:reviewId             apna review hatana (sirf malik; admin ka raasta /admin/reviews/:id/remove)
// Database nahi to khaali router.
import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import {
  createReviewBody,
  productReviewsParams,
  reviewIdParams,
  reviewListQuery,
  updateReviewBody,
} from './reviews.schemas.js';

export function createReviewsRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;

  router.get(
    '/products/:productId/reviews',
    validate({ params: productReviewsParams, query: reviewListQuery }),
    controller.listForProduct,
  );
  router.post(
    '/products/:productId/reviews',
    authenticate,
    requirePermission(PERMISSIONS.REVIEW_CREATE),
    validate({ params: productReviewsParams, body: createReviewBody }),
    controller.create,
  );
  router.patch(
    '/reviews/:reviewId',
    authenticate,
    requirePermission(PERMISSIONS.REVIEW_UPDATE_OWN),
    validate({ params: reviewIdParams, body: updateReviewBody }),
    controller.update,
  );
  router.delete(
    '/reviews/:reviewId',
    authenticate,
    requirePermission(PERMISSIONS.REVIEW_DELETE_OWN),
    validate({ params: reviewIdParams }),
    controller.remove,
  );
  return router;
}
