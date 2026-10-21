# Middleware

## Purpose

The request pipeline every request passes through before and after routing: identity (request ID), observability (logging), baseline security (headers), parsing, and the fallbacks (404, error mapping). Production middleware lives in `src/middleware/`; teaching examples live separately in `src/examples/middleware-examples.routes.js` (non-production only).

## Order (defined in `src/app.js`)

```
1  requestId            src/middleware/request-id.js
2  requestLogger *      src/middleware/request-logger.js   (* skipped for /health via unless())
3  securityHeaders      src/middleware/security-headers.js (Helmet)
4  /health router
5  /static (express.static)
6  /api/v1 router:  express.json -> express.urlencoded -> module routers -> examples (non-prod)
7  notFound
8  clientErrorHandler   (error middleware, 4 args; Phase 4 replaces with the central handler)
```

Why this order:

| Position                               | Reason                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID before logger                       | The logger creates its child logger from `res.locals.requestId` when the request starts. Reversed, every log line loses its ID (verified by mutation).                 |
| Logger before everything that responds | It hooks `res.on('close')`, so it records the final status of 404s, parser errors and rejected requests too.                                                           |
| Headers before parsers/routes/static   | Any response, including errors raised later, carries them. Putting Helmet after `/api/v1` leaves parse-error responses without headers (verified by mutation).         |
| Health after the three, before parsing | Probes get an ID and headers but no logging noise and no body parsing.                                                                                                 |
| Parsers inside `/api/v1` only          | Cost and attack surface apply only where bodies are expected; explicit 100kb limit.                                                                                    |
| 404, then error handler last           | They only run for what nothing earlier handled. Routes registered after `createApp()` returns land after the 404 and are never reached; add routes inside the routers. |

## Categories

| Category                                | Where                                       | Example here                                                 |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Application-level (`app.use`)           | `src/app.js`                                | `requestId`, `requestLogger`, `securityHeaders`              |
| Router-level (`router.use`)             | `src/routes/api.routes.js`, example routers | body parsers on `/api/v1`; `trace('router-level')`           |
| Route-level (args to `router.get(...)`) | `src/http/route-guards.js`, examples        | `requireJson`, `requireNumericParam`, `trace('route-a')`     |
| Built-in / third-party                  | `express.json`, `express.static`, `helmet`  |                                                              |
| Error-handling (4 args)                 | `src/http/client-errors.js`                 | `clientErrorHandler`                                         |
| Conditional wrappers                    | `src/middleware/conditional.js`             | `unless(isHealthCheck, requestLogger)`, `when(isDebug, ...)` |

## `next()` semantics

- `next()`: continue to the next matching middleware/handler.
- `next(err)`: skip all normal middleware and handlers; jump to the next error-handling middleware (4 args). Demo: `GET /api/v1/examples/middleware/fail` → the later middleware and handler never run (counters stay 0), response is a safe 400.
- Sending a response and **not** calling `next()` ends the pipeline. Always `return res...` so code after it cannot call `next()` too. Demo: `GET .../guarded` without `x-demo-role: admin` → 403 and the handler counter stays 0.
- Express 5: a rejected promise or thrown error in an async handler is passed to `next(err)` automatically.
- `next('route')` is a Phase 21 lab topic.

## Request IDs

- Header `X-Request-Id` (request and response). A valid incoming ID is reused so one ID can follow a call across services (correlation); otherwise a UUID v4 is generated.
- "Valid" = `[A-Za-z0-9._-]{8,128}`. Anything else is replaced, so clients cannot inject junk or long strings into logs.
- Stored in `res.locals.requestId`; the response always carries it, including on 404s and errors.

## `res.locals` rules

Only request-scoped values needed downstream: `requestId` and `log` (child logger with the ID). Do not stash entities, user objects or secrets there. `res.locals` lives and dies with one response, so concurrent requests never share it (tested with 20 parallel requests).

## `req.app`

Gives any handler the owning app, e.g. `req.app.locals.config`, without importing it. Demo: `GET .../app-config`. Prefer injecting what a module needs when constructing it; use `req.app` for genuinely app-wide read-only settings.

## Logging and sensitive data

- Pino, JSON lines, one per request at response close: `requestId, method, status, durationMs`, plus `route` (the pattern, e.g. `/echo/:value`) when a route matched, or `path` (no query string, max 200 chars) when nothing matched. The route pattern is relative to its router (`/ping`, not `/api/v1/examples/ping`).
- Level: 2xx/3xx `info`, 4xx `warn`, 5xx `error`. A connection closed before the response finished logs `request aborted` at `warn` with `aborted: true`.
- **Never logged:** query strings, headers (Authorization, Cookie), cookies, request/response bodies, path-parameter values of matched routes (reset/verify tokens will live there).
- Defense in depth: `REDACT_PATHS` in `src/logging/logger.js` censors `password`, `token`, `authorization`, `cookie`, … (also one level nested) if a developer logs such an object. Redaction is a safety net, not a licence to log bodies.
- `LOG_LEVEL` (`trace|debug|info|warn|error|fatal|silent`): default `info`, `silent` when `NODE_ENV=test`.
- Health probes are not logged; set `LOG_LEVEL` appropriately instead of logging every probe.

## Teaching examples (`/api/v1/examples/middleware`, non-production only)

| Endpoint               | Shows                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| `/chain`               | router-level → route-level a → b → handler, `res.locals` carrying the request ID |
| `/conditional?debug=1` | `when()` conditional middleware                                                  |
| `/guarded`             | stopping the pipeline with a response (demo guard, **not** auth)                 |
| `/fail`                | `next(err)`                                                                      |
| `/app-config`          | `req.app`                                                                        |
| `/stats`               | per-app counters proving what ran                                                |

## Tests

`npm test` → `tests/integration/middleware.test.js`, `tests/unit/middleware-units.test.js`, `tests/unit/config.test.js` (log level). `tests/helpers/log-capture.js` captures real Pino output for assertions.

## Tradeoffs

- Own request-logger instead of `pino-http`: ~40 lines, full control over what is (not) logged. Revisit if serializers/sampling are needed.
- Helmet is on defaults; Phase 11 reviews CSP/HSTS/CORS for the real client topology.
- One ID serves as request and correlation ID; propagation into background jobs arrives in Phase 14/19.
- Startup/shutdown messages use the same Pino logger; the config-error message before logger creation still uses `console.error`.
