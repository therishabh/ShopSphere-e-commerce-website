// Request logger middleware: har request ke end par ek structured (JSON) log line likhta hai.
//
// Dhyaan rakho: yahan jaan-boojh kar sirf *metadata* log hota hai (method, status, time, route pattern),
// kabhi query string, headers, cookies, bodies ya path-param values nahi, kyunki unme passwords/tokens ho sakte hain.

// Unmatched request ka path log karte waqt maximum itne characters (lambe junk paths logs na bharein).
const MAX_LOGGED_PATH = 200;

// HTTP status se log level: 5xx = error (hamari galti), 4xx = warn (client ki galti), baaki info.
function levelFor(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * Response band hone par ek structured log line likhne wala middleware banata hai.
 *
 * Log hota hai: requestId, method, status, duration, aur route *pattern* (jaise /notes/:id) agar koi route
 * match hua. Sirf unmatched request par raw path log hota hai (query string hata ke).
 * Kabhi log nahi hota: query string, headers, cookies, request/response bodies, matched route ke path-param values.
 *
 * Saath mein `res.locals.log` par ek request-scoped child logger bhi rakhta hai (usme requestId juda hota hai),
 * jise aage ka code use kar sakta hai.
 */
export function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    // High-resolution timer (nanoseconds, BigInt) taaki chhoti durations bhi sahi naapi jayein.
    const start = process.hrtime.bigint();
    // `child` = parent logger jisme har log line mein requestId automatically judti hai.
    // requestId middleware isse pehle chalna zaruri hai, warna ye undefined hota.
    const log = logger.child({ requestId: res.locals.requestId });
    res.locals.log = log;

    // 'close' event: response poora bhej diya gaya HO YA client beech mein connection tod de, dono mein fire hota hai.
    // Isliye hum yahin log likhte hain, taaki aborted requests bhi dikhein.
    res.on('close', () => {
      const entry = {
        method: req.method,
        status: res.statusCode,
        // BigInt nanoseconds ko milliseconds (decimal) mein badla.
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      };
      // errorHandler ne agar error classify kiya to uska stable code (e.g. NOT_FOUND) isi ek line mein aata hai.
      if (res.locals.errorCode) entry.errorCode = res.locals.errorCode;
      // `req.route.path` = match hua route ka *pattern* (e.g. '/notes/:id'), asli value ('/notes/42') nahi.
      // Path-param mein token ho sakta hai (reset/verify links), isliye pattern log karte hain.
      if (req.route?.path) entry.route = req.route.path;
      // Koi route match nahi hua (404): raw path log karo, `?query` hata ke aur length limit ke saath.
      else entry.path = req.originalUrl.split('?')[0].slice(0, MAX_LOGGED_PATH);

      // `writableFinished` false = response poora likha jaane se pehle connection toot gaya.
      if (!res.writableFinished) {
        entry.aborted = true;
        log.warn(entry, 'request aborted');
        return;
      }
      // log[level](...) = log.info / log.warn / log.error me se jo levelFor ne chuna.
      log[levelFor(res.statusCode)](entry, 'request completed');
    });

    next();
  };
}
