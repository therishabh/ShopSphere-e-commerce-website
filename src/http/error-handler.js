// Final error middleware: app ke saare errors yahin aakar ek jaisa, safe response ban kar nikalte hain.
//
// Error yahan tak kaise pahunchta hai (Express 5):
//   - handler/middleware mein sync `throw`                   -> Express khud pakadta hai
//   - async handler ka rejected Promise (await fail)         -> Express 5 khud pakadta hai (wrapper ki zarurat nahi)
//   - `next(err)`                                            -> seedha
// Teeno cases mein Express normal middleware skip karke pehle 4-argument wale error middleware par aata hai.

import { toAppError } from '../errors/to-app-error.js';

// `throw 'text'` jaisa non-Error value ho to pino ke `err` serializer ke liye Error banate hain.
// Value ka content log nahi karte (kuch bhi ho sakta hai), sirf uska type.
function toLoggableError(err) {
  return err instanceof Error ? err : new Error(`Non-Error value thrown (${typeof err})`);
}

export function createErrorHandler({ logger }) {
  // 4 arguments (err, req, res, next) hona zaruri hai: Express isi se isse error middleware pehchanta hai.
  // `next` use na bhi ho to likhna padta hai.
  return function errorHandler(err, req, res, next) {
    const appError = toAppError(err);

    // Request-scoped logger (requestId ke saath). /health par request logger nahi chalta, isliye fallback.
    const log = res.locals.log ?? logger.child({ requestId: res.locals.requestId });

    // Request logger is code ko apni line mein daalta hai (ek request = ek line + errorCode).
    res.locals.errorCode = appError.code;

    // --- Logging: expected vs unexpected ---
    if (appError.isOperational) {
      // Expected failure (404, validation...): stack ki zarurat nahi, request log line mein status + errorCode
      // already aata hai. Sirf agar cause mila ho to debug level par rakhte hain.
      if (appError.cause)
        log.debug({ err: toLoggableError(appError.cause) }, 'operational error cause');
    } else {
      // Unexpected (bug, DB down...): full error + stack, `error` level par; ye alert/investigation ke liye hai.
      // Original error log karte hain (InternalError wrapper nahi), taaki stack asli jagah ka dikhe.
      log.error(
        { err: toLoggableError(appError.cause ?? appError), headersSent: res.headersSent },
        'unexpected error',
      );
    }

    // --- Response already shuru ho chuka ho (headers bhej diye) ---
    // Ab status/headers badal nahi sakte aur naya JSON body milakar half response kharab ho jayega.
    // Express ke docs ke mutabik error ko default handler ko delegate karte hain: wo connection band kar deta
    // hai, taaki client ko ye na lage ki response poora aur theek hai. (Log upar ho chuka hai.)
    if (res.headersSent) {
      if (appError.isOperational) {
        log.warn({ errorCode: appError.code }, 'error after response started; closing connection');
      }
      return next(err);
    }

    // --- Safe response ---
    // Body mein sirf: code, message, (optional) details. Kabhi stack, cause, ya raw error message nahi.
    // InternalError ka message hamesha generic hota hai.
    if (appError.headers) res.set(appError.headers);
    const body = { code: appError.code, message: appError.message };
    if (appError.details) body.details = appError.details;
    res.status(appError.statusCode).json({ error: body });
  };
}
