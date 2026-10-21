# Express Concept Matrix

Single source of truth for what is actually done. Every concept named in the [playbook](../architecture/phases.md) is listed once, under the phase that owns it.

## Rules

1. **No concept is complete until all evidence exists:** implementation/demo, automated test or repeatable verification, focused documentation, and exact paths/commands for each.
2. Statuses advance one step at a time, only on evidence: `planned → in progress → implemented → tested → documented → verified`.
3. `verified` means the checks were actually run and passed. Environment-dependent checks (MongoDB, Redis, Docker) are noted in the test column and not marked verified when unrun.
4. Use exact repo-relative paths (and the command, if not a plain test file) in the location columns. `—` means no evidence yet.
5. Documentation links point to the page the owning phase will create; a link is valid only after that phase lands.
6. Phase 24 audits every row. Phase 25 must not report "all concepts complete" unless every row is `verified`.

**Current state: Phase 8 complete. Sections 1–4 are `verified`; section 5 is `verified` except "OpenAPI spec" and "Swagger UI" (built on branch `feature/openapi-swagger`, to be merged later); section 6 is `verified` except "Test database isolation" (strategy documented, no tests written); sections 7 and 8 are `verified`; every other concept is `planned`.**

Note: the `/health/ready` row is verified against fake dependency checks; the database-backed check is tracked under Persistence (Phase 6).

## 1. Foundation & lifecycle (Phase 1)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Express 5 app creation (`app.js`) | `src/app.js` | `tests/integration/health.test.js` | [application-foundation.md](../modules/application-foundation.md) | verified |
| Separate `server.js` / testable app without a port | `src/app.js`, `src/server.js` | `tests/integration/health.test.js`, `tests/integration/server.test.js` | [application-foundation.md](../modules/application-foundation.md) | verified |
| Validated environment configuration | `src/config/env.js` | `tests/unit/config.test.js` | [application-foundation.md](../modules/application-foundation.md) | verified |
| Predictable startup | `src/server.js` | `tests/integration/server.test.js` (bind, EADDRINUSE, invalid config exit 1) | [application-foundation.md](../modules/application-foundation.md) | verified |
| Dev/start/test/lint/format scripts | `package.json` scripts | `npm test`, `npm run lint`, `npm run format:check` run; `npm start` and `npm run dev` run manually against `/health/*` | [application-foundation.md](../modules/application-foundation.md) | verified |
| `/health/live` | `src/health/health.routes.js` | `tests/integration/health.test.js` | [application-foundation.md](../modules/application-foundation.md) | verified |
| `/health/ready` (real dependency readiness) | `src/health/readiness.js`, `src/health/health.routes.js` | `tests/unit/readiness.test.js`, `tests/integration/health.test.js` (fake check up/down/timeout/shutdown; real DB check arrives in the persistence phase) | [application-foundation.md](../modules/application-foundation.md) | verified |

## 2. HTTP & routing (Phase 2)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Modular routers under `/api/v1` | `src/routes/api.routes.js` | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Route modules: auth, users, sellers, products, cart, orders, admin | `src/modules/*/*.routes.js` (empty, mounted) | `tests/integration/routing.test.js` (each module 404s, no fake endpoints) | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Route params | `src/examples/http-examples.routes.js` (`/echo/:value`, `/notes/:id`) | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Query params | `src/examples/http-examples.routes.js` (`/echo/:value`, `/notes?limit`) | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| JSON body parsing | `src/routes/api.routes.js`, `/echo/json` | `tests/integration/routing.test.js` (parse, malformed 400, 415, 413) | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| URL-encoded parsing | `src/routes/api.routes.js`, `/echo/form` | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| HTTP methods and status codes | `src/examples/http-examples.routes.js` (notes CRUD, 405, OPTIONS, HEAD) | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| `res.status` / `res.json` / `res.send` / `res.redirect` | `src/examples/http-examples.routes.js` (`/ping`, `/old-notes`, notes) | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Route ordering | `/notes/latest` before `/notes/:id`; mount order in `src/app.js` | `tests/integration/routing.test.js` (mutation-checked) | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Nested routers | `/notes/:noteId/comments` (`mergeParams`) | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Route-specific middleware | `src/http/route-guards.js` | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| Safe 404 response | `src/http/not-found.js` | `tests/integration/routing.test.js`, `tests/integration/static.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| `express.static` example | `src/app.js`, `public/example.txt` | `tests/integration/static.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |
| REST naming conventions | `docs/modules/routing-and-http.md`, notes example | `tests/integration/routing.test.js` | [routing-and-http.md](../modules/routing-and-http.md) | verified |

