# Express Concept Matrix

Single source of truth for what is actually done. Every concept named in the [playbook](../architecture/phases.md) is listed once, under the phase that owns it.

## Rules

1. **No concept is complete until all evidence exists:** implementation/demo, automated test or repeatable verification, focused documentation, and exact paths/commands for each.
2. Statuses advance one step at a time, only on evidence: `planned → in progress → implemented → tested → documented → verified`.
3. `verified` means the checks were actually run and passed. Environment-dependent checks (Postgres, Redis, Docker, MongoDB) are noted in the test column and not marked verified when unrun.
4. Use exact repo-relative paths (and the command, if not a plain test file) in the location columns. `—` means no evidence yet.
5. Documentation links point to the page the owning phase will create; a link is valid only after that phase lands.
6. Phase 24 audits every row. Phase 25 must not report "all concepts complete" unless every row is `verified`.

**Current state: Phase 3 complete. Sections 1–3 are `verified`; every other concept is `planned`.**

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
| Application error hierarchy | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Consistent safe error response | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Final 404 handler | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Final error middleware | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Express 5 async rejection handling (no redundant wrappers) | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Sync throw handling | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| `res.headersSent` delegation | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| Operational vs programmer error logging | — | — | [error-handling.md](../modules/error-handling.md) | planned |
| No stack/internal leakage in production | — | — | [error-handling.md](../modules/error-handling.md) | planned |

## 5. Validation & API contracts (Phase 5)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Zod validation of params/query/body | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Validation before controllers | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Pagination (page/limit or cursor) | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Sorting allowlist | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Filtering allowlist | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Search query validation | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Success/error response convention | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| OpenAPI spec | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Swagger UI | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |
| Unexpected-field rejection / mass-assignment prevention | — | — | [validation-and-api-contracts.md](../modules/validation-and-api-contracts.md) | planned |

## 6. Persistence (Phase 6)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| PostgreSQL + Prisma schema | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Migrations | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Seed data | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Database connection module | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Readiness integration | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Repository pattern | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Transaction helpers | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Foreign keys, uniqueness, indexes, status enums | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Test database isolation | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Idempotency records table | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Audit events table | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |
| Outbox table | — | — | [database-and-persistence.md](../modules/database-and-persistence.md) | planned |

## 7. Authentication (Phase 7)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Signup | — | — | [authentication.md](../modules/authentication.md) | planned |
| Login | — | — | [authentication.md](../modules/authentication.md) | planned |
| Logout | — | — | [authentication.md](../modules/authentication.md) | planned |
| Password hashing | — | — | [authentication.md](../modules/authentication.md) | planned |
| Access-token verification | — | — | [authentication.md](../modules/authentication.md) | planned |
| Refresh-token rotation | — | — | [authentication.md](../modules/authentication.md) | planned |
| Refresh-token revocation / reuse detection | — | — | [authentication.md](../modules/authentication.md) | planned |
| Email verification | — | — | [authentication.md](../modules/authentication.md) | planned |
| Password reset (expiring, single-use) | — | — | [authentication.md](../modules/authentication.md) | planned |
| Anti-enumeration responses | — | — | [authentication.md](../modules/authentication.md) | planned |
| Login brute-force rate limiting | — | — | [authentication.md](../modules/authentication.md) | planned |
| Test-only email delivery | — | — | [authentication.md](../modules/authentication.md) | planned |

## 8. Authorization & sessions (Phase 8)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Roles (customer/seller/admin) | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Permission checks | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Seller ownership enforcement | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Admin seller approval | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Admin product moderation | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Audit logging of admin actions | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Cookie sessions (HttpOnly/Secure/SameSite/expiry) | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Redis session store | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| CSRF protection | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |
| Session vs bearer-token separation | — | — | [authorization-and-sessions.md](../modules/authorization-and-sessions.md) | planned |

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
| SQL/NoSQL injection review | — | — | [security.md](../modules/security.md) | planned |
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
| Docker Compose (app, Postgres, Redis, worker) | — | — | [deployment.md](../runbooks/deployment.md) | planned |
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

## 22. Mongoose lab (Phase 22)

| Concept | Implementation / demo | Test / verification | Documentation | Status |
| --- | --- | --- | --- | --- |
| Mongoose schemas/models | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Mongoose validation | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| CRUD | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Indexes | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Query filtering/pagination | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Duplicate-key errors | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Connection failure handling | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
| Isolation from core app and core tests | — | — | [mongoose-lab.md](../modules/mongoose-lab.md) | planned |
