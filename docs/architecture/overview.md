# Architecture Overview

> Target architecture. Phases 0-8 are implemented (API, MongoDB, auth, authorization, Redis browser sessions); worker, Socket.IO, Nginx and the rest are still planned. See the [matrix](../coverage/EXPRESS_CONCEPT_MATRIX.md) for real status.

## Shape

```
clients ──> Nginx ──> API process (Express 5) ──> MongoDB (Mongoose)
                          │  └── Redis (cache, sessions)
                          │  └── Socket.IO (realtime)
                          └── outbox rows ──> Worker process (BullMQ + Redis)
                                                 └── email / reports / alerts / realtime fan-out
```

- **Modular monolith.** One deployable API, one worker, same repo. Modules (auth, users, sellers, products, cart, orders, admin, …) own their routes, services and repositories and talk through service interfaces, not each other's tables.
- **Layering per module:** route → validation (Zod) → controller (HTTP only) → service (rules, transactions) → repository (Mongoose).
- **System of record:** MongoDB (replica set, so multi-document transactions work). Side effects that must follow a DB change go through a transactional outbox, never inside the transaction.
- **Redis:** cache-aside for public reads, BullMQ queues, session store. Redis loss must degrade, not corrupt commerce state.
- **Externals behind adapters:** payments (mock), email (test sink), object storage (local/S3), OAuth/OIDC (test provider), error tracking (Sentry). All have deterministic test doubles.
- **Identity:** bearer tokens with refresh rotation for API clients; a separate cookie-session + CSRF path for browsers; OIDC as a third, separate login path.
- **Labs are isolated:** Express concept lab, `labs/express-v4-compat` (own manifest), and the MongoDB features lab never ship in the core request path.

## Planned layout

```
src/app.js, src/server.js, src/worker.js
src/config/  src/common/  src/modules/<module>/
migrations/  scripts/  tests/{unit,integration,security,e2e}/
labs/  docs/  deploy/
```

Layout shown is the plan; the real tree is in the README (section 8).

## Decisions to record as ADRs

Modular monolith, MongoDB/Mongoose (embedding vs referencing), repository boundaries, mock payments, idempotency + outbox, Redis for cache/jobs, auth/session split, worker deployment. ADRs live in [decisions/](decisions/README.md) and are written in the phase that makes each decision.
