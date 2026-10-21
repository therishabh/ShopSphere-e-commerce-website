import { Router } from 'express';

/**
 * Products routes. Intentionally empty: the module is mounted so the URL space is
 * reserved and wired, but it exposes no endpoints until its phase implements them.
 */
export function createProductsRouter() {
  return Router();
}
