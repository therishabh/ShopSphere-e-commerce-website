// Security headers middleware: browser ko batata hai ki kaunse risky behaviours band rakhne hain.
// (e.g. X-Content-Type-Options: nosniff, Content-Security-Policy, X-Frame-Options)
//
// Helmet ek library hai jo ye headers ek saath set kar deti hai. Yahan sirf uska default setup hai.

import helmet from 'helmet';

/**
 * Baseline security headers (Helmet defaults). Ye har us code se pehle mount hota hai jo response bhej sakta
 * hai, taaki 404, parse errors aur static files par bhi headers lagein. Phase 11 mein policy (CSP, HSTS, CORS)
 * ko real client setup ke hisaab se review aur tune kiya jayega.
 */
export function securityHeaders() {
  // helmet() ek middleware function return karta hai; hum use jaisa hai waisa app.use mein de dete hain.
  return helmet();
}
