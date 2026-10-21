// Browser session ke routes (`/api/v1/session/...`). Bearer routes (`/auth/...`) se alag namespace: do auth tareeke mix na hon.
//
//   POST /session/login        credentials -> cookie + CSRF token
//   POST /session/logout       (cookie + CSRF token)
//   POST /session/logout-all   (cookie + CSRF token)
//   GET  /session/me           (cookie)
//   GET  /session/csrf         (cookie)

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { loginBody } from '../auth/auth.schemas.js';

// Session responses mein CSRF token hota hai: cache nahi hona chahiye.
function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

export function createSessionRouter({ controller, authenticateSession }) {
  const router = Router();
  router.use(noStore);

  router.post('/login', controller.originGuard, validate({ body: loginBody }), controller.login);
  // authenticateSession unsafe methods par CSRF token bhi verify karta hai (csrf.js).
  router.post('/logout', authenticateSession, controller.logout);
  router.post('/logout-all', authenticateSession, controller.logoutAll);
  router.get('/me', authenticateSession, controller.me);
  router.get('/csrf', authenticateSession, controller.csrf);

  return router;
}
