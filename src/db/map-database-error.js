// MongoDB/Mongoose (aur Redis client ke connectivity) errors ko hamare AppError mein badalta hai (to-app-error.js isse call karta hai).
//
// Kyun: services/repositories mein `try/catch` ke bina bhi duplicate email -> 409, missing document -> 404, database down -> 503
// jaise sahi responses milein. Controllers ko Mongo ke error codes (11000...) ka pata hi nahi chalta.
//
// Ye file mongoose/driver ko import nahi karti: error ko uske `name`/`code`/`errorLabels` se pehchanti hai (duck typing),
// isliye database ke bina bhi chalti hai. Error ki asli shapes `docs/modules/database-and-persistence.md` mein record hain.

import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../errors/app-errors.js';

// Driver ke network/connectivity errors (database tak pahunch hi nahi paye ya connection toot gaya).
const UNAVAILABLE_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoPoolClearedError',
  'MongoPoolClosedError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoWaitQueueTimeoutError',
  'MongoExpiredSessionError',
  // Redis (node-redis) ke connectivity errors: sessions store tak pahunch nahi paye.
  'ClientClosedError',
  'ClientOfflineError',
  'SocketClosedUnexpectedlyError',
  'SocketTimeoutError',
  'ConnectionTimeoutError',
  'ReconnectStrategyError',
]);

// Server ke error codes: 13 Unauthorized, 18 AuthenticationFailed (config problem: client ko 503, credentials leak nahi),
// 50 MaxTimeMSExpired, 262 ExceededTimeLimit (query/commit time se zyada chali).
const UNAVAILABLE_CODES = new Set([13, 18, 50, 262]);

function hasLabel(err, label) {
  const labels = err.errorLabelSet ?? err.errorLabels;
  if (!labels) return false;
  return Array.isArray(labels)
    ? labels.includes(label)
    : typeof labels.has === 'function' && labels.has(label);
}

// Mongoose validation ki har field ki galti ko client-safe detail mein badalta hai. Mongoose ka apna message value
// (user ka input) echo karta hai, isliye `kind` ke hisaab se fixed message dete hain.
function validationDetails(errors = {}) {
  const messageByKind = {
    required: 'is required',
    enum: 'is not an allowed value',
    min: 'is too small',
    max: 'is too large',
    minlength: 'is too short',
    maxlength: 'is too long',
    regexp: 'has an invalid format',
    user: 'is invalid',
  };
  return Object.entries(errors).map(([path, e]) => ({
    path,
    // `user` kind = hamara apna validator; uska message hamne likha hai (safe), baaki fixed.
    message:
      e.kind === 'user' && e.properties?.message
        ? e.properties.message.replace('{PATH}', path)
        : (messageByKind[e.kind] ?? 'is invalid'),
  }));
}

/** @returns {import('../errors/app-errors.js').AppError | null} null = ye Mongo/Mongoose ka jaana-pehchana error nahi */
export function mapDatabaseError(err) {
  if (!err || typeof err !== 'object' || typeof err.name !== 'string') return null;
  const { name, code } = err;

  // node-redis ke errors ka `err.name` sirf 'Error' hota hai (class ka naam constructor mein), isliye constructor ka naam bhi dekhte hain.
  const className = err.constructor?.name;
  if (
    UNAVAILABLE_NAMES.has(name) ||
    UNAVAILABLE_NAMES.has(className) ||
    (name === 'MongoServerError' && UNAVAILABLE_CODES.has(code))
  ) {
    return new ServiceUnavailableError({ cause: err });
  }
  // Mongoose ke buffer mein query atak gayi kyunki connection hi nahi bana ("buffering timed out").
  if (
    name === 'MongooseError' &&
    /buffering timed out|before initial connection/i.test(err.message)
  ) {
    return new ServiceUnavailableError({ cause: err });
  }

  // Transaction conflict (WriteConflict code 112 / TransientTransactionError label): driver ne retries kar liye the,
  // phir bhi aaya to client ko 409 (dobara try kare).
  if (code === 112 || hasLabel(err, 'TransientTransactionError') || name === 'VersionError') {
    return new ConflictError('Concurrent update, please retry', { cause: err });
  }
  // Unique index violation: duplicate email, SKU, review, wishlist item...
  if (code === 11000 || code === 11001)
    return new ConflictError('Resource already exists', { cause: err });
  // Server-side collection validator fail (CHECK jaisa): negative stock, galat order total... Aam taur par race condition.
  if (code === 121) return new ConflictError('Request violates a data rule', { cause: err });

  // Mongoose schema validation (required/enum/min/max). Service ne pehle validate kiya hota hai; yahan aana matlab
  // schema rule ne pakda. Details field-wise, values echo nahi hoti.
  if (name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
    return new ValidationError('Validation failed', {
      details: validationDetails(err.errors),
      cause: err,
    });
  }
  // Galat type/format ka value (e.g. ObjectId ki jagah "abc").
  if (name === 'CastError') {
    return new ValidationError('Validation failed', {
      details: [{ path: String(err.path ?? ''), message: 'is invalid' }],
      cause: err,
    });
  }
  // `.orFail()` par document nahi mila.
  if (name === 'DocumentNotFoundError')
    return new NotFoundError('Resource not found', { cause: err });

  // Baaki (StrictModeError = hamari programming galti, unknown errors): null -> InternalError (500).
  return null;
}
