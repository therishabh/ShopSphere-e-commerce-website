/** Route-specific middleware reused by route modules. */

export function requireJson(req, res, next) {
  if (!req.is('json')) {
    return res.status(415).json({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' },
    });
  }
  next();
}

export function requireUrlEncoded(req, res, next) {
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/x-www-form-urlencoded',
      },
    });
  }
  next();
}

/** Rejects a path parameter that is not a positive integer before the handler runs. */
export function requireNumericParam(name) {
  return (req, res, next) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params[name])) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PARAMETER',
          message: `Path parameter "${name}" must be a positive integer`,
        },
      });
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
  return (req, res) => {
    res.set('Allow', allow);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  };
}
