import helmet from 'helmet';

/**
 * Baseline security headers (Helmet defaults). Mounted before everything that can
 * respond so 404s, parse errors and static files carry them too. Phase 11 reviews
 * and tunes the policy (CSP, HSTS, CORS).
 */
export function securityHeaders() {
  return helmet();
}
