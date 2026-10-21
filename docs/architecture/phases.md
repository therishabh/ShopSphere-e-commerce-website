# Phase Plan

One phase per request, one verification pass, one commit. A phase is done only when its code, tests and docs exist and its checks ran.

| #   | Phase                    | Main outcome                                                                        |
| --- | ------------------------ | ----------------------------------------------------------------------------------- |
| 0   | Guardrails               | CLAUDE.md, README, docs skeleton, matrix (this phase)                               |
| 1   | Foundation               | app.js/server.js, env validation, health live/ready, lint/format/test scripts       |
| 2   | HTTP & routing           | `/api/v1` routers, params/query/body, status codes, static, 404                     |
| 3   | Middleware               | Ordered pipeline, request IDs, logging, `next`/`next(err)`, `res.locals`, `req.app` |
| 4   | Error handling           | Error hierarchy, central handler, async semantics, `headersSent`                    |
| 5   | Validation & contracts   | Zod, pagination/sort/filter allowlists, OpenAPI + Swagger UI                        |
| 6   | Persistence              | Mongoose models/indexes, migrations, seed, repositories, transactions, readiness    |
| 7   | Authentication           | Signup/login, hashing, refresh rotation, verify/reset flows                         |
| 8   | Authorization & sessions | Roles, ownership, audit, cookie sessions, CSRF                                      |
| 9   | Catalog & inventory      | Products, inventory concurrency, reviews, wishlists                                 |
| 10  | Cart & orders            | Server-side pricing, checkout transaction, idempotency, state machine               |
| 11  | Security hardening       | Helmet, CORS, rate limits, threat model, security tests                             |
| 12  | Files & streaming        | Multer uploads, storage adapters, CSV streaming                                     |
| 13  | Caching                  | Redis cache-aside, invalidation, measured benchmark                                 |
| 14  | Background jobs          | BullMQ worker, retries, outbox, scheduled jobs                                      |
| 15  | Webhooks                 | Signature verification, idempotent events, adapter pattern                          |
| 16  | OAuth/OIDC               | Auth code + PKCE, state/nonce, identity linking                                     |
| 17  | Realtime                 | Socket.IO, authorized rooms, post-commit publish, notifications                     |
| 18  | Test strategy            | Suite separation, coverage threshold, CI                                            |
| 19  | Observability            | Pino redaction, metrics, Sentry, tracing, graceful shutdown                         |
| 20  | Deployment & scaling     | Docker, Compose, Nginx, worker_threads lab, scaling exercise                        |
| 21  | Express concept lab      | Edge-case labs, `labs/express-v4-compat`                                            |
| 22  | MongoDB features lab     | Aggregation, TTL/text indexes, explain(), change streams, $jsonSchema (isolated)    |
| 23  | Docs audit               | README, module docs, ADRs consistency                                               |
| 24  | Coverage audit           | Matrix verification, gap fixing                                                     |
| 25  | Release gate             | Final review, checklist, handover                                                   |

## Assumptions

- Node.js current LTS and npm; lockfile is `package-lock.json`.
- Checks needing MongoDB/Redis are labelled environment-dependent. MongoDB needs a replica set for transactions; the local single-node replica set comes from `compose.yaml` (Phase 6), and Phase 20 extends Compose to the whole stack.
- Mock providers are the only payment/email/OIDC integrations; real ones are out of scope.
- Phases may reorder tracking of a concept (for example, `trust proxy` appears in Phases 11, 20 and 21) but its matrix row stays unverified until every evidence item exists.
- The repo was empty at Phase 0, so there was no existing code to preserve.
