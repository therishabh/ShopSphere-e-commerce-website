// Auth module ke routes. Abhi jaan-boojh kar khaali hai.
// Module mounted hai (src/routes/api.routes.js mein /api/v1/auth par), isliye URL space reserved hai,
// lekin jab tak iska phase implement nahi hota koi endpoint expose nahi hota: fake endpoint banane se
// behtar hai ki request seedha 404 par jaye. Endpoints yahan aayenge: router.get/post(...).
import { Router } from 'express';

/**
 * Auth routes. Intentionally empty: the module is mounted so the URL space is
 * reserved and wired, but it exposes no endpoints until its phase implements them.
 */
export function createAuthRouter() {
  // Khaali Router: koi route register nahi, isliye har request aage ke 404 handler tak chali jaati hai.
  return Router();
}
