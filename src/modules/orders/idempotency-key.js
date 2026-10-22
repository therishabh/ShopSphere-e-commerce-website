// `Idempotency-Key` header ka middleware (sirf order create jaise retry-unsafe POST par lagta hai).
//
// Idempotency kya hai: client ka network toot jaye to wo wahi POST dobara bhejta hai, par pata nahi pehla chala ya nahi. Client har
// "ek asli kaam" ke liye ek random key (UUID) banata hai aur retry par wahi key bhejta hai; server same key par naya order nahi
// banata, pehle ka hi response lauta deta hai.
//
// Header ka format yahin check hota hai (body ke Zod schema ki tarah, controller se pehle). Key client ka diya hua hai, isliye
// strict: 16..128 characters, sirf letters/digits/`._:-` (database key mein bina dikkat jaaye, logs mein injection na ho).
import { ValidationError } from '../../errors/app-errors.js';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function requireIdempotencyKey(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (key === undefined || !KEY_PATTERN.test(key)) {
    return next(
      new ValidationError('A valid Idempotency-Key header is required', {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        details: [
          {
            path: 'Idempotency-Key',
            message:
              'send a unique 16 to 128 character key (a UUID works) made of letters, digits and ._:-',
          },
        ],
      }),
    );
  }
  res.locals.idempotencyKey = key;
  next();
}
