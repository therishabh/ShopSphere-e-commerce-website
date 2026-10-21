// Koi bhi thrown value (Error, string, library ka error...) ko ek AppError mein badalta hai,
// taaki error handler ko sirf ek hi type se deal karna pade.
//
// Classification:
//   AppError                     -> jaisa hai waisa (hum ne jaan-boojh kar throw kiya)
//   ZodError                     -> ValidationError (400) with field-wise details
//   Mongo/Mongoose error         -> 409 / 404 / 400 / 503 (src/db/map-database-error.js)
//   status 4xx wali library error -> matching AppError (body-parser ka malformed JSON / bada body,
//                                    Express ka undecodable URL, static file ka blocked path...)
//   baaki sab (bug, DB down...)  -> InternalError (500), original error `cause` mein (sirf logs ke liye)

import { STATUS_CODES } from 'node:http';
import { ZodError } from 'zod';
import { mapDatabaseError } from '../db/map-database-error.js';
import { zodIssuesToDetails } from './zod-details.js';
import {
  AppError,
  AuthorizationError,
  BadRequestError,
  InternalError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from './app-errors.js';

// body-parser aur Express ke errors `http-errors` format mein aate hain: `err.status` (ya statusCode)
// aur kabhi `err.type`. Unhe hum apne error classes par map karte hain, taaki response shape wahi rahe.
function fromClientStatus(status, err) {
  switch (status) {
    case 400:
      // 'entity.parse.failed' = body-parser ko JSON parse nahi hua. Raw parse message (jisme body ka
      // tukda ho sakta hai) client ko nahi dikhate; fixed message dete hain.
      return new BadRequestError(
        err.type === 'entity.parse.failed' ? 'Malformed request body' : undefined,
        { cause: err },
      );
    case 403:
      return new AuthorizationError(undefined, { cause: err });
    case 404:
      return new NotFoundError(undefined, { cause: err });
    case 413:
      return new PayloadTooLargeError(undefined, { cause: err });
    case 415:
      return new UnsupportedMediaTypeError(undefined, { cause: err });
    default:
      return new AppError(STATUS_CODES[status] ?? 'Client Error', {
        statusCode: status,
        code: 'CLIENT_ERROR',
        cause: err,
      });
  }
}

export function toAppError(err) {
  if (err instanceof AppError) return err;

  // Kisi ne seedha schema.parse() karke ZodError throw kiya (e.g. service ya route mein).
  if (err instanceof ZodError) {
    return new ValidationError('Validation failed', {
      details: zodIssuesToDetails(err.issues),
      cause: err,
    });
  }

  // Database (MongoDB/Mongoose) ke errors: duplicate -> 409, missing document -> 404, DB down -> 503...
  // Jo pehchane nahi jaate wo null dete hain aur neeche InternalError ban jaate hain.
  const fromDatabase = mapDatabaseError(err);
  if (fromDatabase) return fromDatabase;

  // `err?.status`: err null/undefined/string ho to bhi crash nahi karta.
  const status = err?.status ?? err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status <= 499) {
    return fromClientStatus(status, err);
  }

  // Yahan tak aaye = unexpected. Plain Error, 5xx status wali library error, throw 'string', throw null...
  return new InternalError({ cause: err });
}
