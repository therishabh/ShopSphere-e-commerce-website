// Route-specific middleware ka collection: chhote guards jo kisi ek route par lagte hain, e.g.
//   router.post('/notes', requireJson, handler)
// Guard fail ho to handler tak request pahunchti hi nahi.
//
// Rule: ye guards response khud nahi likhte. Fail hone par `next(new SomeError(...))` karte hain, taaki saare
// errors central errorHandler se ek hi shape mein nikalein (src/http/error-handler.js).

import {
  MethodNotAllowedError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../errors/app-errors.js';

/**
 * Route-specific middleware reused by route modules. Ye response khud nahi likhte; AppError ke saath
 * `next(err)` karte hain, taaki saare errors central errorHandler se ek hi shape mein nikalein.
 */

// Body JSON honi chahiye. `req.is('json')` Content-Type header check karta hai.
// Zaruri isliye: Content-Type match na ho to body parser body ko parse hi nahi karta aur `req.body` undefined rehta hai.
// `_res` ka underscore = "ye argument use nahi ho raha" (eslint ise unused nahi maanta).
export function requireJson(req, _res, next) {
  if (!req.is('json')) {
    // `return next(err)`: error forward karo AUR yahin ruk jao (aage next() na chale).
    return next(new UnsupportedMediaTypeError('Content-Type must be application/json'));
  }
  next();
}

// HTML form body (`a=1&b=2`) ke liye same guard.
export function requireUrlEncoded(req, _res, next) {
  if (!req.is('application/x-www-form-urlencoded')) {
    return next(
      new UnsupportedMediaTypeError('Content-Type must be application/x-www-form-urlencoded'),
    );
  }
  next();
}

/**
 * Path parameter ko positive integer hona chahiye, warna handler chalne se pehle reject.
 * Ye function ek *middleware banane wala function* hai: requireNumericParam('id') ek middleware return karta hai.
 *
 * Regex: pehla digit 1-9 (0 aur leading zero ('01') reject), phir 0 se 9 aur digits (max 10 digits total,
 * taaki bahut bade number se overflow/DoS na ho).
 * (Express 5 mein `/:id(\d+)` jaisa inline regex support nahi hai, isliye validation middleware mein hoti hai.)
 */
export function requireNumericParam(name) {
  return (req, _res, next) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params[name])) {
      return next(
        new ValidationError(`Path parameter "${name}" must be a positive integer`, {
          code: 'INVALID_PARAMETER',
        }),
      );
    }
    next();
  };
}

/**
 * `router.route(path).get(...).post(...).all(methodNotAllowed([...]))` ke end mein lagane wala handler.
 * `.all()` tabhi chalta hai jab upar ke specific method handlers mein se koi match na hua ho, yaani method galat hai:
 * tab 405 + `Allow` header (batata hai kaunse methods allowed hain). OPTIONS ka sahi jawab (204) bhi yahin se.
 * `HEAD` aur `OPTIONS` hamesha allowed list mein jodte hain (HEAD Express GET se automatically handle karta hai).
 */
export function methodNotAllowed(allowed) {
  // Set = duplicates hata deta hai; join = "GET, POST, HEAD, OPTIONS" jaisi header string.
  const allow = [...new Set([...allowed, 'HEAD', 'OPTIONS'])].join(', ');
  return (req, res, next) => {
    if (req.method === 'OPTIONS') {
      // Browser/clients "ye path kaunse methods support karta hai?" poochte hain; jawab: 204 + Allow header.
      res.set('Allow', allow);
      return res.sendStatus(204);
    }
    // Baaki galat methods: error handler 405 banata hai aur Allow header lagata hai (MethodNotAllowedError.headers se).
    next(new MethodNotAllowedError({ allow }));
  };
}
