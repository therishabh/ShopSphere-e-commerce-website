// CSRF (Cross-Site Request Forgery) protection: cookie-authenticated, state-changing requests ke liye.
//
// Khatra: browser cookie apne aap har request ke saath bhejta hai, chahe request kisi aur site ke page se trigger hui ho
// (evil.com ka form hamari site par POST kare). Isliye "cookie aayi" ka matlab "user ne ye chaha" nahi hota.
//
// Hamare do layers (dono lagte hain):
//   1. Synchronizer token: login par random token session mein rakhte hain aur client ko dete hain. Unsafe request (POST/PUT/PATCH/
//      DELETE) ko header `X-CSRF-Token` mein wahi token bhejna padta hai. evil.com wo token padh nahi sakta (same-origin policy),
//      isliye request bana nahi sakta. Compare constant-time hota hai.
//   2. Origin check: browser `Origin` header apne aap lagata hai; wo allowed origin se alag ho (ya `Sec-Fetch-Site: cross-site`) to reject.
// Upar se cookie `SameSite=Lax` hai (cross-site POST par cookie jaati hi nahi): teen layers.
//
// Sirf COOKIE se authenticated requests par lagta hai. Bearer-token requests par nahi: `Authorization` header browser apne aap nahi
// lagata, isliye wahan CSRF ka sawal hi nahi uthta.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthorizationError } from '../../errors/app-errors.js';

// Safe methods state nahi badalte; unpar CSRF token nahi maangte.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken() {
  return randomBytes(32).toString('base64url');
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // timingSafeEqual ke liye lambai barabar honi chahiye; alag lambai = seedha mismatch (token ki lambai secret nahi).
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Origin check: `Origin` header ho to allowed origins mein se ek hona chahiye. Header na ho (curl, server-to-server, kuch purane
 * browsers) to allow: wahan token check hai. Request ka apna origin bhi allowed (frontend aur API ek hi origin par ho to).
 * @param {import('express').Request} req
 * @param {Set<string>} allowedOrigins  e.g. new Set(['https://shop.example.com'])
 */
export function originIsAllowed(req, allowedOrigins) {
  if (req.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.get('origin');
  if (!origin) return true;
  return allowedOrigins.has(origin) || origin === `${req.protocol}://${req.get('host')}`;
}

/**
 * Unsafe method par origin + token dono verify. Fail par 403 (`CSRF_ORIGIN_INVALID` / `CSRF_TOKEN_INVALID`).
 * @param {import('express').Request} req
 * @param {{ allowedOrigins: Set<string> }} options
 */
export function assertCsrfValid(req, { allowedOrigins }) {
  if (SAFE_METHODS.has(req.method)) return;
  if (!originIsAllowed(req, allowedOrigins)) {
    throw new AuthorizationError('Cross-site request rejected', { code: 'CSRF_ORIGIN_INVALID' });
  }
  if (!tokensMatch(req.session?.csrfToken, req.get(CSRF_HEADER))) {
    throw new AuthorizationError('Missing or invalid CSRF token', { code: 'CSRF_TOKEN_INVALID' });
  }
}

/** Safe methods ko chhodkar baaki par sirf origin check (login jaise endpoints ke liye jahan abhi token hai hi nahi). */
export function assertOriginValid(req, { allowedOrigins }) {
  if (SAFE_METHODS.has(req.method)) return;
  if (!originIsAllowed(req, allowedOrigins)) {
    throw new AuthorizationError('Cross-site request rejected', { code: 'CSRF_ORIGIN_INVALID' });
  }
}
