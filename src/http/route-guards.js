import {
  MethodNotAllowedError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../errors/app-errors.js';

/**
 * Route-specific middleware reused by route modules. Ye response khud nahi likhte; AppError ke saath
 * `next(err)` karte hain, taaki saare errors central errorHandler se ek hi shape mein nikalein.
 */

export function requireJson(req, _res, next) {
  if (!req.is('json')) {
    return next(new UnsupportedMediaTypeError('Content-Type must be application/json'));
  }
  next();
}

export function requireUrlEncoded(req, _res, next) {
  if (!req.is('application/x-www-form-urlencoded')) {
    return next(
      new UnsupportedMediaTypeError('Content-Type must be application/x-www-form-urlencoded'),
    );
  }
  next();
}

/** Rejects a path parameter that is not a positive integer before the handler runs. */
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
 * Terminal handler for router.route(path).all(...): runs only when no earlier
 * method handler on that route matched. 405 + Allow, and a proper OPTIONS reply.
 */
export function methodNotAllowed(allowed) {
  const allow = [...new Set([...allowed, 'HEAD', 'OPTIONS'])].join(', ');
  return (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.set('Allow', allow);
      return res.sendStatus(204);
    }
    next(new MethodNotAllowedError({ allow }));
  };
}
