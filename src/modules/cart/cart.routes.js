// Cart ke routes (`/api/v1/cart`): sab login + `cart:manage:own` permission (customer aur seller; admin 403). Database nahi to khaali
// router (module mounted rehta hai, par endpoint nahi: 404).
//   GET    /                    cart + server-side prices/totals + har line ka status
//   POST   /items               { productId, quantity } add (nayi line 201, quantity badhi 200)
//   PATCH  /items/:productId    { quantity } set
//   DELETE /items/:productId    line hatana
//   DELETE /                    cart khaali
import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { PERMISSIONS } from '../authz/permissions.js';
import { addCartItemBody, cartProductParams, setCartItemBody } from './cart.schemas.js';

export function createCartRouter(deps) {
  const router = Router();
  if (!deps) return router;
  const { controller, authenticate, requirePermission } = deps;
  const guard = [authenticate, requirePermission(PERMISSIONS.CART_MANAGE_OWN)];

  router.get('/', ...guard, controller.get);
  router.post('/items', ...guard, validate({ body: addCartItemBody }), controller.addItem);
  router.patch(
    '/items/:productId',
    ...guard,
    validate({ params: cartProductParams, body: setCartItemBody }),
    controller.setQuantity,
  );
  router.delete(
    '/items/:productId',
    ...guard,
    validate({ params: cartProductParams }),
    controller.removeItem,
  );
  router.delete('/', ...guard, controller.clear);
  return router;
}
