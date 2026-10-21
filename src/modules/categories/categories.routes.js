// Categories ke routes (`/api/v1/categories`): public, login nahi chahiye. Database nahi to khaali router (mount hi nahi hota).
// Naya category banana admin route hai: POST /api/v1/admin/categories.
import { Router } from 'express';

export function createCategoriesRouter(deps) {
  const router = Router();
  if (!deps) return router;
  router.get('/', deps.controller.list);
  return router;
}
