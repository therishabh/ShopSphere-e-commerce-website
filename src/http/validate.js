// Request validation middleware: params, query aur body ko Zod schemas se check karta hai,
// controller/handler chalne SE PEHLE. Galat input ho to handler tak request pahunchti hi nahi.
//
// Kaise use karte hain:
//   router.post('/products', validate({ body: createProductBody }), handler)
// Handler mein validated (aur normalized: numbers, defaults, transforms laga hua) data yahan milta hai:
//   res.locals.valid.body / res.locals.valid.query / res.locals.valid.params
// Raw `req.body` / `req.query` / `req.params` ko handler mein use mat karo; wo unvalidated hain.

import { UnsupportedMediaTypeError, ValidationError } from '../errors/app-errors.js';
import { zodIssuesToDetails } from '../errors/zod-details.js';

/**
 * @param {object} schemas
 * @param {import('zod').ZodType} [schemas.params] URL path params ka schema
 * @param {import('zod').ZodType} [schemas.query] query string ka schema
 * @param {import('zod').ZodType} [schemas.body] JSON body ka schema
 *
 * Schemas ke liye `z.strictObject({...})` use karo: schema mein na likhi hui koi bhi extra key reject ho jaati hai.
 * Isse "mass assignment" (client ka chupke se `role: 'admin'` jaisa field bhejna) aur typo wali query keys pakdi jaati hain.
 */
export function validate({ params, query, body } = {}) {
  return function validateRequest(req, res, next) {
    // Body schema ho to Content-Type JSON hona zaruri hai. Warna body parser body ko parse hi nahi karta
    // (req.body undefined rehta) aur client ko "field missing" jaisa confusing error milta; 415 saaf hai.
    if (body && !req.is('json')) {
      return next(new UnsupportedMediaTypeError('Content-Type must be application/json'));
    }

    const valid = {};
    const details = [];

    // Teeno sources ko ek jaise tareeke se check karte hain. Saari galtiyan ek saath collect karte hain
    // (pehli galti par ruk nahi jaate), taaki client ek hi baar mein sab fix kar sake.
    const targets = [
      ['params', params, req.params],
      ['query', query, req.query],
      // Body undefined ho sakti hai (JSON hai par khaali body); {} maanke schema ko required fields ka error dene dete hain.
      ['body', body, req.body ?? {}],
    ];

    for (const [source, schema, value] of targets) {
      if (!schema) continue;
      // safeParse: galti par throw nahi karta, { success, data | error } deta hai.
      const result = schema.safeParse(value);
      if (result.success) valid[source] = result.data;
      else details.push(...zodIssuesToDetails(result.error.issues, source));
    }

    if (details.length > 0) {
      // Error handler isse 400 VALIDATION_ERROR response bana deta hai (details ke saath).
      return next(new ValidationError('Validation failed', { details }));
    }

    // Express 5 mein `req.query` read-only getter hai (assign nahi kar sakte), isliye teeno ke validated
    // versions `res.locals.valid` mein rakhte hain (res.locals sirf is ek request ka scratchpad hai).
    res.locals.valid = valid;
    next();
  };
}
