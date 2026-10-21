// Application ke saare *expected* (operational) errors ki hierarchy.
//
// Do tarah ke errors hote hain:
//   1. Operational (expected): user ne galat input diya, resource nahi mila, login nahi hai... Ye normal
//      zindagi hai. `AppError` ki subclasses hain, `isOperational = true`, client ko inka message dikhta hai.
//   2. Unexpected (programmer error / system failure): bug, DB down, library crash. Inka asli message/stack
//      client ko NAHI dikhta (leak ho sakta hai); client ko sirf generic 500 milta hai, details sirf server logs mein.
//
// IMPORTANT contract: AppError ka `message` client ko seedha dikhaya jaata hai. Isliye usme internal detail,
// SQL, file path, ya user ka diya hua raw input mat daalo. Internal detail `cause` mein rakho (wo sirf log hota hai).

export class AppError extends Error {
  /**
   * @param {string} message client-safe message
   * @param {object} [options]
   * @param {number} [options.statusCode] HTTP status code
   * @param {string} [options.code] stable machine-readable code (clients isi par if/else karte hain)
   * @param {Array}  [options.details] extra structured info (e.g. validation ki field-wise galtiyan)
   * @param {object} [options.headers] response headers jo is error ke saath jaane chahiye (Allow, Retry-After)
   * @param {unknown} [options.cause] asli underlying error (sirf logs mein jaata hai, client ko kabhi nahi)
   * @param {boolean} [options.isOperational] false = unexpected error
   */
  constructor(
    message,
    {
      statusCode = 500,
      code = 'INTERNAL_ERROR',
      details,
      headers,
      cause,
      isOperational = true,
    } = {},
  ) {
    super(message, { cause });
    // `new.target.name` = actual subclass ka naam (NotFoundError...), logs mein useful.
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.headers = headers;
    this.isOperational = isOperational;
  }
}

// 400: input galat hai (body/query/params). `details` mein field-wise problems de sakte ho.
// `code` override ho sakta hai (e.g. 'INVALID_PARAMETER') jab alag pehchaan chahiye.
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', { code = 'VALIDATION_ERROR', ...options } = {}) {
    super(message, { ...options, statusCode: 400, code });
  }
}

// 400: request hi samajh nahi aayi (malformed JSON, undecodable URL...).
export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', options = {}) {
    super(message, { ...options, statusCode: 400, code: 'BAD_REQUEST' });
  }
}

// 401: aap kaun ho ye pata nahi (login nahi / token invalid). Authentication ki failure.
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', options = {}) {
    super(message, { ...options, statusCode: 401, code: 'UNAUTHENTICATED' });
  }
}

// 403: aap kaun ho pata hai, lekin ye karne ki permission nahi. Authorization ki failure.
// `code` override ho sakta hai jab client ko alag pehchan chahiye (e.g. 'EMAIL_NOT_VERIFIED', 'ACCOUNT_DISABLED').
export class AuthorizationError extends AppError {
  constructor(message = 'Forbidden', { code = 'FORBIDDEN', ...options } = {}) {
    super(message, { ...options, statusCode: 403, code });
  }
}

// 404: resource ya route exist nahi karta (ya jaan-boojh kar chhupaya gaya hai).
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options = {}) {
    super(message, { ...options, statusCode: 404, code: 'NOT_FOUND' });
  }
}

// 405: path hai, lekin ye HTTP method allowed nahi. `allow` = allowed methods ki comma-separated string;
// standard ke hisaab se `Allow` header mein jaati hai.
export class MethodNotAllowedError extends AppError {
  constructor({ allow, message = 'Method not allowed', ...options } = {}) {
    super(message, {
      ...options,
      statusCode: 405,
      code: 'METHOD_NOT_ALLOWED',
      headers: allow ? { Allow: allow } : undefined,
    });
  }
}

// 409: state conflict (duplicate email, SKU already exists, version mismatch).
export class ConflictError extends AppError {
  constructor(message = 'Conflict', options = {}) {
    super(message, { ...options, statusCode: 409, code: 'CONFLICT' });
  }
}

// 413: request body limit se bada.
export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload Too Large', options = {}) {
    super(message, { ...options, statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}

// 415: Content-Type is endpoint ke liye supported nahi.
export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Unsupported Media Type', options = {}) {
    super(message, { ...options, statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
}

// 429: bahut zyada requests. `retryAfterSeconds` se `Retry-After` header jaata hai.
export class RateLimitError extends AppError {
  constructor({ retryAfterSeconds, message = 'Too many requests', ...options } = {}) {
    super(message, {
      ...options,
      statusCode: 429,
      code: 'RATE_LIMITED',
      headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined,
    });
  }
}

// 500: unexpected failure. Message hamesha generic rehta hai; asli error `cause` mein jaata hai
// (server log mein dikhta hai, client ko nahi). `isOperational = false` ka matlab: ye hamare liye
// investigate karne wali cheez hai, user ki galti nahi.
export class InternalError extends AppError {
  constructor({ cause } = {}) {
    super('Internal Server Error', {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      cause,
      isOperational: false,
    });
  }
}

// 503: koi zaruri dependency (jaise database) abhi available nahi (connection refused, timeout, pool band...).
// Ye hamari taraf ki infra problem hai (client ki galti nahi), isliye isOperational=false: logs mein `error` level
// par dikhti hai aur investigate karni padti hai. Client ko generic message + Retry-After milta hai.
export class ServiceUnavailableError extends AppError {
  constructor({ cause, retryAfterSeconds = 5 } = {}) {
    super('Service temporarily unavailable', {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      cause,
      isOperational: false,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }
}
