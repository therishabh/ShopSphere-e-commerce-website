# ShopSphere — Claude Code Prompt Playbook

**Goal:** Build a production-style Express.js 5 e-commerce backend in small, reviewable steps. Each prompt below is designed to be pasted into Claude Code **one at a time, in order**. Do not paste the whole file as one prompt.

## How to use this playbook

1. Open the project folder in Claude Code. Start with **Prompt 00**.
2. Paste one prompt, let Claude implement it, inspect its summary and Git diff, and run the listed checks.
3. Fix any failing checks before moving to the next prompt. Keep commits small (one phase per commit is ideal).
4. Keep using the same repository. The `CLAUDE.md`, concept matrix, tests and docs created in early phases are the project's persistent source of truth.
5. If Claude says a feature is complete, verify that real code, tests and documentation exist. A TODO, placeholder, commented-out implementation, or plan alone does **not** count as completed.
6. `CLAUDE.md` in the repository overrides this playbook where they differ (for example, the owner's current decision to not write new tests: use repeatable manual verification instead).

## Project decisions

- **Product:** ShopSphere, a multi-vendor e-commerce backend for customers, sellers and admins.
- **Architecture:** Modular monolith first; separate worker process in the same repo. Do not introduce microservices without a demonstrated reason.
- **Runtime/framework:** Node.js current LTS, Express 5, JavaScript ES modules (modern JavaScript, not TypeScript for this project).
- **Primary persistence:** MongoDB + Mongoose (ODM). Multi-document transactions need a replica set, so local development runs a single-node replica set. **No PostgreSQL, Prisma or SQL anywhere in this project.**
- **MongoDB features lab:** aggregation pipelines, TTL/text indexes, `explain()` plans and change streams are demonstrated in an isolated lab, not mixed into core request paths.
- **Supporting systems:** Redis for cache/queues/session storage; BullMQ for jobs; Socket.IO for realtime updates; S3-compatible object storage through an adapter.
- **Quality:** Jest + Supertest, Zod validation, Pino logging, Helmet, explicit CORS, rate limiting, OpenAPI documentation, Docker, and Nginx deployment example.
- **Payment safety:** Use a **mock payment provider**. Do not collect real card data, use live payment credentials, or initiate real transactions.
- **Documentation rule:** `README.md` stays concise and acts as an index. Detailed but focused module docs live in `docs/modules/`; architecture decisions live in `docs/architecture/`; operational instructions live in `docs/runbooks/`; exhaustive coverage lives in `docs/coverage/EXPRESS_CONCEPT_MATRIX.md`. Link these from README instead of turning README into a book.

---

# The prompts

## Prompt 00 — Establish project guardrails and completeness tracking

```text
We are building ShopSphere, a production-style multi-vendor e-commerce backend. First inspect the current repository and its existing files. Do not implement application features yet.

Create a root CLAUDE.md containing persistent instructions for all future work:
- Work in small phases; implement only the phase requested. Never skip ahead or replace implementation with a plan.
- Before editing, inspect relevant files and preserve working code. Use Node.js current LTS, Express 5, modern JavaScript ESM, MongoDB/Mongoose for the core (no relational database), and the decisions in this playbook.
- Write senior-quality code: clear boundaries, small cohesive modules, explicit validation, secure defaults, useful errors, no business logic in controllers, no secrets in source, and no unnecessary abstractions.
- Do not leave feature TODOs, stubs, fake success responses, empty handlers, or untested “placeholder” implementations. If blocked, state the exact blocker instead of silently skipping it.
- Add or update automated tests for every meaningful behaviour and error path. Run relevant tests, lint, formatting and build/check scripts that exist. Report actual results; never claim a command passed unless it ran successfully.
- Update README.md, focused docs under docs/, and docs/coverage/EXPRESS_CONCEPT_MATRIX.md as each phase changes the project. A concept is complete only when implemented, tested, documented, and verified.
- Keep README short and navigable; put module detail in docs/modules/, architecture rationale in docs/architecture/, and operating instructions in docs/runbooks/.
- Use safe mock providers for payment/email/external services in development and tests. Never use real payment credentials.
- Check official documentation for version-sensitive APIs when needed; pin dependencies through the lockfile and explain important choices.

Create the initial README.md, docs directory skeleton, a concise architecture overview, and docs/coverage/EXPRESS_CONCEPT_MATRIX.md. The matrix must enumerate every concept named in this playbook, with columns: concept, implementation/demo location, test location, documentation link, status (planned/in progress/implemented/tested/documented/verified). Do not mark anything completed yet. Include a “no concept is complete until all evidence exists” rule.

Do not scaffold the application yet. Show the files created, the proposed phases, and any assumptions. Keep docs concise, useful to an experienced developer, and not textbook-like.
```

## Prompt 01 — Scaffold Express 5 and application lifecycle

```text
Implement Phase 1: the application/server foundation for ShopSphere. Read CLAUDE.md, README.md, the architecture overview, and the concept matrix first.

Create a clean Express 5 + modern JavaScript ESM scaffold with separate app.js and server.js, validated environment configuration, predictable startup, and scripts for dev/start/test/lint/format. Pin compatible dependencies and commit a lockfile. Add /health/live and /health/ready endpoints; readiness must represent actual required dependency readiness as the database is introduced, not always return healthy by default. Keep app construction testable without opening a port.

Add basic tests for app creation, health endpoints and startup/config validation. Configure formatting/linting with sensible rules. Add a concise docs/modules/application-foundation.md explaining app.js vs server.js, startup flow, environment strategy, and why this structure was chosen. Update README setup instructions and the concept matrix only for implemented and tested items.

Implement the code now, not just a plan. Run available checks and report exact commands/results. Do not begin the next phase.
```

## Prompt 02 — HTTP fundamentals, routing and REST conventions

```text
Implement the HTTP fundamentals and routing phase. Use modular Express routers under /api/v1, with separate route modules for auth, users, sellers, products, cart, orders and admin (empty route modules may be added only if they are valid, wired modules—not fake endpoints). Demonstrate route params, query params, JSON body parsing, URL-encoded parsing, correct HTTP methods/status codes, res.status/json/send/redirect, route ordering, nested routers, route-specific middleware, and a safe 404 response.

Add a small, explicitly documented static-asset example using express.static. Ensure request parsing and route mounts have deliberate order. Add Supertest tests for representative success paths, malformed/unknown routes, route matching and status codes. Do not create business endpoints that pretend to work before their module is implemented.

Document endpoint naming, route organization, params/query/body, status-code choices, and how to add a new route in docs/modules/routing-and-http.md. Update the concept matrix with evidence. Run the relevant checks; do not continue to another phase.
```

## Prompt 03 — Middleware pipeline and request context

```text
Implement the middleware phase. Add a documented, intentional middleware order for request ID/correlation ID, structured request logging, security headers, request parsing, route handling and error handling. Implement custom application-level, router-level and route-level middleware; demonstrate middleware chaining, next(), next(err), conditional middleware, and stopping the pipeline by sending a response.

Use res.locals only for request-scoped values needed downstream. Add a small, tested demonstration of req.app for accessing app-level configuration. Add tests that prove middleware order and prove that a rejected request never reaches the controller. Avoid logging passwords, tokens, cookies or sensitive request bodies. Keep production middleware separate from special teaching examples.

Document middleware categories, order, next() semantics, request IDs and sensitive-data rules in docs/modules/middleware.md. Update the matrix only with tested evidence. Run checks and stop after this phase.
```

## Prompt 04 — Centralized errors and async error semantics

```text
Implement robust centralized error handling for Express 5. Add a small application error hierarchy (validation, authentication, authorization, not found, conflict, rate limit and unexpected errors), a consistent safe error response, a final 404 handler, and a final error middleware. Preserve useful server-side diagnostics without leaking stack traces or internal details to production clients. Handle errors from async services and database adapters consistently; do not add redundant async wrappers without a reason under Express 5.

Handle the res.headersSent case correctly by delegating to Express's default handler when appropriate. Distinguish expected operational failures from unexpected programming errors in logging. Add tests for sync throws, rejected Promises, next(err), unknown routes, safe production responses and already-sent response behavior where feasible.

Document error propagation, error classification and how to add an error type in docs/modules/error-handling.md. Update the matrix with actual test paths. Run tests and stop here.
```

## Prompt 05 — Validation, API contracts and pagination

```text
Implement API input validation and reusable API conventions. Use Zod schemas for params, query strings and request bodies; validate before controllers execute. Add shared pagination, sorting and filtering helpers with strict allowlists so user input cannot select arbitrary database fields. Define a consistent success/error response convention without wrapping every response unnecessarily. Add representative product-list schema and a tested example of page/limit, cursor-or-offset strategy, filters, sorting and search query validation.

Add OpenAPI documentation generation or a maintained OpenAPI spec plus Swagger UI; the documented contract must match real routes and validation. Test invalid body, invalid IDs, unexpected fields, query bounds and response contract. Document the DTO/schema strategy and API compatibility rules in docs/modules/validation-and-api-contracts.md. Update README links and the matrix. Do not build product business logic yet; stop after tests pass.
```

## Prompt 06 — MongoDB, Mongoose and persistence boundaries

```text
Implement the core MongoDB + Mongoose persistence foundation. Define practical collections/schemas for users, seller profiles, categories, products (with inventory), carts and cart items, orders and order items, payment attempts, reviews, wishlists, refresh-token/session records as appropriate, audit events, idempotency records and an outbox if needed. Decide deliberately between embedding and referencing for each relationship (for example order-item snapshots and cart items embedded; users, products and sellers referenced) and document why. Use schema validation (required/enum/min/max), explicit status enums, timestamps, unique and compound indexes (including partial and TTL indexes where they fit). MongoDB has no foreign keys or CHECK constraints, so enforce integrity with validators, unique indexes, atomic conditional updates and transactions, and document which rules are database-enforced and which are application-enforced. Avoid storing secrets or raw payment-card information.

Add versioned migrations (collection/index creation and data changes) and seed data for local development, a connection module (pool size, timeouts, no auto index building in production), readiness integration, repository/data-access patterns and transaction helpers. Multi-document transactions require a replica set: provide a local single-node replica set (Docker) and document the requirement. Keep Mongoose/driver details out of controllers and map driver errors (duplicate key, validation, cast, connectivity, transient transaction errors) to application errors. Add tests for repository behaviour and schema/index constraints using a reliable test database strategy (for example a separate database on the same server cleaned between tests); document setup/teardown and test isolation. Do not use PostgreSQL, Prisma or SQL anywhere.

Write docs/modules/database-and-persistence.md with the data model rationale (embedding vs referencing), transaction boundaries and the replica-set requirement, indexing choices, migration/seed commands and failure handling. Update the concept matrix with concrete files and tests. Run migrations/tests where the environment supports them; accurately report any external service requirement instead of claiming success.
```

## Prompt 07 — Identity, passwords, tokens and account recovery

```text
Implement the main account authentication module: signup, login, logout, password hashing with a maintained password-hashing library, access-token verification, refresh-token rotation/revocation, expiry handling, email-verification flow and password-reset flow. Store only safe token hashes/references where appropriate; make reset/verification tokens expiring and single-use. Never return password hashes or tokens in logs. Use safe generic responses where needed to reduce account enumeration.

Define auth services, repositories, routes, validation schemas and middleware boundaries. Add brute-force/login rate limiting hooks. Use test-only email delivery; real email sending will be integrated through a provider adapter later. Add unit/integration tests for success, wrong password, duplicate account, expired/reused refresh token, logout/revocation, expired reset token and disabled/unverified account policy.

Document the auth flow, token lifecycle, cookie/header choices and threat tradeoffs in docs/modules/authentication.md. Update the concept matrix. Implement and test this phase only.
```

## Prompt 08 — Roles, permissions, seller ownership and sessions

```text
Implement authorization separately from authentication. Add roles customer/seller/admin and explicit permission/ownership checks. A seller must never modify another seller's product or inventory just by changing an ID. Add admin-only seller approval and product moderation. Log sensitive administrative actions to audit events without storing secrets.

Also add a documented browser-session path using secure cookies and a Redis-backed session store if the selected design needs it; keep session auth clearly separated from bearer-token auth. Configure HttpOnly, Secure, SameSite and expiry appropriately. Add tests for unauthenticated, authenticated-but-forbidden, correct-owner, wrong-owner and admin-authorized requests; include CSRF protection for state-changing cookie-authenticated endpoints.

Document authentication vs authorization, RBAC vs permission checks, ownership enforcement and session/CSRF tradeoffs in docs/modules/authorization-and-sessions.md. Update the matrix only with tested evidence, then stop.
```

## Prompt 09 — Sellers, products, inventory, reviews and wishlists

```text
Implement the product domain end-to-end: seller profile/approval, product CRUD, inventory updates, category/search/filter/sort/pagination, SKU uniqueness, wishlist and product reviews/ratings. Add authorization and ownership checks on every mutation. Validate inputs, prevent mass assignment, expose only approved/public products to customers, and use explicit allowlists for sortable fields.

Make inventory updates concurrency-safe using atomic single-document conditional updates (for example `$inc` with a filter that guards the available quantity), unique indexes and, where several documents must change together, transactions. Add indexes based on actual query patterns and explain their use. Implement consistent not-found/conflict responses and prevent duplicate review/wishlist entries as appropriate. Add controller/service/repository tests plus integration tests for filtering, pagination, ownership, approval status, race-sensitive inventory changes and constraints.

Document product lifecycle, inventory consistency, query design and API examples in docs/modules/catalog-and-inventory.md. Update OpenAPI and the concept matrix. Do not move to checkout until tests pass.
```

## Prompt 10 — Cart, checkout, orders and transaction safety

```text
Implement the cart and order lifecycle. Add cart add/update/remove, price recalculation on the server, checkout validation, order history/detail, seller order views and status transitions. Never trust client-submitted prices or totals. Use database transactions and safe inventory reservation/decrement logic; cover the race where two checkouts attempt to buy the last item. Add idempotency keys for order creation so a client retry cannot create duplicate orders.

Use a mock payment provider only. Keep external provider calls outside long-running database transactions and model pending/failed/paid states explicitly. Define order-state transition rules so invalid transitions are rejected. Add audit events for important transitions. Test rollback, insufficient stock, duplicate idempotency key, altered client prices, repeated requests and invalid transitions.

Document the checkout sequence, transaction boundary, idempotency semantics and why payment is mocked in docs/modules/checkout-and-orders.md. Update OpenAPI and the matrix. Run the relevant tests and stop.
```

## Prompt 11 — Security hardening and threat model

```text
Perform and implement the planned application security phase. Configure Helmet, explicit CORS allowlists, rate limits for general/auth-sensitive endpoints, body-size limits, secure cookies, trust proxy only for the documented proxy topology, and safe request/file validation. Review NoSQL operator injection (for example `$ne`/`$gt` smuggled through JSON bodies or query objects) and regex/ReDoS in search, mass assignment, XSS, CSRF, open redirects, path traversal, secrets handling, dependency vulnerabilities and information leakage. Keep public and private cache behaviour separate.

Add a concise threat model listing assets, trust boundaries, main threats, mitigations and known residual risks. Add automated security-focused tests for CORS, body-size rejection, login throttling, authorization bypass attempts and error-response leakage. Do not add a sanitizer that corrupts legitimate data; validate by schema and escape output at the right boundary. Run dependency audit tools that are available and report warnings accurately.

Write docs/security/threat-model.md and docs/modules/security.md; update the concept matrix. Fix real issues found before finishing this phase.
```

## Prompt 12 — File uploads, storage adapters and streaming downloads

```text
Implement secure product-image upload through Multer with file-size/count limits, MIME/signature checks where feasible, random storage keys, and a storage adapter interface. Add a local development adapter and an S3-compatible adapter configured only through environment variables. Do not trust the original filename or publicise private file paths. Add safe product-image deletion/replacement behaviour.

Add a CSV export endpoint for order/sales reports using streams so large exports do not have to be fully buffered in memory. Handle stream errors, client disconnects and the res.headersSent case safely. Add tests for oversized/invalid uploads, duplicate filenames, storage failure and streaming headers/error behaviour.

Document upload threat controls, storage adapter choice, streaming behaviour and local configuration in docs/modules/files-and-streaming.md. Update the concept matrix with file/test evidence. Do not use real cloud credentials; stop after tests.
```

## Prompt 13 — Redis caching and measurable performance

```text
Implement Redis caching for suitable public product/category reads, with explicit TTL, cache-key design and invalidation on product/category/inventory changes. Do not cache personalized responses or authorization-sensitive data in a shared public cache. Add graceful cache-unavailable behaviour so a Redis outage does not silently corrupt core commerce state. Use cache-aside unless the codebase has a clear reason to choose differently.

Add a repeatable load/performance script or documented benchmark for a representative endpoint. Measure baseline and cached performance with the same dataset and describe limitations; never invent numbers. Review database indexes/query plans and avoid N+1 queries. Add tests for hit/miss, invalidation, TTL/expiry assumptions and Redis failure fallback.

Document cache consistency, invalidation strategy, key naming and benchmark commands in docs/modules/caching-and-performance.md. Update the matrix and stop after checks.
```

## Prompt 14 — Background jobs, scheduled tasks and reliable delivery

```text
Implement a worker process using BullMQ + Redis for email, invoice/report generation, low-stock alerts and other work that should not block HTTP requests. Add queue configuration, bounded retries with backoff, job IDs/idempotency, timeouts, job status visibility, failed-job handling and scheduled cleanup jobs. Keep workers bootstrapped separately from the HTTP app and ensure tests do not depend on a live external email provider.

Use a transactional outbox or another explicitly justified reliability design for important database changes that must trigger an asynchronous side effect. Do not call external services inside a database transaction. Define how jobs are deduplicated and how permanent failures are investigated/replayed. Add tests for retry, duplicate delivery, failure and outbox dispatch.

Document API-vs-worker responsibilities, job lifecycle, retry/backoff choices, outbox rationale and local worker commands in docs/modules/background-jobs.md. Update the matrix. Implement the code and run checks; do not continue.
```

## Prompt 15 — Payment webhook verification and external integrations

```text
Harden the mock payment integration and webhook lifecycle. Verify webhook signatures using the provider adapter's documented algorithm and raw request bytes where required; reject invalid signatures. Persist processed event IDs and make webhook handling idempotent, so repeated or out-of-order events cannot double-mark an order paid, double-release inventory or duplicate side effects. Apply valid state transitions transactionally and publish downstream work through the outbox/queue.

Add an external-service adapter pattern with explicit timeout, bounded retry/backoff where safe, error mapping and correlation IDs. Include a local webhook simulator/test fixture and tests for bad signatures, replayed event, out-of-order event, provider timeout and duplicate delivery. Do not use live provider keys, real cards or actual payment processing.

Document webhook trust assumptions, raw-body handling, idempotency, event ordering and retry policy in docs/modules/webhooks-and-integrations.md. Update the matrix and tests; stop here.
```

## Prompt 16 — OAuth 2.0 / OIDC and external identity

```text
Implement a separate OAuth 2.0 / OpenID Connect login path using a maintained library and its current official documentation. Use Authorization Code flow with PKCE where applicable, and validate state, nonce, issuer, audience and redirect URI according to the selected provider/library. No hand-written cryptography and no hard-coded credentials. Make provider configuration environment-driven and keep local tests independent of a real identity provider through an explicit test adapter.

Link external identities to local users safely; prevent account takeover from unverified email assumptions. Test state/nonce mismatch, callback errors, expired state, invalid issuer/audience and successful test-provider login. Clearly distinguish OAuth authorization from OIDC authentication in the docs.

Document flow diagrams or concise sequence steps, configuration, security checks and local testing in docs/modules/oauth-oidc.md. Update the concept matrix. Implement and test only this phase.
```

## Prompt 17 — Realtime order updates and notifications

```text
Implement Socket.IO realtime order-status updates with server-side authentication and per-user/per-order authorization. A customer must not subscribe to another customer's order room; a seller may only receive events for orders belonging to that seller. Publish updates after the database transaction commits, preferably through the existing outbox/worker flow so clients never see rolled-back state.

Use a notification service abstraction for email/in-app notifications. Ensure socket connections and external notification failures are observable and do not break the core order transaction. If multiple app instances are supported, configure and document an appropriate Redis adapter or explicitly document the supported deployment limit. Add tests for valid subscriptions, forbidden subscriptions, disconnects and event publication after commit.

Document realtime event names/payloads, authorization and horizontal-scaling assumptions in docs/modules/realtime-and-notifications.md. Update the matrix and API/event documentation. Run checks and stop.
```

## Prompt 18 — Complete automated test strategy

```text
Audit and complete automated testing across all implemented modules. Use Jest and Supertest for unit/integration/API tests, with a deterministic test database and controlled test doubles for payments, email, object storage, OAuth and other external services. Tests must cover success cases, validation failures, authorization failures, database constraints, rollback, retries, idempotency, security controls and critical concurrency cases.

Separate unit, integration, security and any end-to-end suites. Ensure setup/teardown leaves no open handles or leaked jobs/connections. Add a sensible coverage threshold for important business logic and explain any exclusions; do not game coverage with meaningless tests. Add a single documented command for the full test suite and make CI run it.

Write docs/testing/strategy.md describing layers, fixtures, isolation and how to add tests. Update the matrix with exact test paths. Fix flaky/failing tests rather than skipping them without an explicit reason. Report actual coverage and checks; do not claim total coverage unless measured.
```

## Prompt 19 — Logging, monitoring, tracing and shutdown reliability

```text
Complete observability and lifecycle handling. Use structured Pino logs with request/correlation IDs and redaction of credentials, tokens, cookies, reset links and personal/sensitive fields. Add request duration/status metrics, error tracking integration through an environment-configured Sentry adapter, and trace/correlation propagation across HTTP requests and background jobs where practical. Add /health/live and true /health/ready semantics.

Implement graceful SIGTERM/SIGINT shutdown: stop accepting new HTTP work, drain active requests with a deadline, stop workers/queues, close Socket.IO, and close Redis/database connections in a defined order. Handle database/cache outages and upstream timeouts explicitly. Treat uncaught exceptions/unhandled rejections as process-level failures: log safely and exit/restart rather than continuing in an unknown state. Do not swallow process errors.

Add tests or verifiable smoke scripts for readiness during dependency failure, redaction and graceful shutdown. Document dashboards/metrics, useful log fields, failure diagnosis and shutdown order in docs/modules/observability-and-reliability.md. Update the matrix; stop after validation.
```

## Prompt 20 — Performance labs, worker threads, deployment and scaling

```text
Implement the production/deployment phase. Create multi-stage Dockerfiles and a local Docker Compose setup for the application, MongoDB (single-node replica set) and Redis, plus worker process and Nginx reverse-proxy configuration where appropriate. Add a production configuration checklist for TLS termination, forwarded headers/trust proxy, compression, request/upstream timeouts, body limits, health checks, logging and secret injection. Do not commit actual secrets or certificates.

Add a CPU-intensive report-generation lab using worker_threads (not for ordinary I/O) and document when it is appropriate. Add a repeatable horizontal-scaling exercise with multiple stateless API instances behind Nginx/load balancing; include session/cache/shared-state considerations. Demonstrate graceful shutdown under deployment restart. If using Node cluster, keep it as a measured optional lab and explain the tradeoff versus container/process orchestration.

Add smoke tests/scripts and docs/runbooks/local-development.md plus docs/runbooks/deployment.md. Document measured performance rather than invented claims. Update the concept matrix; run all feasible checks and clearly identify external prerequisites.
```

## Prompt 21 — Express edge-case and compatibility Concept Lab

```text
Create a dedicated, clearly isolated Concept Lab for Express mechanics that are useful to understand but do not belong in everyday production routes. Implement and test examples for app.use() vs app.all(), app.param(), next('route'), route ordering, req.app, res.locals, middleware short-circuiting, trust proxy, URL-encoded parsing and static serving. Keep unsafe/debug-only routes disabled in production and never expose secrets.

Add focused examples/tests for stream failures, aborted client connections, request timeout behaviour, res.headersSent and correct delegation to the default error handler. Add a separate minimal compatibility fixture under labs/express-v4-compat with its own package manifest and tests to compare Express 4 vs Express 5 async rejection behaviour; do not downgrade the main application or mix both major versions in its runtime.

Document the purpose, expected output, command and production relevance for every lab in docs/modules/express-concept-lab.md. Update the matrix only when each example is tested. Keep the labs isolated from business code and stop here.
```

## Prompt 22 — MongoDB advanced-features lab

```text
Create an isolated MongoDB lab (separate folder, explicit scripts and environment variables) that demonstrates MongoDB features that are valuable to understand but do not belong in everyday request paths: aggregation pipelines for sales/seller reports ($match, $group, $lookup, $facet), TTL indexes (token and idempotency expiry), text and partial indexes with `explain()` query-plan inspection, change streams reacting to order-status changes (replica set required), and collection-level `$jsonSchema` validators as a second line of defence behind Mongoose validation. The lab must not be required for the main application to start, and it must not duplicate the commerce application.

Add focused examples with a way to run each one and verify its output (tests or documented repeatable commands, as required by CLAUDE.md). Document which concerns are MongoDB-specific and which are general database concerns, and the production relevance of each feature.

Write docs/modules/mongodb-lab.md, add setup/run commands, and update the concept matrix with exact file/command evidence. Run all checks that can run in the current environment and report any external dependency honestly.
```

## Prompt 23 — Focused documentation, README and architecture decisions

```text
Audit the documentation for completeness and consistency with the actual code. Keep README.md concise: project overview, architecture at a glance, major modules, prerequisites, setup, key scripts, environment setup link, test command, API docs link, and links to deeper docs. Do not turn README into a long tutorial or repeat all module details.

For every implemented module, ensure a focused docs/modules/*.md page exists with: purpose, key design/strategy choice and why, request/data flow, important files, main API/events, validation/security boundaries, failure modes, how to run tests, and known tradeoffs. Add/update concise architecture decision records (ADRs) for material choices such as modular monolith, MongoDB/Mongoose (embedding vs referencing), repository boundaries, mock payments, idempotency/outbox, Redis caching/jobs, auth/session split, and worker deployment. Link everything from README.

Cross-check documentation against code, commands and OpenAPI. Remove stale claims and duplicate explanations. Never document a feature as complete if its implementation/tests are missing. Update the matrix and report all documentation gaps still open.
```

## Prompt 24 — Exhaustive concept coverage audit (do not skip anything)

```text
Perform a strict coverage audit against docs/coverage/EXPRESS_CONCEPT_MATRIX.md and the full Express.js concept list established in CLAUDE.md/playbook. Do not add broad new features before the audit. For every concept, verify all four pieces of evidence: real implementation/demo, automated test or repeatable verification, focused documentation, and an exact path/command. Search for TODOs, placeholder handlers, hard-coded fake success responses, untested claims, dead code and examples that are not wired or executable.

Mark a concept verified only if all evidence exists and relevant checks pass. For every missing/partial item, implement the smallest correct solution, add the test and documentation, and update the matrix. Pay special attention to less-obvious items: next('route'), app.all, app.param, req.app/res.locals, Express 4 vs 5, res.headersSent, trust proxy, aborted streams, worker_threads, sessions/CSRF, OIDC state/nonce, database race conditions, transaction rollback, idempotency, queue retries, outbox delivery and graceful shutdown.

Run the complete available test/lint/format/security/build suite. Report any environment-dependent checks separately; do not mark them verified. Do not stop after listing gaps—fix them one by one within this phase.
```

## Prompt 25 — Release gate and final handover

```text
Run a final release-readiness review of ShopSphere. Do not assume earlier summaries are correct; inspect the repository and execute the available verification commands. Confirm the app starts from documented instructions, migrations/seeds work, health/readiness endpoints behave correctly, OpenAPI matches routes, and unit/integration/security tests pass. Verify no real secrets, live payment integrations, unsafe debug routes, or accidental production exposure of Concept Lab endpoints exist.

Review security, input validation, authorization/ownership, transaction boundaries, concurrency, idempotency, logging redaction, dependency audit, Docker/Nginx configuration, graceful shutdown and recovery instructions. Fix issues found when practical; do not hide failures by skipping tests. Update README's final status and docs/coverage/EXPRESS_CONCEPT_MATRIX.md with evidence-backed states only. Add a concise release checklist and known limitations.

Finish with a concise handover: architecture summary, key commands, checks actually run and their results, important design decisions, coverage-matrix status, and any remaining blockers. Never say “all concepts complete” if any item is not verified.
```

---

# Final verification checklist

Before considering the project finished, confirm:

- [ ] `CLAUDE.md` contains the persistent working rules.
- [ ] Core app uses Express 5; Express 4 comparison is isolated.
- [ ] MongoDB/Mongoose is the only core data store (no PostgreSQL, Prisma or SQL); the MongoDB features lab is optional and isolated.
- [ ] Every listed concept has implementation/demo, test/verification, focused docs and an exact path in the coverage matrix.
- [ ] README is concise and links to detailed module docs, ADRs, runbooks, testing strategy and coverage matrix.
- [ ] No important module is only a plan, TODO, stub or fake success response.
- [ ] Tests and quality checks were actually run; any environment-dependent checks are clearly labelled.
- [ ] Mock payments only; no live credentials or real transaction processing.
- [ ] Security, graceful shutdown, monitoring, retries, idempotency and deployment instructions are covered.
- [ ] Remaining limitations are explicit rather than being hidden behind a “complete” status.

**Working rule:** One prompt, one implementation phase, one verification pass. If a phase fails its checks, fix it before moving on.
