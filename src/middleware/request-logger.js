const MAX_LOGGED_PATH = 200;

function levelFor(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * One structured log line per request, written when the response closes.
 *
 * Logged: requestId, method, status, duration, and the route *pattern* (e.g. /notes/:id)
 * when a route matched. Only unmatched requests log the raw path, query string removed.
 * Never logged: query string, headers, cookies, request/response bodies, path-param values
 * of matched routes (they may carry tokens).
 *
 * Also puts a request-scoped child logger on res.locals.log for downstream code.
 */
export function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    const log = logger.child({ requestId: res.locals.requestId });
    res.locals.log = log;

    // 'close' fires both after a normal finish and when the client aborts early.
    res.on('close', () => {
      const entry = {
        method: req.method,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      };
      // errorHandler ne agar error classify kiya to uska stable code (e.g. NOT_FOUND) isi ek line mein aata hai.
      if (res.locals.errorCode) entry.errorCode = res.locals.errorCode;
      if (req.route?.path) entry.route = req.route.path;
      else entry.path = req.originalUrl.split('?')[0].slice(0, MAX_LOGGED_PATH);

      if (!res.writableFinished) {
        entry.aborted = true;
        log.warn(entry, 'request aborted');
        return;
      }
      log[levelFor(res.statusCode)](entry, 'request completed');
    });

    next();
  };
}