## 3. Middleware (Phase 3)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Documented middleware order | `src/app.js`, `docs/modules/middleware.md` | `tests/integration/middleware.test.js` (ID/logger/headers precede parsing; mutation-checked) | [middleware.md](../modules/middleware.md) | verified |
| Request ID / correlation ID | `src/middleware/request-id.js` | `tests/integration/middleware.test.js` (generate, reuse, reject unsafe, concurrent uniqueness) | [middleware.md](../modules/middleware.md) | verified |
| Structured request logging | `src/middleware/request-logger.js`, `src/logging/logger.js` | `tests/integration/middleware.test.js`, `tests/unit/middleware-units.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Security headers in pipeline | `src/middleware/security-headers.js` | `tests/integration/middleware.test.js` (200, 404, static, health, parse error) | [middleware.md](../modules/middleware.md) | verified |
| Application-level middleware | `src/app.js` (`app.use`) | `tests/integration/middleware.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Router-level middleware | `src/routes/api.routes.js`, `src/examples/middleware-examples.routes.js` (`router.use`) | `tests/integration/middleware.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Route-level middleware | `src/http/route-guards.js`, examples `/chain`, `/guarded` | `tests/integration/middleware.test.js`, `tests/integration/routing.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Middleware chaining and `next()` | `src/examples/middleware-examples.routes.js` `/chain` | `tests/integration/middleware.test.js` | [middleware.md](../modules/middleware.md) | verified |
| `next(err)` | `src/examples/middleware-examples.routes.js` `/fail` | `tests/integration/middleware.test.js` (later middleware/handler not run) | [middleware.md](../modules/middleware.md) | verified |
| Conditional middleware | `src/middleware/conditional.js`; logger skipped for `/health`; `/conditional` | `tests/integration/middleware.test.js`, `tests/unit/middleware-units.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Short-circuiting by sending a response | `/guarded` (`requireDemoRole`) | `tests/integration/middleware.test.js` (rejected request never reaches controller; mutation-checked) | [middleware.md](../modules/middleware.md) | verified |
| `res.locals` | `src/middleware/request-id.js`, `request-logger.js`, `/chain` | `tests/integration/middleware.test.js` (parallel isolation) | [middleware.md](../modules/middleware.md) | verified |
| `req.app` | `/app-config` | `tests/integration/middleware.test.js` | [middleware.md](../modules/middleware.md) | verified |
| Sensitive-data exclusion from logs | `src/middleware/request-logger.js`, `src/logging/logger.js` (`REDACT_PATHS`) | `tests/integration/middleware.test.js`, `tests/unit/middleware-units.test.js` | [middleware.md](../modules/middleware.md) | verified |

## 4. Error handling (Phase 4)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Application error hierarchy | `src/errors/app-errors.js`, `src/errors/to-app-error.js` | `tests/unit/errors.test.js` (classes, classification table) | [error-handling.md](../modules/error-handling.md) | verified |
| Consistent safe error response | `src/http/error-handler.js` | `tests/unit/errors.test.js`, `tests/integration/error-handling.test.js` (same shape for every error type) | [error-handling.md](../modules/error-handling.md) | verified |
| Final 404 handler | `src/http/not-found.js` | `tests/integration/error-handling.test.js`, `tests/integration/routing.test.js` | [error-handling.md](../modules/error-handling.md) | verified |
| Final error middleware | `src/http/error-handler.js`, mounted last in `src/app.js` | `tests/integration/error-handling.test.js` (mutation-checked: unmounted handler fails 50 tests) | [error-handling.md](../modules/error-handling.md) | verified |
| Express 5 async rejection handling (no redundant wrappers) | `src/examples/error-examples.routes.js` (`/async-reject`, `/service/*`: plain `async`, no wrapper) | `tests/integration/error-handling.test.js` | [error-handling.md](../modules/error-handling.md) | verified |
| Sync throw handling | `src/examples/error-examples.routes.js` (`/sync-throw`, `/throw-string`, `/next-err`) | `tests/integration/error-handling.test.js` | [error-handling.md](../modules/error-handling.md) | verified |
| `res.headersSent` delegation | `src/http/error-handler.js`; `/after-headers` | `tests/unit/errors.test.js` (fake res), `tests/integration/error-handling.test.js` (real server: truncated response; mutation-checked) | [error-handling.md](../modules/error-handling.md) | verified |
| Operational vs programmer error logging | `src/http/error-handler.js`, `src/middleware/request-logger.js` (`errorCode`) | `tests/unit/errors.test.js`, `tests/integration/error-handling.test.js` (error-level only for unexpected; mutation-checked) | [error-handling.md](../modules/error-handling.md) | verified |
| No stack/internal leakage in production | `src/http/error-handler.js` (no `NODE_ENV` branch) | `tests/integration/error-handling.test.js` (production and development bodies identical; mutation-checked) | [error-handling.md](../modules/error-handling.md) | verified |

## 5. Validation & API contracts (Phase 5)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Zod validation of params/query/body | `src/http/validate.js`, `src/modules/products/products.schemas.js` | `tests/unit/validate-middleware.test.js`, `tests/integration/validation.test.js` (params, query, body) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Validation before controllers | `src/http/validate.js` (route middleware before the handler), `src/examples/validation-examples.routes.js` | `tests/unit/validate-middleware.test.js`, `tests/integration/validation.test.js` (rejected requests never stored; mutation-checked: removing validate() broke ~100 tests) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Pagination (page/limit or cursor) | `src/http/query/pagination.js`, `src/http/query/list-query.js` (offset strategy; cursor trade-off documented) | `tests/unit/query-helpers.test.js`, `tests/integration/validation.test.js` (bounds, page past end, metadata) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Sorting allowlist | `src/http/query/sorting.js` (API name -> db column map) | `tests/unit/query-helpers.test.js`, `tests/integration/validation.test.js` (injection/`__proto__`/duplicates; mutation-checked: 27 fail without the regex) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Filtering allowlist | `src/http/query/list-query.js`, `src/http/query/fields.js`; product filters in `products.schemas.js` | `tests/unit/query-helpers.test.js`, `tests/integration/validation.test.js` (unknown filters rejected, min<=max) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Search query validation | `src/http/query/fields.js` (`searchTerm`) | `tests/unit/query-helpers.test.js`, `tests/integration/validation.test.js` (trim, empty, length, control characters) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| Success/error response convention | `src/http/schemas.js`, `src/http/query/pagination.js` (`buildPagination`) | `tests/integration/validation.test.js` (bare resource, `{items, pagination}`, `{error}` parsed with the response schemas) | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |
| OpenAPI spec | — (on branch `feature/openapi-swagger`, not merged) | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Swagger UI | — (on branch `feature/openapi-swagger`, not merged) | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Unexpected-field rejection / mass-assignment prevention | `z.strictObject` in `products.schemas.js` and `validate()` | `tests/integration/validation.test.js` (`id`, `role`, `createdAt` rejected and never stored), `tests/unit/validate-middleware.test.js`; mutation-checked | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | verified |

## 6. Persistence (Phase 6)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Mongoose schemas/models (validation, enums, timestamps) | `src/db/models/*.models.js`, `enums.js`, `shared.js` (15 models, strict, enums, timestamps) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): enum/required/min/max rejected, unknown field throws, values not echoed in errors | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Versioned migrations (collections + indexes) | `src/db/migrations.js`, `migrations/0001_collections_validators_and_indexes.js`, `scripts/db.js` | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): `db:migrate` applies once, second run no-op, `db:status` | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Seed data | `src/db/seed.js` (`npm run db:seed`) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): idempotent: identical counts after two runs | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Database connection module (pool, timeouts) | `src/db/database.js` (pool, timeouts, retry connect, no autoIndex) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): boot with MongoDB down serves 503 then recovers; SIGTERM exits; no URI in logs | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Readiness integration | `src/server.js` (`db` check), `src/db/database.js` (`checkReady`) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): up 200, stopped 503 (live stays 200), restart recovers without restart of app | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Repository pattern | `src/db/repositories/*.js` (users, categories, products, audit, outbox, sequences) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): normalized Phase 5 query -> Mongo (filters, sort, pagination, search), passwordHash hidden, regex-escaped search | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Transaction helpers (replica set) | `src/db/database.js` (`transaction`), `compose.yaml` (single-node replica set) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): commit writes 3 documents, rollback writes none, conflicting transactions retried, atomic stock reservation | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Uniqueness, partial/TTL indexes and status enums | `src/db/models/*.models.js` indexes, `src/db/models/validators.js` (server-side validators) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): 19 constraint checks (121 validator failures, 11000 duplicates, partial indexes allow/deny correctly) | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Test database isolation | strategy documented in [database-and-persistence.md](../modules/database-and-persistence.md) ("Test database strategy") | none: no tests are written (owner's decision) | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Idempotency records collection | `src/db/models/reliability.models.js` (unique (userId, scope, key), TTL) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): collection, unique and TTL indexes created by migration 0001 | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Audit events collection | `src/db/models/reliability.models.js`, `src/db/repositories/audit.repository.js` | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): commit writes an event; secret-like metadata keys (nested too) rejected | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Outbox collection | `src/db/models/reliability.models.js`, `src/db/repositories/outbox.repository.js` | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): enqueue joins the transaction (rolled back with it), findDue returns pending, partial index | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |
| Mongo error mapping (duplicate key, validation, cast, connectivity) | `src/db/map-database-error.js` (called by `src/errors/to-app-error.js`) | manual verification in [database-and-persistence.md](../modules/database-and-persistence.md) ("Manual verification"): 409 duplicate/validator/conflict, 404 orFail, 400 validation+cast, 500 strict mode, 503 down/timeout | [database-and-persistence.md](../modules/database-and-persistence.md) | verified |

## 7. Authentication (Phase 7)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Signup | `src/modules/auth/auth.service.js` (`signup`), `auth.routes.js`, `auth.schemas.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): 202 generic, duplicate identical, mass assignment and weak input rejected, nothing created | [authentication.md](../modules/authentication.md) | verified |
| Login | `src/modules/auth/auth.service.js` (`login`) | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): success, wrong password, unverified 403, disabled 403, unknown email same 401 | [authentication.md](../modules/authentication.md) | verified |
| Logout | `src/modules/auth/auth.service.js` (`logout`, `logoutAll`) | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): logout 204 revokes the session family, unknown token 204, logout-all revokes every session | [authentication.md](../modules/authentication.md) | verified |
| Password hashing | `src/modules/auth/password-hasher.js` (Argon2id, `argon2`) | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): stored `$argon2id$` hash, no password in DB/logs, dummy-hash timing equal (23.3 vs 22.2 ms) | [authentication.md](../modules/authentication.md) | verified |
| Access-token verification | `src/modules/auth/token-service.js`, `auth.middleware.js` (jsonwebtoken, HS256 pinned, exp/sub/role required) | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): garbage, expired, forged secret, wrong audience/issuer, alg=none, non-Bearer all 401 | [authentication.md](../modules/authentication.md) | verified |
| Refresh-token rotation | `src/modules/auth/auth.service.js` (`refresh`), `src/db/repositories/refresh-tokens.repository.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): new pair each time, hashed storage, parent link, parallel refresh: exactly one wins | [authentication.md](../modules/authentication.md) | verified |
| Refresh-token revocation / reuse detection | `auth.service.js` (`handleRefreshReuse`), refresh-tokens repository | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): old token replay revokes the family and writes an audit event; logout replay is not flagged; expired refresh 401 | [authentication.md](../modules/authentication.md) | verified |
| Email verification | `auth.service.js` (`verifyEmail`, `resendVerification`), `one-time-tokens.repository.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): single use, expired/bogus generic 400, resend invalidates the older link | [authentication.md](../modules/authentication.md) | verified |
| Password reset (expiring, single-use) | `auth.service.js` (`forgotPassword`, `resetPassword`) | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): 1 h token, single use, expired 400, weak password does not burn the token, all sessions revoked, notification email | [authentication.md](../modules/authentication.md) | verified |
| Anti-enumeration responses | `auth.service.js` (generic messages, dummy hash), `auth.controller.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): identical bodies for existing/unknown email on signup, forgot-password, login; status shown only after correct password | [authentication.md](../modules/authentication.md) | verified |
| Login brute-force rate limiting | `src/modules/auth/attempt-limiter.js` (hook), limits in `src/modules/auth/index.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): 429 + Retry-After after 5 failures (per email+ip), other email unaffected, success resets, mail endpoints throttled | [authentication.md](../modules/authentication.md) | verified |
| Test-only email delivery | `src/email/test-mailer.js`, `src/email/templates.js`, `src/examples/mailbox-examples.routes.js` | manual verification in [authentication.md](../modules/authentication.md) ("Manual verification"): emails captured in memory, mailbox route 404 in production, only template name logged | [authentication.md](../modules/authentication.md) | verified |

## 8. Authorization & sessions (Phase 8)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Roles (customer/seller/admin) | `src/modules/authz/permissions.js`, `src/db/models/enums.js` (ROLES) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): customer/seller/admin each get exactly their permissions; approval promotes a customer to SELLER; role read from the database | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Permission checks | `src/modules/authz/authorize.js` (`requirePermission`), `permissions.js` (default deny) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): 7 endpoints 401 without a token, wrong role 403 on 10 routes, demoted/disabled user refused at once with the same token; `can()` mutation -> escalation detected | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Seller ownership enforcement | `src/modules/authz/ownership.js`, `products.repository.js` (`updateByOwner`, `setStockByOwner`) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): wrong owner 403 and document unchanged (patch, stock, submit, ACTIVE seed product); two layers proven by mutation (one removed: 409 safe, both removed: hijack) | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Admin seller approval | `src/modules/admin/admin.service.js` (`transitionSeller`), `admin.routes.js` | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): approve/reject/suspend/reinstate, invalid transitions 409, role promoted in the same transaction, only admin permission | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Admin product moderation | `src/modules/admin/admin.service.js` (`moderateProduct`), `products.service.js` (`submit`) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): queue, approve, reject with reason, re-edit after reject, approved product not editable, seller cannot self-approve | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Audit logging of admin actions | `src/modules/admin/admin.service.js`, `src/db/repositories/audit.repository.js` (`record`, `list`) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): 12 action types audited with actor/entity/from/to/reason; no passwords, tokens or secrets in the collection | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Cookie sessions (HttpOnly/Secure/SameSite/expiry) | `src/modules/session/session.middleware.js` (`cookieSettings`), `session.controller.js` | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): HttpOnly, SameSite=Lax, Path=/, expiry; production `__Host-sid; Secure` behind a trusted proxy; fixation defense; idle and absolute timeouts | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Redis session store | `src/redis/redis.js`, `src/modules/session/session-registry.js`, connect-redis store, `compose.yaml` | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): sessions in `sess:<id>` with TTL, per-user index, logout/logout-all/password reset revoke; Redis down -> 503 for cookie requests only, recovery | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| CSRF protection | `src/modules/session/csrf.js` (token + Origin + Sec-Fetch-Site, SameSite=Lax) | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): missing/wrong/prefix/other-session token and foreign Origin all 403 and nothing created; right token works; mutation (check removed) -> attack succeeds | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |
| Session vs bearer-token separation | `src/modules/authz/authenticate-either.js`, separate `/auth` and `/session` routers | manual verification in [authorization-and-sessions.md](../modules/authorization-and-sessions.md) ("Manual verification"): invalid bearer + valid cookie 401, bearer needs no CSRF, /auth rejects cookies, /session rejects bearers | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | verified |

## 9. Catalog & inventory (Phase 9)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Seller profile and approval | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Product CRUD | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Inventory updates | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Category/search/filter/sort/pagination | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| SKU uniqueness | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Wishlist | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Reviews and ratings | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Mass-assignment prevention | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Public vs approved product visibility | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Concurrency-safe inventory | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |
| Query-driven indexes | — | — | [catalog-and-inventory.md](../modules/catalog-and-inventory.md) | planned |

## 10. Cart, checkout & orders (Phase 10)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Cart add/update/remove | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Server-side price recalculation | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Checkout validation | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Order history/detail | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Seller order views | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Order-state transition rules | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Transaction rollback | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Last-item race handling | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Idempotency keys for order creation | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Mock payment provider | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Payment pending/failed/paid states | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |
| Audit events for transitions | — | — | [checkout-and-orders.md](../modules/checkout-and-orders.md) | planned |

## 11. Security hardening (Phase 11)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Helmet | — | — | [security.md](../modules/security.md) | planned |
| Explicit CORS allowlist | — | — | [security.md](../modules/security.md) | planned |
| General rate limiting | — | — | [security.md](../modules/security.md) | planned |
| Auth-endpoint rate limiting | — | — | [security.md](../modules/security.md) | planned |
| Body-size limits | — | — | [security.md](../modules/security.md) | planned |
| Secure cookies | — | — | [security.md](../modules/security.md) | planned |
| `trust proxy` configuration | — | — | [security.md](../modules/security.md) | planned |
| NoSQL operator injection and regex/ReDoS review | — | — | [security.md](../modules/security.md) | planned |
| XSS (output escaping) | — | — | [security.md](../modules/security.md) | planned |
| Open redirect prevention | — | — | [security.md](../modules/security.md) | planned |
| Path traversal prevention | — | — | [security.md](../modules/security.md) | planned |
| Secrets handling | — | — | [security.md](../modules/security.md) | planned |
| Dependency audit | — | — | [security.md](../modules/security.md) | planned |
| Public vs private cache separation | — | — | [security.md](../modules/security.md) | planned |
| Threat model (`docs/security/threat-model.md`) | — | — | [security.md](../modules/security.md) | planned |

## 12. Files & streaming (Phase 12)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Multer upload limits | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| MIME/signature checks | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Random storage keys | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Storage adapter interface | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Local storage adapter | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| S3-compatible adapter | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Image deletion/replacement | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| CSV export via streams | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Stream error handling | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |
| Client disconnect (aborted stream) handling | — | — | [files-and-streaming.md](../modules/files-and-streaming.md) | planned |

## 13. Caching & performance (Phase 13)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Redis cache-aside | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| TTL and key design | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| Cache invalidation | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| Redis outage fallback | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| No caching of personalized data | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| Benchmark script (measured) | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |
| N+1 / query-plan review | — | — | [caching-and-performance.md](../modules/caching-and-performance.md) | planned |

## 14. Background jobs (Phase 14)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Separate worker process | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| BullMQ queues | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Bounded retries with backoff | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Job IDs / deduplication | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Job timeouts | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Failed-job handling and replay | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Job status visibility | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Scheduled cleanup jobs | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Transactional outbox dispatch | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Email job | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Invoice/report job | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |
| Low-stock alert job | — | — | [background-jobs.md](../modules/background-jobs.md) | planned |

## 15. Webhooks & integrations (Phase 15)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Webhook signature verification (raw body) | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Processed-event persistence | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Idempotent webhook handling | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Out-of-order event handling | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| External-service adapter pattern | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Timeout and bounded retry | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Error mapping and correlation IDs | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |
| Local webhook simulator | — | — | [webhooks-and-integrations.md](../modules/webhooks-and-integrations.md) | planned |

## 16. OAuth 2.0 / OIDC (Phase 16)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Authorization Code flow with PKCE | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| State validation | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Nonce validation | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Issuer/audience validation | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Redirect URI validation | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Environment-driven provider config | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Test provider adapter | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| Safe external-identity linking | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |
| OAuth vs OIDC explained | — | — | [oauth-oidc.md](../modules/oauth-oidc.md) | planned |

## 17. Realtime & notifications (Phase 17)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Socket.IO server | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Socket authentication | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Per-user/per-order room authorization | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Seller-scoped events | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Post-commit event publication | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Notification service abstraction | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Notification failure isolation | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |
| Redis adapter / scaling limit documented | — | — | [realtime-and-notifications.md](../modules/realtime-and-notifications.md) | planned |

## 18. Test strategy (Phase 18)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Jest unit tests | — | — | [strategy.md](../testing/strategy.md) | planned |
| Supertest API tests | — | — | [strategy.md](../testing/strategy.md) | planned |
| Integration tests | — | — | [strategy.md](../testing/strategy.md) | planned |
| Security tests | — | — | [strategy.md](../testing/strategy.md) | planned |
| End-to-end suite | — | — | [strategy.md](../testing/strategy.md) | planned |
| Deterministic test database | — | — | [strategy.md](../testing/strategy.md) | planned |
| Test doubles for external services | — | — | [strategy.md](../testing/strategy.md) | planned |
| Coverage threshold | — | — | [strategy.md](../testing/strategy.md) | planned |
| Single full-suite command | — | — | [strategy.md](../testing/strategy.md) | planned |
| CI pipeline | — | — | [strategy.md](../testing/strategy.md) | planned |
| No open handles | — | — | [strategy.md](../testing/strategy.md) | planned |

## 19. Observability & reliability (Phase 19)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Pino structured logs | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Log redaction | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Request duration/status metrics | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Sentry adapter | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Trace/correlation propagation to jobs | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Graceful SIGTERM/SIGINT shutdown | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Shutdown ordering | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Dependency outage handling | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |
| Uncaught exception / unhandled rejection policy | — | — | [observability-and-reliability.md](../modules/observability-and-reliability.md) | planned |

## 20. Deployment & scaling (Phase 20)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Multi-stage Dockerfile | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Docker Compose (app, MongoDB replica set, Redis, worker) | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Nginx reverse proxy | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Production config checklist | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| `worker_threads` CPU lab | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Horizontal scaling exercise | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Graceful shutdown under restart | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Node cluster (optional measured lab) | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Local development runbook | — | — | [deployment.md](../runbooks/deployment.md) | planned |
| Deployment smoke tests | — | — | [deployment.md](../runbooks/deployment.md) | planned |

## 21. Express concept lab (Phase 21)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| `app.use()` vs `app.all()` | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `app.param()` | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `next('route')` | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Route ordering (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `req.app` (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `res.locals` (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Middleware short-circuiting (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `trust proxy` (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| URL-encoded parsing (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Static serving (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Stream failures | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Aborted client connections | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Request timeout behaviour | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| `res.headersSent` (lab) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Default error handler delegation | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Express 4 vs 5 async rejection (`labs/express-v4-compat`) | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |
| Debug routes disabled in production | — | — | [express-concept-lab.md](../modules/express-concept-lab.md) | planned |

## 22. MongoDB features lab (Phase 22)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Aggregation pipelines (reports) | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
| TTL indexes | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
| Text and partial indexes with `explain()` | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
| Change streams | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
| `$jsonSchema` collection validators | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
| Isolation from the core app | — | — | [mongodb-lab.md](../modules/mongodb-lab.md) | planned |
