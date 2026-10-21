// Auth ke routes (`/api/v1/auth/...`).
//
// Do shapes hain:
//   - createAuthRouter()              -> khaali router. Jab database configure nahi hai (auth ko users/tokens store karne hain),
//                                        module mounted rehta hai par koi endpoint nahi deta (fake endpoint nahi).
//   - createAuthRouter({ controller, authenticate }) -> asli endpoints.

import { Router } from 'express';
import { validate } from '../../http/validate.js';
import {
  emailOnlyBody,
  loginBody,
  logoutBody,
  refreshBody,
  resetPasswordBody,
  signupBody,
  verifyEmailBody,
} from './auth.schemas.js';

// Auth responses mein tokens hote hain: browser/proxy/CDN ko cache karne se mana.
function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

export function createAuthRouter(deps) {
  const router = Router();
  if (!deps) return router;

  const { controller, authenticate } = deps;
  router.use(noStore);

  router.post('/signup', validate({ body: signupBody }), controller.signup);
  router.post('/login', validate({ body: loginBody }), controller.login);
  router.post('/refresh', validate({ body: refreshBody }), controller.refresh);
  router.post('/logout', validate({ body: logoutBody }), controller.logout);
  router.post('/logout-all', authenticate, controller.logoutAll);
  router.get('/me', authenticate, controller.me);
  router.post('/verify-email', validate({ body: verifyEmailBody }), controller.verifyEmail);
  router.post(
    '/resend-verification',
    validate({ body: emailOnlyBody }),
    controller.resendVerification,
  );
  router.post('/forgot-password', validate({ body: emailOnlyBody }), controller.forgotPassword);
  router.post('/reset-password', validate({ body: resetPasswordBody }), controller.resetPassword);

  return router;
}
