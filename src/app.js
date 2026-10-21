// Ye file Express app ki poori wiring karti hai: kaunsa middleware/router kis order mein lagega.
// Yahan sirf app *banta* hai; port nahi khulta (wo server.js ka kaam hai), isliye tests bina port ke
// isse seedha use kar sakte hain (Supertest).
//
// Express ka core idea: ek request `app.use(...)` se registered cheezon se *registration order mein* guzarti hai.
// Jo pehle match karke response bhej deta hai wahi handle karta hai, warna `next()` se agle ko milti hai.
// Isliye is file mein sab se important cheez ORDER hai (neeche har step ka reason likha hai).

import path from 'node:path';
import express from 'express';
import { createReadiness } from './health/readiness.js';
import { createHealthRouter } from './health/health.routes.js';
import { createApiRouter } from './routes/api.routes.js';
import { notFound } from './http/not-found.js';
import { createErrorHandler } from './http/error-handler.js';
import { createLogger } from './logging/logger.js';
import { requestId } from './middleware/request-id.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { unless } from './middleware/conditional.js';

// Health probes (/health/live, /health/ready) load balancer/Kubernetes har kuch second mein maarte hain.
// Unka log likhna bekaar noise hoga, isliye is check se unhe logger se skip karte hain (neeche `unless` mein use hota hai).
// `req.path` = URL ka path hissa (query string ke bina), e.g. '/health/ready'.
const isHealthCheck = (req) => req.path.startsWith('/health');

// Static files wala folder: project root ka `public/`.
// `import.meta.dirname` = is file (src/app.js) ka folder (`src/`), isliye `..` se ek level upar jaakar `public`.
const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

/**
 * Express app banata hai. Ye port nahi kholta aur process-level state (jaise process.env) nahi padhta,
 * isliye tests aur server dono ek hi tareeke se app bana sakte hain.
 *
 * Middleware order (har step jaan-boojh kar is jagah hai; detail ke liye docs/modules/middleware.md
 * aur docs/modules/routing-and-http.md dekho):
 *   request ID -> request logger -> security headers -> health -> static assets
 *   -> /api/v1 (parsers + modules) -> 404 -> error handler
 *
 * @param {object} options
 * @param {object} options.config loadConfig() se aaya validated config
 * @param {object} [options.readiness] readiness tracker; default: bina kisi dependency check ke wala
 * @param {object} [options.logger] pino logger; default: config.logLevel se bana hua
 * @param {object} [options.database] createDatabase() ka result (ho to); routes/services isse `req.app.locals.database` se lete hain
 *
 * `readiness` aur `logger` parameters isliye hain ki tests apne fake/capture wale pass kar sakein.
 */
export function createApp({
  config,
  readiness = createReadiness(),
  logger = createLogger({ level: config.logLevel }),
  database,
}) {
  const app = express();

  // Response se `X-Powered-By: Express` header hata deta hai (attacker ko framework ka pata kyun dena).
  app.disable('x-powered-by');

  // `app.locals` = poori app ke liye shared (read-only jaisa) store.
  // Kisi bhi handler/router mein `req.app.locals.config` se config mil jata hai, import kiye bina.
  app.locals.config = config;
  // Database handle (ho to): repositories aur transaction helper. Abhi routes use nahi karte; aane wale modules karenge.
  app.locals.database = database;

  // 1. Request ID sabse pehle: iske baad ka sab kuch (logs, errors, handlers) is ID ko use kar sakta hai.
  //    Agar ye baad mein hota to logger ko ID milti hi nahi.
  app.use(requestId);

  // 2. Logger doosre number par: ye response ke 'close' event par log likhta hai, isliye usko har response ka
  //    final status dikhta hai (404, parser error, rejected request sab). Agar ye routes ke baad hota, to jo
  //    requests pehle hi reject ho jaati unka log nahi aata.
  //    `unless(isHealthCheck, ...)` = health probes par ye middleware chalao hi mat (noise kam).
  app.use(unless(isHealthCheck, createRequestLogger(logger)));

  // 3. Security headers (Helmet) kisi bhi response bhejne wale code se pehle, taaki 404 aur errors par bhi lagein.
  app.use(securityHeaders());

  // `app.use('/health', router)`: sirf wahi requests is router tak jaati hain jinka path '/health' se shuru ho.
  // Health parsers se pehle isliye hai ki probes ko body parse karne ki zarurat hi nahi.
  app.use('/health', createHealthRouter(readiness));

  // Static files example: `public/` ke andar ki files `/static/...` par milti hain (e.g. /static/example.txt).
  // Options:
  //   index: false         -> folder ka index.html auto-serve nahi (directory listing/index leak nahi)
  //   dotfiles: 'ignore'   -> `.env` jaisi dot-files ko aise treat karo jaise exist hi nahi karti (404)
  //   maxAge: '1h'         -> browser 1 ghanta cache kare (Cache-Control: public, max-age=3600)
  // Ye API se pehle hai taaki static requests kabhi body-parsing wale hisse tak pahunchein hi nahi.
  // File na mile to express.static khud response nahi deta, `next()` kar deta hai (neeche 404 tak).
  app.use(
    '/static',
    express.static(PUBLIC_DIR, { index: false, dotfiles: 'ignore', maxAge: '1h' }),
  );

  // Saare API routes `/api/v1` ke neeche. Body parsers aur module routers is router ke andar hain
  // (src/routes/api.routes.js), isliye parsing sirf API requests par hoti hai.
  app.use('/api/v1', createApiRouter({ config, database, logger }));

  // 4. Aakhir mein 404: ye normal middleware hai (NotFoundError bana ke errorHandler ko deta hai). Yahan tak sirf wahi request pahunchti hai jise upar
  //    kisi ne handle nahi kiya. Isse upar koi route add karna hai to router ke andar karo; `createApp()` ke
  //    baad `app.get(...)` lagaoge to wo is 404 ke *baad* register hoga aur kabhi match nahi hoga.
  app.use(notFound);

  // 5. Sabse aakhir mein error handler. Express error handler ko uske 4 arguments (err, req, res, next)
  //    se pehchanta hai. Ye tab chalta hai jab koi middleware `next(err)` kare ya error throw kare
  //    ya sync throw / rejected Promise ho (e.g. malformed JSON, body bahut bada, service ka error). Ye hamesha
  //    sabse last hona chahiye, warna upar ke errors isse nahi guzarte.
  app.use(createErrorHandler({ logger }));

  return app;
}
