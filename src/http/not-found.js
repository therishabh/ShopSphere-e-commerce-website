import { NotFoundError } from '../errors/app-errors.js';

/**
 * Final fallback: koi route match na hua to yahan aata hai. Khud response nahi banata; NotFoundError
 * ko errorHandler tak bhejta hai, taaki 404 ka shape baaki errors jaisa hi rahe. Requested path message
 * mein echo nahi hota.
 */
export function notFound(_req, _res, next) {
  next(new NotFoundError());
}
