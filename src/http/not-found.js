// Final 404 handler: jab koi bhi route/middleware request ko handle nahi karta, wo yahin aati hai.
// app.js mein ye sabse aakhir mein (error handler se theek pehle) mount hota hai.

import { NotFoundError } from '../errors/app-errors.js';

/**
 * Final fallback: koi route match na hua to yahan aata hai. Khud response nahi banata; NotFoundError
 * ko errorHandler tak bhejta hai, taaki 404 ka shape baaki errors jaisa hi rahe. Requested path message
 * mein echo nahi hota (reflected-content/XSS jaisi galtiyon se bachne ke liye).
 */
export function notFound(_req, _res, next) {
  // next(err) = "ye error hai": Express normal middleware skip karke error middleware par jaata hai.
  next(new NotFoundError());
}
