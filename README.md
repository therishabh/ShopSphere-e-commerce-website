# ShopSphere

Multi-vendor e-commerce backend (customers, sellers, admins). Express 5 + ESM JavaScript, MongoDB + Mongoose, Redis, BullMQ, Socket.IO.

> Ye README poora project guide hai: kya banaya, kis sequence mein, kyun, aur code kaise kaam karta hai. Har phase ke baad update hoti hai. Naye developer ya fresher ko sirf ise padh ke project aur uska code samajh aa jana chahiye, aur isi ko recipe ki tarah follow karke doosra project bhi banaya ja sake.

**Current status: Phase 8 complete** (foundation, routing, middleware, errors, validation, MongoDB persistence, authentication, aur ab **authorization + browser sessions**: roles/permissions, seller ownership, admin approval/moderation, audit trail, Redis cookie sessions with CSRF). **Database sirf MongoDB hai: PostgreSQL/Prisma/SQL bilkul nahi.** OpenAPI + Swagger UI `main` par nahi hain: wo branch `feature/openapi-swagger` par hain.

---

## Is README ko kaise padhein

Poori file ek saath padhna zaruri nahi. Apne goal ke hisaab se path chuno:

| Goal                                                        | Is order mein padho                                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project ka idea chahiye** (5 min)                         | [1. Overview](#1-project-ka-overview) → [11. Roadmap](#11-roadmap-phase-025) → [12. Matrix status](#12-concept-coverage-matrix-ka-status)                                                                                         |
| **Project run karna hai** (5 min)                           | [2. Quick start](#2-quick-start) → [9. Run kaise karein](#9-run-kaise-karein-setup-scripts) → [15. FAQ](#15-faq--troubleshooting)                                                                                                 |
| **Code samajhna hai** (new dev / fresher)                   | [6. Key concepts](#6-key-concepts-glossary) → [5. Code reading order](#5-code-kaise-padhein-reading-order-aur-request-walkthrough) → [8. Project structure](#8-current-project-structure) → code kholo aur tests saath mein padho |
| **Pura build sequence samajhna / dusra project banana hai** | [7. Build Log](#7-build-log-phase-by-phase) ko Phase 0 se step-by-step follow karo → [13. Recipe](#13-is-project-ko-recipe-ki-tarah-reuse-karna)                                                                                  |
| **Naya phase / feature add karna hai**                      | [4. Working rules](#4-working-rules-claudemd-aur-workflow) → [14. Limitations](#14-known-limitations--tradeoffs) → `docs/modules/routing-and-http.md` ka "How to add a new route"                                                 |

**Is README ke conventions**

- **Phase N** = ek complete, tested implementation unit. Har phase ka ek Build Log section hai; phases order mein hain aur aage nahi jaate.
- **Step N** = us phase ke andar kaam ka exact sequence. Steps order mein follow karoge to same result milega.
- **Result** line = phase ke end ka verified outcome (tests/lint kya the).
- **Status words** (matrix mein): `planned → in progress → implemented → tested → documented → verified`. `verified` ka matlab: code + test + doc + checks actually run hue.
- **Interim** = abhi ke liye theek hai, baad ke phase mein replace hoga (README mein hamesha batate hain kab).
- Code snippets README mein real code se liye gaye hain. Shaq ho to `src/` ki file hi final truth hai.
- **`src/` ki har file mein detailed Hinglish comments hain** (kya kaam, kyun, library ke concepts jaise Zod/Pino/Express). Tests mein sirf header/group-level comments hain jo pehle se the; aage naye test comments nahi likhe jaate. Pehli baar code padh rahe ho to `src/config/env.js`, `src/server.js`, `src/app.js` se shuru karo; unke comments model hain.

---

## Table of Contents

1. [Project ka overview](#1-project-ka-overview)
2. [Quick start](#2-quick-start)
3. [Tech stack aur fixed decisions](#3-tech-stack-aur-fixed-decisions)
4. [Working rules (CLAUDE.md) aur workflow](#4-working-rules-claudemd-aur-workflow)
5. [Code kaise padhein: reading order aur request walkthrough](#5-code-kaise-padhein-reading-order-aur-request-walkthrough)
6. [Key concepts (glossary)](#6-key-concepts-glossary)
7. [Build Log (phase by phase)](#7-build-log-phase-by-phase)
   - [Phase 0 — Guardrails aur docs skeleton](#phase-0--guardrails-aur-docs-skeleton)
   - [Phase 1 — Application foundation](#phase-1--application-foundation)
   - [Phase 2 — HTTP fundamentals aur routing](#phase-2--http-fundamentals-aur-routing)
   - [Phase 3 — Middleware pipeline aur request context](#phase-3--middleware-pipeline-aur-request-context)
   - [Phase 4 — Centralized error handling](#phase-4--centralized-error-handling)
   - [Phase 5 — Validation aur API conventions](#phase-5--validation-aur-api-conventions)
   - [Phase 6 — Persistence: MongoDB + Mongoose](#phase-6--persistence-mongodb--mongoose)
   - [Phase 7 — Authentication](#phase-7--authentication)
   - [Phase 8 — Authorization, ownership aur browser sessions](#phase-8--authorization-ownership-aur-browser-sessions)
8. [Current project structure](#8-current-project-structure)
9. [Run kaise karein (setup, scripts)](#9-run-kaise-karein-setup-scripts)
   - [API Reference (har route ki list)](#api-reference-har-route-ki-list)
10. [Verification results (ab tak)](#10-verification-results-ab-tak)
11. [Roadmap (Phase 0–25)](#11-roadmap-phase-025)
12. [Concept coverage matrix ka status](#12-concept-coverage-matrix-ka-status)
13. [Is project ko recipe ki tarah reuse karna](#13-is-project-ko-recipe-ki-tarah-reuse-karna)
14. [Known limitations / tradeoffs](#14-known-limitations--tradeoffs)
15. [FAQ / troubleshooting](#15-faq--troubleshooting)
16. [Docs index](#16-docs-index)

---

## 1. Project ka overview

ShopSphere ek production-style multi-vendor e-commerce backend hai. Teen type ke users: **customer** (browse, cart, order), **seller** (apne products/inventory/orders), **admin** (seller approval, moderation).

Architecture: **modular monolith**. Ek HTTP API process aur ek alag worker process, dono same repo mein. Microservices tab tak nahi jab tak koi demonstrated reason na ho.

```
clients ──> Nginx ──> API process (Express 5) ──> MongoDB (Mongoose)
                          │  └── Redis (cache, sessions)
                          │  └── Socket.IO (realtime)
                          └── outbox rows ──> Worker (BullMQ + Redis)
                                                └── email / reports / alerts / realtime fan-out
```

Module ka layering rule (jab modules aayenge): `route → validation (Zod) → controller (sirf HTTP) → service (business rules, transactions) → repository (Mongoose)`. Controller mein business logic nahi.

Is repo ka secondary goal: har Express concept (middleware, error handling, `next('route')`, `res.headersSent`, trust proxy, streams, etc.) code + test + doc ke saath demonstrate karna. Isliye ek coverage matrix maintain hota hai (section 12).

## 2. Quick start

Prerequisites: Node.js >= 24, npm, aur **Docker** (local MongoDB replica set aur Redis ke liye). Redis sirf browser sessions ke liye hai: na ho to bhi baaki API (bearer auth) chalti hai.

```bash
git clone https://github.com/therishabh/ShopSphere-e-commerce-website.git
cd ShopSphere-e-commerce-website
npm ci                      # lockfile se exact versions
cp .env.example .env        # MONGODB_URI is mein hai
npm run db:up               # MongoDB (single-node replica set) + Redis Docker mein
npm run db:migrate          # collections + validators + indexes
npm run db:seed             # sample data
npm run dev                 # server http://127.0.0.1:3000
```

Check karo ki chal raha hai:

```bash
curl localhost:3000/health/ready
# {"status":"ready","checks":{"db":"up"}}

curl -i localhost:3000/api/v1/examples/ping       # X-Request-Id + security headers dekho; server terminal mein JSON log line

curl 'localhost:3000/api/v1/examples/validation/demo-products?category=shoes&sort=-price&limit=2'   # validated list

curl -X POST localhost:3000/api/v1/examples/notes -H 'content-type: application/json' -d '{"text":"hello"}'
# {"id":1,"text":"hello"}   (201, Location header ke saath)

npm test                    # 390 tests, ~1-2 sec
```

Aage ka detail section 9 mein hai.

## 3. Tech stack aur fixed decisions

| Area           | Choice                                                            | Reason / note                                                                                                                                     |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js current LTS (`>=24`), ESM                                 | Native `--watch`; no TypeScript by choice                                                                                                         |
| Framework      | Express 5.3.0                                                     | Async handler ke rejected promises automatically error middleware tak jaate hain (wrapper ki zarurat nahi)                                        |
| Core DB        | **MongoDB + Mongoose 9** (replica set)                            | Document model, flexible catalog, order snapshots embedded; FK/CHECK nahi milte, isliye validators + unique/partial indexes + conditional updates |
| Auth libraries | `argon2` (Argon2id passwords), `jsonwebtoken` (JWT access tokens) | Dono maintained; refresh/verify/reset tokens opaque random + SHA-256 hash DB mein                                                                 |
| Migrations     | Apna chhota versioned runner (`migrations/`)                      | Mongo mein built-in SQL jaisi migrations nahi                                                                                                     |
| Redis          | Browser sessions (Phase 8); aage cache aur BullMQ queues          | Outage par commerce state corrupt nahi hona chahiye: Redis band ho to sirf cookie-session requests 503 deti hain                                  |
| Realtime       | Socket.IO                                                         | Order status updates                                                                                                                              |
| Storage        | S3-compatible, adapter ke peeche                                  | Local adapter dev ke liye                                                                                                                         |
| Validation     | Zod 4.6.7                                                         | Env + request validation                                                                                                                          |
| Tests          | Jest 30 + Supertest                                               | Native ESM mode                                                                                                                                   |
| Lint/format    | ESLint 10 (flat config) + Prettier 3                              |                                                                                                                                                   |
| Payments       | **Mock provider only**                                            | Real card data / live credentials kabhi nahi                                                                                                      |

Saari dependencies `--save-exact` se pinned hain aur `package-lock.json` committed hai.

## 4. Working rules (CLAUDE.md) aur workflow

`CLAUDE.md` root mein hai aur har phase ke liye persistent instructions deta hai. Core rules:

- Ek baar mein ek phase. Plan ko implementation ki jagah nahi dena, aur aage skip nahi karna.
- Edit se pehle relevant files padho; working code preserve karo.
- Koi TODO / stub / fake success response / empty handler nahi. Blocker ho to exact blocker batao.
- Har meaningful behaviour aur error path ke liye test. Commands actually run karke hi "pass" bolna.
- Controllers mein business logic nahi, secrets source mein nahi, sensitive data log mein nahi.
- **Naye tests nahi likhe jaate** (abhi focus development par hai). Purane tests rehte hain aur pass hone chahiye; naye features ka evidence repeatable manual verification (curl commands + observed result) se likha jata hai.
- **`src/` ki har file mein detailed Hinglish comments** (fresher bhi samajh sake): purpose, "kyun", aur unfamiliar library behaviour. Tests mein naye comments nahi (descriptive test names kaafi hain). Comments se code kabhi nahi badalna chahiye; verify AST compare se hota hai.
- Payments/email/external services ke liye mock providers.
- **Har implementation ke baad README update** (Hinglish, Table of Contents, step-by-step Build Log, snippets) + docs + matrix.
- Concept matrix rule: **koi concept tab tak complete nahi jab tak implementation, test, doc aur exact path/command, sab evidence na ho.**

Phase workflow: prompt do → implement → diff + checks review → fail ho to fix → commit → agla phase.

## 5. Code kaise padhein: reading order aur request walkthrough

### 5.1 Reading order (Phase 7 tak ka code)

Is order mein files kholo; har step pichle step par build hota hai. Har source file ke saath uska test bhi padho.

| #   | File                                                                                                            | Kya samajh aayega                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `package.json`                                                                                                  | ESM (`"type": "module"`), scripts, pinned deps                                                                           |
| 2   | `src/config/env.js`                                                                                             | Environment variables ek jagah validate hote hain (Zod); baaki code `process.env` nahi chhuta                            |
| 3   | `src/server.js`                                                                                                 | Process ka entrypoint: `dotenv` -> config -> listen -> signals. App yahan nahi banta                                     |
| 4   | `src/app.js`                                                                                                    | `createApp()` factory: **mount order** yahin dikhta hai                                                                  |
| 5   | `src/health/readiness.js`, `health.routes.js`                                                                   | Liveness vs readiness; named dependency checks                                                                           |
| 6   | `src/logging/logger.js`, `src/middleware/*.js`                                                                  | Pino logger + redaction; request ID, request logger, conditional `when/unless`, Helmet                                   |
| 7   | `src/routes/api.routes.js`                                                                                      | `/api/v1` prefix, body parsers, module mounts                                                                            |
| 7b  | `src/db/` (`database.js`, `models/`, `repositories/`, `map-database-error.js`), `migrations/`, `compose.yaml`   | MongoDB connection + models + validators + repositories + transactions + error mapping (Phase 6)                         |
| 7c  | `src/modules/auth/*.js`, `src/email/*.js`, `src/db/repositories/{refresh-tokens,one-time-tokens}.repository.js` | Auth: service (flows), token-service (JWT + opaque), password-hasher, middleware, rate-limit hook, test mailer (Phase 7) |
| 8   | `src/modules/{users,cart,orders}/*.routes.js`                                                                   | Abhi bhi khaali-par-mounted modules (auth/sellers/products/admin ab bhare hain)                                          |
| 8b  | `src/modules/authz/*.js`, `src/modules/{sellers,products,admin}/*.js`                                           | Phase 8: permissions (`can`), `requirePermission`, ownership checks, seller apply/approve, product moderation, audit     |
| 8c  | `src/modules/session/*.js`, `src/redis/redis.js`                                                                | Phase 8: Redis cookie session, CSRF, `authenticateEither`, session registry                                              |
| 9   | `src/http/route-guards.js`                                                                                      | Reusable route-specific middleware (415, 400, 405)                                                                       |
| 10  | `src/errors/app-errors.js`, `to-app-error.js`, `src/http/error-handler.js`, `not-found.js`                      | Error hierarchy, thrown value ki classification, aur central safe response + logging                                     |
| 11  | `src/http/validate.js`, `src/http/query/*.js`, `src/http/schemas.js`                                            | Zod validation middleware, strict query helpers, pagination/sorting allowlist, shared response schemas                   |
| 12  | `src/modules/products/products.schemas.js`                                                                      | DTO schemas ka representative set (list query, id params, create body, response)                                         |
| 13  | `src/examples/*.routes.js`                                                                                      | HTTP, middleware, error aur validation concepts ke working demos; comments mein concept naam likha hai                   |
| 14  | `tests/**` (+ `tests/helpers/`)                                                                                 | Behaviour ka spec; examples/tests se hi seekhna sabse tez hai                                                            |

### 5.2 Ek request ka poora safar

Example: `POST /api/v1/examples/notes` body `{"text":"hello"}`, header `Content-Type: application/json`.

```
Client
  │
  ▼
Node HTTP server            src/server.js        app.listen(port, host)
  │
  ▼
Express app                 src/app.js           createApp()
  ├─ requestId                     X-Request-Id banaya/reuse; res.locals.requestId set
  ├─ requestLogger                 start time + child logger; 'close' par log line likhega
  ├─ helmet                        security headers response par set
  ├─ app.use('/health', ...)       prefix match nahi  -> skip
  ├─ app.use('/static', ...)       prefix match nahi  -> skip
  └─ app.use('/api/v1', ...)       match ✔
        │                          src/routes/api.routes.js
        ├─ express.json({limit:'100kb'})   body parse -> req.body = { text: 'hello' }
        ├─ express.urlencoded(...)         content-type match nahi -> skip
        ├─ '/auth' ... '/admin'            prefix match nahi -> skip
        └─ '/examples'                     match ✔ (sirf non-production mein mounted)
              │                            src/examples/http-examples.routes.js
              └─ router.route('/notes').post(requireJson, handler)
                    ├─ requireJson            content-type JSON? haan -> next()
                    ├─ noteBody.safeParse()   Zod: strict object, text 1..200 chars
                    └─ res.status(201).location('/api/v1/examples/notes/1').json(note)
  │
  ▼
Response band hone par requestLogger ek JSON line likhta hai:
{"level":30,"requestId":"...","method":"POST","status":201,"durationMs":3.1,"route":"/notes","msg":"request completed"}
```

Dhyaan do: body, query, headers, cookies ya path-param values us log line mein kabhi nahi aate.

Validated routes (Phase 5, e.g. `/examples/validation/demo-products`) mein route aur handler ke beech `validate({ params, query, body })` lagta hai: galat input yahin 400 ke saath rukta hai aur handler tak nahi pahunchta; sahi input `res.locals.valid` mein normalized milta hai.

Agar kahin error ho (throw, rejected Promise ya `next(err)`), Express normal middleware skip karke seedha sabse last wale `errorHandler` par aata hai (section 7, Phase 4); wahi ek safe response banata hai.

Failure paths (har ek ka test hai):

| Kya galat hua                                            | Kahan pakda gaya                                             | Response                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| JSON toot-ta hai (`{"a": `)                              | `express.json` error throw karta hai -> `errorHandler`       | `400 BAD_REQUEST`, "Malformed request body"                                    |
| Body 100kb se bada                                       | `express.json`                                               | `413 PAYLOAD_TOO_LARGE`                                                        |
| Content-Type JSON nahi                                   | `requireJson` route middleware, handler tak nahi pahunchta   | `415`                                                                          |
| `text` missing / bahut lamba / extra field               | handler mein Zod check                                       | `400 VALIDATION_ERROR` + `details`                                             |
| Koi route match nahi hua                                 | sab ke baad `notFound`                                       | `404 NOT_FOUND`                                                                |
| Method galat (`DELETE /notes`)                           | `route().all(methodNotAllowed)`                              | `405` + `Allow` header                                                         |
| Handler mein bug (`throw new Error`) ya rejected Promise | Express 5 khud pakadta hai -> `errorHandler`                 | `500 INTERNAL_ERROR`, generic message; asli error + stack sirf server log mein |
| Malformed URL (`%E0%A4%A`)                               | Express params decode fail -> `errorHandler`                 | `400`                                                                          |
| Guard ne reject kiya (e.g. `/middleware/guarded`)        | route-level middleware response bhej deta hai, `next()` nahi | `403`; handler tak request nahi pahunchti                                      |

Har failure response par bhi `X-Request-Id` aur security headers hote hain, aur request log hoti hai (kyunki ID, logger aur Helmet parsers/routes se pehle hain).

Key idea: Express request ko **order mein registered middleware/routers** se guzaarta hai; jo pehle match hota hai wo handle karta hai ya `next()` se aage bhejta hai. Isiliye `app.js` aur `api.routes.js` ka order deliberate hai (reason Build Log Phase 2 Step 2–3 aur Phase 3 Step 8 mein).

## 6. Key concepts (glossary)

Sirf wo concepts jo ab tak code mein use hue hain. Naye phases ke concepts us phase ke saath add honge.

| Concept                                           | Matlab aur is project mein kahan                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESM**                                           | `import/export` module system (`"type": "module"`). File extensions import mein likhne padte hain (`./app.js`).                                                                                                                                       |
| **App factory**                                   | `createApp({ config, readiness })` ek function hai jo app _banata_ hai, global state nahi rakhta. Isse tests har baar fresh app bana sakte hain aur port ki zarurat nahi. (`src/app.js`)                                                              |
| **app.js vs server.js**                           | `app.js` = Express app ki wiring (testable). `server.js` = process-level kaam: port, env, signals, exit codes.                                                                                                                                        |
| **Dependency injection (halka)**                  | Config aur readiness ko function argument ki tarah pass karte hain, import se nahi. Tests fakes inject kar sakte hain.                                                                                                                                |
| **Fail-fast config**                              | Galat env var par server start hi nahi hota; saari errors ek saath print hoti hain (`ConfigError`, exit 1).                                                                                                                                           |
| **Liveness vs readiness**                         | `/health/live` = process zinda hai (dependency check nahi, restart decide karne ke liye). `/health/ready` = traffic lene layak hai (dependencies up, shutdown nahi). DB down ho to ready 503, live 200.                                               |
| **Readiness check**                               | Named async function; reject ya timeout = `down`. Phase 6 mein `db` check judega.                                                                                                                                                                     |
| **Middleware**                                    | `(req, res, next)` function. Response bhejke pipeline rok sakta hai, ya `next()` se aage bhejta hai.                                                                                                                                                  |
| **Router / mount**                                | `Router()` mini-app hai; `app.use('/prefix', router)` use ek URL prefix par lagata hai.                                                                                                                                                               |
| **Mount order**                                   | Express registration order mein match karta hai. Literal route (`/notes/latest`) ko parameter route (`/notes/:id`) se pehle rakhna padta hai.                                                                                                         |
| **Route-specific middleware**                     | Sirf ek route par lagne wala guard, e.g. `post(requireJson, handler)`.                                                                                                                                                                                |
| **`route().all()` fallback**                      | Same path ke methods group karke aakhir mein `.all(...)` lagao: koi method match na ho to 405 + `Allow`.                                                                                                                                              |
| **Body parser limit**                             | `express.json({limit:'100kb'})`: bada body 413 se reject. Parser sirf `/api/v1` par lagta hai.                                                                                                                                                        |
| **Simple query parser (Express 5)**               | `?x=1&x=2` -> `['1','2']`; `a[b]=1` nested object nahi banta. Values hamesha string.                                                                                                                                                                  |
| **Status codes**                                  | 201 + `Location` (create), 204 (delete, empty body), 400 (invalid input), 404, 405, 413, 415. Table: `docs/modules/routing-and-http.md`.                                                                                                              |
| **Safe error response**                           | Fixed `{error:{code,message}}`, raw error text ya stack nahi; 404 requested path echo nahi karta.                                                                                                                                                     |
| **Application / router / route-level middleware** | `app.use(...)` poori app par; `router.use(...)` ek router par; `router.get(path, mw, handler)` sirf us route par. Teeno ke examples: `requestId`, body parsers, `requireJson`.                                                                        |
| **`next()` / `next(err)`**                        | `next()` = agle matching middleware par; `next(err)` = normal middleware/handler skip karke error middleware (4 args) par. Response bhejke `next()` na call karna = pipeline yahin ruk gayi (`return res...` likho).                                  |
| **Conditional middleware**                        | `when(pred, mw)` / `unless(pred, mw)`: predicate par middleware chalao ya seedha `next()`. Health probes ka logging aise skip hota hai.                                                                                                               |
| **Request ID / correlation ID**                   | Har request ka unique ID (`X-Request-Id`); logs aur response mein same. Valid incoming ID reuse hota hai taaki ek call services ke beech trace ho sake.                                                                                               |
| **`res.locals`**                                  | Ek response/request ke liye scratchpad (`requestId`, `log`). Sirf downstream ko chahiye wahi values; entities ya secrets nahi. Requests ke beech share nahi hota.                                                                                     |
| **`req.app`**                                     | Handler se owning Express app tak pahunch (`req.app.locals.config`), import ke bina.                                                                                                                                                                  |
| **Structured logging (Pino)**                     | Har log JSON object hai (`level`, `requestId`, `status`, ...), machine-searchable. `LOG_LEVEL` se control; tests mein `silent`.                                                                                                                       |
| **Redaction**                                     | Pino `redact` paths sensitive keys (`password`, `token`, `authorization`, `cookie`) ko `[Redacted]` kar dete hain. Safety net hai; asli rule: sensitive data log hi mat karo.                                                                         |
| **Helmet / security headers**                     | `X-Content-Type-Options`, `Content-Security-Policy`, `X-Frame-Options`... ek middleware se. Har response par (errors par bhi).                                                                                                                        |
| **Route pattern vs raw path**                     | Logs mein `/echo/:value` (pattern) jaata hai, `/echo/abc123` nahi, kyunki path params mein tokens ho sakte hain.                                                                                                                                      |
| **Operational vs unexpected error**               | Operational = expected (validation, 404, conflict): client ko message milta hai, stack log nahi. Unexpected = bug/infra (DB down): client ko generic 500, server log mein poora error + stack. `isOperational` flag isi ke liye.                      |
| **AppError hierarchy**                            | `AppError` ki subclasses (`NotFoundError`, `ConflictError`, ...), har ek ka fixed status aur stable `code`. Service/handler bas `throw new ...Error()` karta hai. (`src/errors/`)                                                                     |
| **Error middleware (4 args)**                     | `(err, req, res, next)`: Express ise isi signature se pehchanta hai; sabse last mount hota hai. Ek hi jagah saare errors ka response + logging.                                                                                                       |
| **Express 5 async errors**                        | `async` handler mein throw ya rejected Promise Express 5 khud `next(err)` bana deta hai; try/catch ya `asyncHandler` wrapper ki zarurat nahi (Express 4 mein hoti thi).                                                                               |
| **Safe error response**                           | `{ error: { code, message, details? } }`; kabhi stack, cause, ya raw error text nahi. Handler mein `NODE_ENV` branch nahi, isliye production aur dev same.                                                                                            |
| **`res.headersSent`**                             | Response shuru ho chuka ho to naya error response nahi bhej sakte; handler `next(err)` se Express ke default handler ko deta hai jo connection band karta hai.                                                                                        |
| **Zod `strictObject`**                            | Schema mein na likhi hui koi bhi extra key reject. Mass-assignment (client ka `role: 'admin'` bhejna) aur typo wali query keys isi se pakdi jaati hain.                                                                                               |
| **`validate()` middleware**                       | params/query/body ko schema se check karta hai handler se pehle; galti par 400 + `details: [{source, path, message}]`; sahi data `res.locals.valid` mein.                                                                                             |
| **Normalized query**                              | Validation ke baad ka clean list-query: `{ page, limit, offset, sort: [{column, direction}], q, filters }`; repository ko seedha diya jaa sakta hai.                                                                                                  |
| **Sort allowlist (map)**                          | `{ apiName: dbColumn }`; user sirf apiName bhej sakta hai, DB column hamesha map se aata hai, user string se nahi. Isse arbitrary column selection/injection band.                                                                                    |
| **Offset vs cursor pagination**                   | Offset (`page`/`limit`) simple hai aur total deta hai, par deep pages slow aur data badalne par unstable. Deep/infinite lists ke liye cursor (keyset) baad mein.                                                                                      |
| **DTO (Data Transfer Object)**                    | API ka request/response shape, database model se alag; DB badle to API na tute. `src/modules/<m>/<m>.schemas.js`.                                                                                                                                     |
| **ODM / Mongoose**                                | Object Document Mapper: MongoDB ke documents ko JS objects ki tarah use karne ka library (schemas, validation, queries). Models `src/db/models/`.                                                                                                     |
| **Replica set**                                   | MongoDB servers ka group (hamare local mein ek node). Multi-document **transactions sirf replica set par** chalte hain, isliye local container bhi replica set hai.                                                                                   |
| **Embedding vs referencing**                      | Embed = child document parent ke andar (cart items, order items, product stock): ek read/atomic write. Reference = alag collection mein `_id` se (users, reviews): jab child alag lifecycle ya unbounded ho.                                          |
| **Collection validator**                          | MongoDB ke server par lagne wala rule (SQL ke CHECK ka roop) jo har write par chalta hai, `$inc`/raw scripts par bhi (error code 121). Mongoose validators in par nahi chalte.                                                                        |
| **Atomic conditional update**                     | `updateOne({ _id, available >= n }, { $inc: ... })`: ek hi operation mein check + change; do requests ek saath aayein to bhi oversell nahi. Isse stock ke liye transaction nahi chahiye.                                                              |
| **Transaction (commit / rollback)**               | Kai writes "ya sab ya koi nahi". `database.transaction(async (repos) => ...)`: throw = rollback, return = commit, conflict par driver retry. Andar external calls (payment/email) nahi.                                                               |
| **Outbox**                                        | Business change aur "baad mein ye kaam karna hai" event ek hi transaction mein likho; worker baad mein uthata hai. Isse event kho nahi sakta.                                                                                                         |
| **TTL index**                                     | Index jo `expiresAt` ke baad document khud delete kar deta hai (tokens, idempotency records): alag cleanup job nahi.                                                                                                                                  |
| **Partial index**                                 | Index sirf kuch documents par (e.g. sirf `status: 'ACTIVE'` carts par unique): "ek user ka ek active cart".                                                                                                                                           |
| **ObjectId**                                      | MongoDB ki id (24 hex characters). API mein `id` string ban jaati hai; format `objectId()` validator se check hota hai.                                                                                                                               |
| **Regex escape (ReDoS)**                          | User ka search text regex mein daalne se pehle special characters escape karte hain, warna `.*` sab match karta aur `(a+)+$` server atka sakta.                                                                                                       |
| **Access token vs refresh token**                 | Access token = chhoti umar ka (15 min) signed JWT jo har request ke saath `Authorization: Bearer` mein jaata hai. Refresh token = lambi umar ka random token jo sirf naya access token lene ke kaam aata hai; har use par badal jaata hai (rotation). |
| **JWT (jsonwebtoken)**                            | Signed token (`header.payload.signature`). Server signature se verify karta hai, database nahi dekhta (stateless), isliye expiry se pehle revoke nahi hota. Algorithm pin karna zaruri (`alg=none` attack).                                           |
| **Refresh-token rotation + reuse detection**      | Har refresh par purana token bekaar aur naya milta hai (same "family"). Purana dobara aaye to chori maanke poori family revoke.                                                                                                                       |
| **Argon2id**                                      | Password hashing ka slow, memory-hard algorithm (OWASP recommended). Brute force mehenga; salt hash string mein hi. Plain/fast hash (SHA-256) passwords ke liye galat.                                                                                |
| **Token hash (SHA-256)**                          | Refresh/verify/reset token DB mein sirf hash ke roop mein. DB leak ho to bhi token wapas nahi banta.                                                                                                                                                  |
| **Single-use token**                              | Ek atomic DB update jo token check karke "used" mark karta hai: do requests ek saath aayein to bhi sirf ek chalti hai.                                                                                                                                |
| **Account enumeration**                           | Attacker ka response/timing se pata lagana ki email registered hai ya nahi. Rokne ke liye generic responses aur dummy-hash timing.                                                                                                                    |
| **Rate-limit hook**                               | `check / record / reset` interface; abhi in-memory, baad mein Redis se badal sakta hai bina service badle.                                                                                                                                            |
| **RBAC / permission**                             | Role-based access control: role (customer/seller/admin) se permissions ki list; route sirf permission maangta hai (`requirePermission`). Jo list mein nahi wo **default deny**.                                                                       |
| **Authentication vs authorization**               | Authentication = tum kaun ho. Authorization = tum ye kaam kar sakte ho ya nahi. Phase 8 mein alag modules.                                                                                                                                            |
| **Ownership check**                               | Role kaafi nahi: "ye product tumhara hai?" Service mein compare + DB query filter (`{_id, sellerId}`) dono = **defense in depth**; ID badalne se doosre ka data nahi badalta.                                                                         |
| **Moderation / state machine**                    | Admin ke allowed transitions (seller: approve/reject/suspend/reinstate; product: approve/reject); galat transition 409.                                                                                                                               |
| **Audit event**                                   | Sensitive admin kaam ka record (actor, action, target, kab) bina password/token ke.                                                                                                                                                                   |
| **Session vs token**                              | Bearer token client khud bhejta hai (API clients). Session = server Redis mein state, browser ko sirf cookie (session id). Dono alag path, ek request mein mix nahi.                                                                                  |
| **HttpOnly / Secure / SameSite / `__Host-`**      | Cookie flags: JS padh nahi sakta / sirf HTTPS / cross-site requests par nahi jaati / `__Host-` prefix = Secure + Path=/ + no Domain (production mein).                                                                                                |
| **Session fixation**                              | Attacker pehle se session id de de aur victim login kare. Rokne ke liye login par `regenerate` (nayi id).                                                                                                                                             |
| **CSRF + synchronizer token**                     | Doosri site browser se tumhari cookie ke saath request bhej de. Rokne ke liye session-bound token `X-CSRF-Token` header mein + Origin/`Sec-Fetch-Site` check + SameSite.                                                                              |
| **Idle vs absolute timeout (rolling)**            | Idle: itni der request nahi to session khatam (har request par taza). Absolute: kitna bhi active ho, itne ghante baad dobara login.                                                                                                                   |
| **Trust proxy**                                   | Reverse proxy ke peeche `X-Forwarded-*` par bharosa; `TRUST_PROXY_HOPS` sirf asli proxy hops jitna, warna client IP/protocol jhooth bol sakta hai.                                                                                                    |
| **Redis (sessions)**                              | In-memory key-value store; sessions TTL ke saath yahan. Down ho to sirf cookie requests 503.                                                                                                                                                          |
| **Interim**                                       | Abhi ke liye kaafi, baad ke phase mein replace (e.g. Phase 2 ka `clientErrorHandler` Phase 4 mein central `errorHandler` se replace hua).                                                                                                             |
| **Modular monolith**                              | Ek deployable app, andar alag modules (auth, products, ...). Microservices nahi.                                                                                                                                                                      |
| **Mock provider**                                 | Payment/email ke test-safe fake adapters; real credentials kabhi nahi.                                                                                                                                                                                |
| **Exact pinning**                                 | `--save-exact` + committed `package-lock.json`: har machine par same versions.                                                                                                                                                                        |
| **Supertest**                                     | Bina port khole app par HTTP requests chalane ka tool (`request(app).get(...)`).                                                                                                                                                                      |
| **Mutation check**                                | Code jaan-boojh ke todke dekhna ki test fail hota hai ya nahi; pass-karne-wale-lekin-bekar tests pakadne ke liye.                                                                                                                                     |
| **Status ladder**                                 | Matrix mein `planned → ... → verified`; evidence ke bina aage nahi badhta.                                                                                                                                                                            |

## 7. Build Log (phase by phase)

### Phase 0 — Guardrails aur docs skeleton

**Goal:** code likhne se pehle rules aur tracking system set karna. Koi application code nahi.

Sequence:

1. **Repo inspect kiya.** Folder khaali tha, isliye preserve karne layak kuch nahi. Playbook file (`ShopSphere_Claude_Code_Prompt_Playbook.md`) poori padhi, kyunki matrix mein "playbook ke har concept" ko enumerate karna tha.
2. **`CLAUDE.md` banaya.** Process, fixed decisions, code standards, testing rules, documentation rules, matrix rule.
3. **Docs skeleton banaya:**
   ```
   docs/architecture/overview.md        # target architecture
   docs/architecture/phases.md          # Phase 0-25 plan + assumptions
   docs/architecture/decisions/         # ADRs (abhi khaali)
   docs/modules/  docs/runbooks/  docs/security/  docs/testing/   # index README.md har ek mein
   docs/coverage/EXPRESS_CONCEPT_MATRIX.md
   ```
4. **Concept matrix generate kiya.** 235 concepts, 22 phase-sections mein grouped (Foundation, HTTP/routing, middleware, errors, validation, persistence, auth, authorization, catalog, orders, security, files/streaming, caching, jobs, webhooks, OIDC, realtime, tests, observability, deployment, Express concept lab, Mongoose lab). Columns: concept, implementation/demo, test/verification, documentation, status. Sab `planned`, evidence columns me `—`.
5. **Status ladder fix ki:** `planned → in progress → implemented → tested → documented → verified`. `verified` sirf tab jab checks actually run hokar pass hue ho.

Result: guardrails + tracking ready, code zero.

### Phase 1 — Application foundation

**Goal:** Express 5 ESM scaffold, `app.js` vs `server.js` split, validated env config, predictable startup, health endpoints (real readiness), tooling (lint/format/test), tests.

Sequence jo follow hua:

**Step 1 — Environment check aur versions decide kiye.**

```bash
node -v   # v24.15.0
npm view express@5 version   # 5.3.0
```

Node 24 = current LTS, isliye `engines: ">=24"`.

**Step 2 — `package.json` aur dependencies (exact pinned).**

```jsonc
{
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
  },
}
```

```bash
npm install --save-exact express@5.3.0 zod@4.6.7 dotenv@18.0.8
npm install --save-dev --save-exact jest supertest eslint @eslint/js prettier eslint-config-prettier globals
```

- `.env` loading ke liye `dotenv` (exact pinned) use hota hai, aur sirf `src/server.js` ke `main()` mein `dotenv.config({ quiet: true })` se load hota hai. `loadConfig` aur `createApp` import par `.env` nahi chhuute, isliye tests local `.env` se affect nahi hote. `dotenv` already-set environment variables ko override nahi karta, isliye production mein real env vars hi jeette hain.
- Jest native ESM ke liye `--experimental-vm-modules` chahiye (Babel transform nahi).

**Step 3 — Tooling config.** `.gitignore` (node_modules, `.env`, coverage; `.env.example` allowed), `.prettierrc.json` (single quotes, trailing commas, width 100), `eslint.config.js` (flat config, `eqeqeq`, `prefer-const`, `no-var`, unused vars error with `_` prefix ignore, `eslint-config-prettier` last, tests ke liye jest globals), `jest.config.js` (`testMatch: tests/**/*.test.js`, `transform: {}`).

**Step 4 — Validated config (`src/config/env.js`).**

```js
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
});

export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const { NODE_ENV, HOST, PORT } = result.data;
  return Object.freeze({ env: NODE_ENV, host: HOST, port: PORT });
}
```

Decisions: source argument ke roop mein `env` aata hai (tests `process.env` ko touch nahi karte); saare invalid fields ek saath report hote hain; result frozen; `PORT=0` allowed (tests ke liye ephemeral port). Naya env var = schema + `.env.example` dono mein add.

**Step 5 — Readiness tracker (`src/health/readiness.js`).** Core idea: readiness hard-coded "healthy" nahi hogi. Dependencies named async checks register karengi.

```js
export function createReadiness({ checks = {}, timeoutMs = 2000 } = {}) {
  let accepting = true;
  // runCheck: Promise.race(check(), timeout) -> 'up' | 'down'
  return {
    markShuttingDown() {
      accepting = false;
    },
    async report() {
      if (!accepting) return { ready: false, status: 'shutting_down', checks: {} };
      const names = Object.keys(checks);
      const states = await Promise.all(names.map((n) => runCheck(checks[n])));
      const ready = states.every((s) => s === 'up');
      return {
        ready,
        status: ready ? 'ready' : 'not_ready',
        checks: Object.fromEntries(names.map((n, i) => [n, states[i]])),
      };
    },
  };
}
```

Behaviour: check reject ya timeout = `down`; shutdown shuru hote hi 503 (checks run bhi nahi hote). Phase 1 mein koi dependency nahi, isliye process alive + shutting down nahi = ready. Phase 6 mein `db` check register hoga, tab DB outage = 503.

**Step 6 — Health router (`src/health/health.routes.js`).**

```js
router.get('/live', (_req, res) => res.json({ status: 'live' })); // dependencies check nahi
router.get('/ready', async (_req, res) => {
  const { ready, status, checks } = await readiness.report();
  res.status(ready ? 200 : 503).json({ status, checks });
});
```

Live aur ready alag isliye: DB down hone par orchestrator process restart na kare (live 200), lekin traffic route na kare (ready 503).

**Step 7 — `src/app.js` (factory, koi side effect nahi).**

```js
export function createApp({ config, readiness = createReadiness() }) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.config = config;
  app.use('/health', createHealthRouter(readiness));
  return app;
}
```

Port open nahi karta, `process.env` nahi padhta, import par I/O nahi. Isliye Supertest seedha app par chalta hai.

**Step 8 — `src/server.js` (process-level cheezein).**

```js
export async function startServer(config, { readiness = createReadiness() } = {}) {
  const app = createApp({ config, readiness });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(config.port, config.host);
    s.once('listening', () => resolve(s));
    s.once('error', reject); // EADDRINUSE yahin reject hota hai
  });
  async function close() {
    readiness.markShuttingDown(); // pehle LB ko 503 dikhao
    await new Promise((res, rej) => {
      server.close((e) => (e ? rej(e) : res()));
      server.closeIdleConnections();
    });
  }
  return { server, close, port: server.address().port };
}

// sirf direct execution par main() chalta hai, import par nahi
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}
```

`main()`: pehle `dotenv.config({ quiet: true })` (`.env` load; already-set env vars override nahi hote, `quiet` dotenv ka tip message band karta hai); phir `loadConfig()` -> `ConfigError` par message print + `exit(1)`; phir `startServer`; `SIGTERM/SIGINT` par `close()` aur exit. Full graceful drain (deadline, workers, DB/Redis ordered close) Phase 19 mein aayega, abhi sirf stop-on-signal.

Startup flow: `dotenv.config` -> `loadConfig` -> `createReadiness` -> `createApp` -> `listen` -> signal handlers.

**Step 9 — `.env.example`** (`NODE_ENV`, `HOST`, `PORT`). Real `.env` git mein nahi.

**Step 10 — Tests (23 tests, 4 suites).**

| File                               | Kya prove karta hai                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config.test.js`        | defaults, PORT coercion, frozen object, invalid `NODE_ENV/PORT/HOST`, saare errors ek saath                                |
| `tests/unit/readiness.test.js`     | no deps = ready; check up/down; hung check timeout; shutdown pe 503 aur checks run nahi hote                               |
| `tests/integration/health.test.js` | app bina port ke bana; `x-powered-by` nahi; live dependency down hone par bhi 200; ready 200/503; shutdown pe 503          |
| `tests/integration/server.test.js` | real ephemeral port pe serve + clean close; `EADDRINUSE` reject; invalid config pe child process exit 1 + readable message |

Note: native ESM mein `jest` global nahi hota, isliye `import { jest } from '@jest/globals'`.

**Step 11 — Manual verification** (sirf tests par bharosa nahi kiya):

```bash
PORT=3111 node src/server.js &
curl localhost:3111/health/live    # {"status":"live"} 200
curl localhost:3111/health/ready   # {"status":"ready","checks":{}} 200
kill -TERM <pid>                   # process exit ho gaya
```

`npm run dev` bhi temporary `.env` (`PORT=3112`) ke saath chalaya; `.env` load hua. Phir `.env` delete.

**Step 12 — Docs, README, matrix.** `docs/modules/application-foundation.md` likha; Phase 1 ke 7 matrix rows (`app creation`, `app/server split`, `env config`, `startup`, `scripts`, `/health/live`, `/health/ready`) exact test paths ke saath `verified` kiye. `/health/ready` row ke note mein likha ki abhi fake checks se verify hua, DB check Phase 6 mein.

**Step 13 — Audit.** `npm audit --omit=dev` = 0 vulnerabilities. Full `npm audit` mein sirf Jest ke dev-time transitive chain (`sprintf-js` via `istanbul`) ki moderate advisories hain; suggested fix Jest ko v25 par downgrade karta, isliye apply nahi kiya.

**Step 14 — Follow-up: `dotenv` adopt kiya (owner ki preference).** Shuru mein Node ka built-in `--env-file-if-exists` use kiya tha; baad mein `dotenv` par switch kiya:

```bash
npm install --save-exact dotenv      # 18.0.8
```

`package.json` ka dev script `node --watch src/server.js` ho gaya, aur `server.js` ke `main()` mein `dotenv.config({ quiet: true })` aaya. Import-time par load nahi kiya taaki tests (`createApp`, `loadConfig`, `startServer`) local `.env` se unaffected rahein.

Result: 23/23 tests pass, lint aur format clean.

### Phase 2 — HTTP fundamentals aur routing

**Goal:** `/api/v1` ke neeche modular routers, request parsing, HTTP methods/status codes, safe 404, static assets, aur sab concepts ka tested demo. Business endpoints nahi (wo apne phase mein).

Design decision jo pehle liya: "fake business endpoints nahi" aur "concepts demonstrate karne hain" dono saath chahiye the. Isliye:

- 7 module routers (**auth, users, sellers, products, cart, orders, admin**) valid aur mounted hain, lekin us waqt **khaali** the (URL space reserved, koi endpoint nahi). Baad mein `auth` Phase 7 mein, aur `sellers`, `products`, `admin` Phase 8 mein bhare gaye; abhi sirf `users`, `cart`, `orders` khaali hain.
- Concepts ek alag `/api/v1/examples` router mein dikhaye, jo sach mein kaam karta hai (per-app in-memory notes), clearly labelled hai, aur **production mein mount nahi hota**.

Sequence:

**Step 1 — Module routers (7 files).** Har module `src/modules/<name>/<name>.routes.js` mein `create<Name>Router()` export karta hai jo bas `Router()` return karta hai.

```js
export function createAuthRouter() {
  return Router();
}
```

**Step 2 — `/api/v1` router (`src/routes/api.routes.js`) aur uska order.**

```js
export const BODY_LIMIT = '100kb';

export function createApiRouter({ config }) {
  const api = Router();
  api.use(express.json({ limit: BODY_LIMIT }));
  api.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));

  api.use('/auth', createAuthRouter());
  /* users, sellers, products, cart, orders, admin ... */

  if (config.env !== 'production') api.use('/examples', createHttpExamplesRouter());
  return api;
}
```

Parsers sirf `/api/v1` ke andar hain (health/static par parsing ka cost nahi), explicit size limit hai, `extended: false` se nested-object expansion nahi hota.

**Step 3 — App mein deliberate mount order (`src/app.js`).**

```js
app.use('/health', createHealthRouter(readiness));
app.use('/static', express.static(PUBLIC_DIR, { index: false, dotfiles: 'ignore', maxAge: '1h' }));
app.use('/api/v1', createApiRouter({ config }));
app.use(notFound);
app.use(clientErrorHandler);
```

Order: `health -> static -> /api/v1 (parsers + modules) -> 404 -> error handler`. Static ke liye `public/example.txt` banaya; directory index band, dotfiles ignore, traversal 404.

**Step 4 — Safe 404 (`src/http/not-found.js`).** Fixed JSON body `{error:{code:'NOT_FOUND', message:'Resource not found'}}`; requested path echo nahi hota.

**Step 5 — 4xx errors ka interim handler (`src/http/client-errors.js`).** _(Phase 4 mein ye hata ke central `errorHandler` aaya.)_ Problem: malformed JSON, oversized body ya undecodable URL param par Express ka default handler non-production mein stack trace wala HTML deta. Isliye chhota handler jo sirf 4xx ko fixed message ke saath JSON mein map karta hai; baaki errors `next(err)` se aage jaate hain.

```js
export function clientErrorHandler(err, _req, res, next) {
  const status = err.status ?? err.statusCode;
  if (res.headersSent || !Number.isInteger(status) || status < 400 || status > 499)
    return next(err);
  const message =
    err.type === 'entity.parse.failed' ? 'Malformed request body' : STATUS_CODES[status];
  res.status(status).json({ error: { code: CODES[status] ?? 'CLIENT_ERROR', message } });
}
```

Ye interim hai; Phase 4 ise central error hierarchy se replace karega.

**Step 6 — Route-specific middleware (`src/http/route-guards.js`).** `requireJson` (415), `requireUrlEncoded`, `requireNumericParam(name)` (400), `methodNotAllowed(allowed)` (405 + `Allow`, `OPTIONS` ko 204).
Express 5 gotcha: `path-to-regexp` v8 mein inline regex (`/:id(\\d+)`) support nahi hai, isliye numeric id ki validation middleware mein ki.

**Step 7 — Examples router (`src/examples/http-examples.routes.js`).** Har endpoint ek concept dikhata hai:

| Endpoint                             | Concept                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `GET /ping`                          | `res.type().send()`                                                                |
| `GET /echo/:value?x=1&x=2`           | route params (URL-decoded) + query (repeated key = array, `a[b]` expand nahi hota) |
| `POST /echo/json`, `POST /echo/form` | JSON / urlencoded parsing + route-level `requireJson` / `requireUrlEncoded`        |
| `GET /old-notes`                     | `res.redirect(301, ...)` fixed target (open redirect nahi)                         |
| `GET /notes/latest`                  | route ordering: `/notes/:id` se **pehle** register                                 |
| `/notes` GET, POST                   | list (`?limit`), create `201` + `Location`                                         |
| `/notes/:id` GET, PUT, DELETE        | `200`, replace, `204`; missing `404`; bad id `400`                                 |
| `/notes/:noteId/comments`            | nested router (`mergeParams: true`)                                                |

`router.route()` se methods group kiye aur end mein `.all(methodNotAllowed([...]))`, jo tabhi chalta hai jab pehle koi method handler match na kare:

```js
router
  .route('/notes')
  .get(listNotes)
  .post(requireJson, createNote) // 201 + Location
  .all(methodNotAllowed(['GET', 'POST'])); // 405 + Allow
```

Body validation ke liye abhi inline Zod (`z.strictObject({ text: z.string().trim().min(1).max(200) })`) use hua (unexpected field reject); shared validation layer Phase 5 mein aayegi. Store har `createHttpExamplesRouter()` call par fresh banta hai, isliye tests isolated rehte hain.

**Step 8 — Probe: pehle behaviour dekha, phir assertions likhe.** Ek temporary script se malformed URI, path traversal, dotfile, empty JSON body, bracket query/form wagairah ke asli responses dekhe (e.g. traversal = 404, malformed URI = 400, empty JSON body = `{}`), taaki tests guess par na bane.

**Step 9 — Tests (+58, total 81 tests, 6 suites).**

| File                                | Kya cover hota hai                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/routing.test.js` | 404 (unknown/other method/`/api/v2`, path reflect nahi), malformed URI `400`, har empty module `404`, production mein examples `404`, params/query, JSON/form parsing (malformed `400`, `415`, `413`), notes CRUD status codes, validation errors, bad id, `405` + `Allow`, `OPTIONS`/`HEAD`, route ordering, per-app state, nested comments, redirect, mount-order checks |
| `tests/integration/static.test.js`  | file + headers, missing file JSON 404, no directory index, dotfile aur path traversal blocked, POST ignore                                                                                                                                                                                                                                                                 |

**Step 10 — Mutation check.** Pehli baar mein sab tests pass hue, isliye ordering test ko verify kiya: `/notes/latest` ko `/notes/:id` ke baad le jaane par test fail hua (1 failed), original restore par 81/81 pass. Matlab test sach mein ordering pakadta hai.

**Step 11 — Real server smoke.** `POST /api/v1/examples/notes` -> `201` + `Location: /api/v1/examples/notes/1`; `GET` wapas `200`; `/static/example.txt` -> `200 text/plain`; `/api/v1/auth/login` -> `404`; `/old-notes` -> `301`; `DELETE /notes` -> `405`.

**Step 12 — Docs aur matrix.** `docs/modules/routing-and-http.md` (mount order, naming, params/query/body, status codes, naya route kaise add karein). Matrix ke section 2 ke 14 rows exact test paths ke saath `verified`.

Result: 81/81 tests pass, lint aur format clean.

### Phase 3 — Middleware pipeline aur request context

**Goal:** request ID, structured logging, security headers, parsing, routing aur error handling ka ek **documented, intentional order**; application/router/route-level middleware, `next()`, `next(err)`, conditional middleware, pipeline rokna, `res.locals`, `req.app`; aur ye sab tests se proved. Logs mein sensitive data nahi.

Design decision: production middleware (`src/middleware/`) aur teaching examples (`src/examples/middleware-examples.routes.js`, non-production only) alag rakhe, taaki demo code real request path mein kabhi na aaye.

Sequence:

**Step 1 — Dependencies (exact pinned).**

```bash
npm install --save-exact helmet pino      # helmet 8.3.0, pino 10.4.0
```

**Step 2 — Config mein `LOG_LEVEL`.** Default environment ke hisaab se: tests mein `silent`, baaki mein `info`; isliye zod mein `optional()` rakha aur parse ke baad resolve kiya.

```js
LOG_LEVEL: z.enum(['trace','debug','info','warn','error','fatal','silent']).optional(),
// ...
const logLevel = LOG_LEVEL ?? (NODE_ENV === 'test' ? 'silent' : 'info');
return Object.freeze({ env: NODE_ENV, host: HOST, port: PORT, logLevel });
```

`.env.example` mein `LOG_LEVEL=info` add; config tests update (default object, env-wise level, invalid level).

**Step 3 — Logger + redaction (`src/logging/logger.js`).** Pino JSON logger, `service: 'shopsphere'`, ISO time, aur `redact` paths (`password`, `token`, `authorization`, `cookie`, unke `*.` nested versions, `req.headers.authorization/cookie`). Ye safety net hai: request logger headers/bodies waise bhi log nahi karta. `createLogger({ level, stream })` mein `stream` injectable hai, taaki tests memory mein log capture kar sakein.

**Step 4 — Request ID (`src/middleware/request-id.js`).**

```js
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;
export function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.set('X-Request-Id', id);
  next();
}
```

Caller ka valid ID reuse hota hai (correlation: ek ID services ke beech chale); unsafe/lamba ID replace hota hai taaki logs mein junk inject na ho.

**Step 5 — Request logger (`src/middleware/request-logger.js`).** `res.on('close')` par ek line: `requestId, method, status, durationMs` + `route` (pattern jaise `/echo/:value`) agar route match hua, warna `path` (query string ke bina, max 200 chars). Level: 2xx/3xx `info`, 4xx `warn`, 5xx `error`; response khatam hone se pehle connection tootna = `request aborted` (`warn`). `res.locals.log` par request-scoped child logger bhi milta hai.
Decisions: (a) `pino-http` ki jagah ~40 line ka apna middleware, taaki "kya log nahi hoga" par poora control rahe; (b) path-param values kabhi log nahi (reset/verify tokens baad mein wahin honge), isliye pattern; (c) query string, headers, cookies, bodies kabhi nahi.

**Step 6 — Conditional helper (`src/middleware/conditional.js`).**

```js
export function when(predicate, middleware) {
  return (req, res, next) => (predicate(req) ? middleware(req, res, next) : next());
}
export const unless = (predicate, mw) => when((req) => !predicate(req), mw);
```

Production use: health probes ka logging skip. Teaching use: `?debug=1` par extra step.

**Step 7 — Security headers (`src/middleware/security-headers.js`).** `helmet()` defaults. Phase 11 mein CSP/HSTS/CORS review hoga; abhi baseline.

**Step 8 — `app.js` mein order wire kiya.**

```js
app.use(requestId);                                          // 1
app.use(unless(isHealthCheck, createRequestLogger(logger))); // 2
app.use(securityHeaders());                                  // 3
app.use('/health', ...);                                     // 4
app.use('/static', ...);                                     // 5
app.use('/api/v1', createApiRouter({ config }));             // 6 (parsers + modules)
app.use(notFound);                                           // 7
app.use(clientErrorHandler);                                 // 8
```

Kyun is order mein: ID pehle (logger usi se child logger banata hai); logger sabse pehle responders se pehle (taaki 404/parse-error/rejected requests ka final status bhi log ho); headers kisi bhi response se pehle (errors par bhi lagein); health probes ID/headers paate hain par log/parse nahi hote; parsers sirf `/api/v1` mein. `createApp` ab optional `logger` leta hai (default: config.logLevel se).

**Step 9 — `server.js` ko bhi Pino par laaya.** `startServer` logger banata/lauta hai; "server listening" aur shutdown error ab structured logs hain. Config error (logger banne se pehle) `console.error` hi hai.

**Step 10 — Teaching examples (`/api/v1/examples/middleware`, non-prod only).**

| Endpoint                   | Kya dikhata hai                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `GET /chain`               | router-level -> route-level a -> b -> handler; `res.locals` mein request ID niche tak |
| `GET /conditional?debug=1` | `when()` se conditional middleware                                                    |
| `GET /guarded`             | guard response bhejke pipeline rokta hai (demo guard, auth nahi)                      |
| `GET /fail`                | `next(err)`: baaki middleware + handler skip                                          |
| `GET /app-config`          | `req.app.locals.config`                                                               |
| `GET /stats`               | counters jo prove karte hain ki kya chala                                             |

```js
function requireDemoRole(role) {
  return (req, res, next) => {
    if (req.get('x-demo-role') !== role) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }
    next();
  };
}
router.get('/guarded', requireDemoRole('admin'), (_req, res) => {
  calls.handler += 1;
  res.json({ ok: true });
});
```

`return` zaruri hai, warna response ke baad `next()` bhi chal jata.

**Step 11 — Tests (+42, total 123 tests, 8 suites).**

| File                                   | Kya prove karta hai                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/middleware.test.js` | request ID (generate, reuse, unsafe replace, har response par, 20 parallel requests mein unique); Helmet headers (health, static, API, 404, parse error); ek log line per request correlated; route pattern vs path; health probe log nahi hota; parser-rejected request bhi log hota hai; password/token/cookie/auth/body kabhi log mein nahi (success + malformed JSON dono); chain order; conditional; rejected request controller tak nahi pahunchta (counter 0); `next(err)` skip; `req.app`; production mein examples 404 |
| `tests/unit/middleware-units.test.js`  | `when/unless`; logger: aborted request, status->level table, child logger; redaction; silent logger                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/helpers/log-capture.js`         | asli Pino logger memory stream mein, entries parse karke assert                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Test-writing mein ek asli sabak mila: pehle maine `app.get('/boom')` ko `createApp()` ke **baad** register kiya to wo 404 handler ke baad aaya aur 404 mila. Express order yahi hai; un do cases ko fake req/res wale unit tests mein shift kiya.

**Step 12 — Mutation checks (teen).** Jaan-boojh ke todke dekha ki tests fail hote hain:

- `requestId` ko logger ke baad rakha -> 3 tests fail.
- Helmet ko `/api/v1` ke baad rakha -> 5 tests fail (parse-error response par headers gayab).
- Guard se `return` hataya -> 1 test fail (handler chal gaya).
  Restore ke baad 123/123.

**Step 13 — Real server smoke.** Server chalake curl: response par `X-Request-Id`, `Content-Security-Policy`, `X-Content-Type-Options`; caller ka `X-Request-Id: my-trace-12345` reuse hua; logs ki lines:

```json
{"level":30,"service":"shopsphere","requestId":"a7507d84-...","method":"GET","status":200,"durationMs":5.55,"route":"/ping","msg":"request completed"}
{"level":40,"service":"shopsphere","requestId":"my-trace-12345","method":"GET","status":403,"route":"/guarded","msg":"request completed"}
```

Health probe log nahi hua, aur `Authorization`/`Cookie`/query/body mein rakhe 4 "secret" strings logs mein 0 baar mile.

**Step 14 — Docs aur matrix.** `docs/modules/middleware.md` (order + reasons, categories, `next()` semantics, request IDs, `res.locals` rules, logging/sensitive-data rules). Matrix section 3 ke 14 rows exact paths ke saath `verified`.

Result: 123/123 tests pass, lint aur format clean.

### Phase 4 — Centralized error handling

**Goal:** saare errors ek jagah se ek jaise safe response mein nikalein; expected (operational) aur unexpected (bug/infra) failures ka logging alag ho; production mein stack ya internal detail client ko na jaye; Express 5 ke async semantics bina faltu wrapper ke use hon.

Design decision: Phase 2–3 ke interim pieces (`clientErrorHandler`, route-guards ke inline error JSON, examples ke helper functions) ko hata ke **sab kuch ek hi pipeline** se guzaara: code `throw`/`next(err)` kare, aur sirf `errorHandler` response banaye.

Sequence:

**Step 1 — Error hierarchy (`src/errors/app-errors.js`).** Base `AppError(message, { statusCode, code, details, headers, cause, isOperational })`, aur subclasses: `ValidationError` 400, `BadRequestError` 400, `AuthenticationError` 401, `AuthorizationError` 403, `NotFoundError` 404, `MethodNotAllowedError` 405 (+`Allow`), `ConflictError` 409, `PayloadTooLargeError` 413, `UnsupportedMediaTypeError` 415, `RateLimitError` 429 (+`Retry-After`), `InternalError` 500 (`isOperational = false`).

```js
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options = {}) {
    super(message, { ...options, statusCode: 404, code: 'NOT_FOUND' });
  }
}
```

Contract: `AppError.message` client ko seedha dikhta hai, isliye usme internal detail ya raw user input nahi; wo `cause` mein jata hai (sirf log hota hai).

**Step 2 — Classification (`src/errors/to-app-error.js`).** Koi bhi thrown value ek `AppError` banti hai:

```js
export function toAppError(err) {
  if (err instanceof AppError) return err; // humne jaan-boojh kar throw kiya
  if (err instanceof ZodError)
    return new ValidationError('Validation failed', { details, cause: err });
  const status = err?.status ?? err?.statusCode; // body-parser / Express ke 4xx errors
  if (Number.isInteger(status) && status >= 400 && status <= 499)
    return fromClientStatus(status, err);
  return new InternalError({ cause: err }); // bug, DB down, throw 'string', null...
}
```

Library ke 4xx errors par raw `err.message` kabhi copy nahi hota (malformed JSON ke message mein body ka tukda aa sakta hai); fixed message milta hai.

**Step 3 — Central error middleware (`src/http/error-handler.js`).** 4 arguments `(err, req, res, next)` (isi se Express ise error middleware samajhta hai).

```js
const appError = toAppError(err);
res.locals.errorCode = appError.code; // request log line mein jayega
if (!appError.isOperational) log.error({ err: original, headersSent }, 'unexpected error');
if (res.headersSent) return next(err); // Express default handler connection band karega
if (appError.headers) res.set(appError.headers);
res.status(appError.statusCode).json({ error: { code, message, ...(details && { details }) } });
```

Body mein kabhi stack, `cause` ya raw error text nahi. Handler mein **koi `NODE_ENV` branch nahi**, isliye production aur development ke response bodies same hain (safety env config par depend nahi karti). Dev mein diagnostics logs se milti hain.

**Step 4 — Logging: expected vs unexpected.**

- Operational (404, 409, validation...): extra log line nahi, stack nahi; request log ki ek line mein `status` + `errorCode` (`warn` level). Cause ho to `debug` par.
- Unexpected: alag `error`-level line `unexpected error` with original error + stack (`err` serializer) aur `requestId`; request line `status: 500, errorCode: INTERNAL_ERROR`.
- `throw 'string'` jaisi non-Error value: sirf type log hota hai (`Non-Error value thrown (string)`), content nahi.
  `request-logger.js` mein ek line add hui: `if (res.locals.errorCode) entry.errorCode = res.locals.errorCode;`.

**Step 5 — `res.headersSent` case.** Response shuru ho chuka ho (jaise streaming beech mein fail) to status/body badal nahi sakte. Handler log karke `next(err)` deta hai; Express ka default handler connection destroy karta hai, to client ko truncated response milta hai, "successful" jaisa nahi dikhta.

**Step 6 — Final 404 aur wiring.** `notFound` ab `next(new NotFoundError())` karta hai (response khud nahi banata), aur `app.js` mein sabse last:

```js
app.use(notFound);
app.use(createErrorHandler({ logger }));
```

`src/http/client-errors.js` delete.

**Step 7 — Purane code ko same pipeline par migrate kiya.** Route guards ab `next(new UnsupportedMediaTypeError(...))`, `next(new ValidationError(..., { code: 'INVALID_PARAMETER' }))`, `next(new MethodNotAllowedError({ allow }))` karte hain. Notes examples `throw new NotFoundError('Note not found')` karte hain aur body ko `noteBody.parse(...)` se validate karte hain (ZodError -> 400 automatically). Response bodies bilkul same rahe: purane 123 tests bina badlaav pass hue. Ek jaan-boojh ke chhoda gaya exception: `/middleware/guarded` demo apna 403 inline bhejta hai, kyunki wo "response bhejke pipeline rokna" dikhata hai.

**Step 8 — Teaching routes (`/api/v1/examples/errors`, non-prod only).** `/raise/:kind` (validation, authentication, authorization, not-found, conflict, rate-limit), `/sync-throw`, `/async-reject` (plain `async`, koi try/catch ya wrapper nahi), `/next-err`, `/throw-string`, `/service/reserve/:sku` (async service ka domain error) aur `/service/load` (nakli DB driver error jisme host/port hai), `/after-headers` (`res.write('partial')` ke baad error).

**Step 9 — Tests (+60, total 183 tests, 10 suites).**

| File                                       | Kya prove karta hai                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/errors.test.js`                | har class ka status/code/operational; `InternalError` cause rakhta hai; `toAppError` table (AppError, ZodError, library 4xx, 418, plain Error, 5xx, string, null, undefined, object); handler fake req/res ke saath: safe body + headers + `errorCode`, unexpected = error-level + original stack, operational = koi error-level nahi, non-Error content log nahi, `headersSent` par `next(err)` aur kuch nahi likha, `/health` jaise case mein bina request logger ke bhi chalta hai                                                          |
| `tests/integration/error-handling.test.js` | har operational kind ka status/code; `Retry-After`; sync throw / rejected Promise / `next(err)` / thrown string sab generic 500 aur body mein koi internal text nahi, logs mein asli error + stack; service ke 409/404; DB driver error ka host/port client ko nahi; unknown route; malformed/oversized body; ZodError -> 400 details; production vs development bodies identical; production mein teaching routes unmounted; asli server par `after-headers` (status 200, body `partial`, `complete === false`, log mein `headersSent: true`) |

**Step 10 — Mutation checks (chaar).** Jaan-boojh ke todke dekha:

- `headersSent` guard hataya -> 2 tests fail.
- 500 body mein asli error message daala (leak) -> 11 tests fail.
- Error handler mount hi nahi kiya -> 50 tests fail.
- Unexpected errors ko `error` ki jagah `warn` par log kiya -> 7 tests fail.
  Restore ke baad 183/183.

**Step 11 — Real server smoke.** Development: `sync-throw`, `async-reject`, `service/load` sab `{"error":{"code":"INTERNAL_ERROR","message":"Internal Server Error"}}` (500); `raise/conflict` 409; `raise/rate-limit` 429; `after-headers` par curl exit 18 (transfer truncated, yaani connection sahi band hua). Server log mein `unexpected error` line mein asli message aur stack. Production (`NODE_ENV=production`): `/nope` 404, teaching routes 404, malformed JSON 400 "Malformed request body", aur production log mein `"stack"` 0 baar.

**Step 12 — Docs aur matrix.** `docs/modules/error-handling.md` (propagation, classification, response contract, logging, `headersSent`, naya error type kaise add karein); routing/middleware docs mein interim lines hataayi. Matrix section 4 ke 9 rows exact test paths ke saath `verified`.

Result: 183/183 tests pass, lint aur format clean.

### Phase 5 — Validation aur API conventions

**Goal:** har request Zod schema se controller se pehle validate ho; list endpoints ke liye ek shared strict pagination/sorting/filtering toolkit (allowlist ke saath); aur chhota fixed response convention. Product business logic nahi.

> **Note:** playbook ke is phase mein OpenAPI + Swagger UI bhi tha. Owner ke decision se wo `main` par nahi hai: wo alag branch **`feature/openapi-swagger`** par pushed hai (poora kaam aur tests ke saath), aur project ke end mein merge hoga. Merge karne ke steps niche "Step 12" mein hain.

Design decisions:

- **Strict by default:** har request schema `z.strictObject`, query values strict string patterns (coerce nahi).
- **Allowlist map:** sorting mein user sirf API naam bhej sakta hai; DB column hamesha developer ke map se aata hai.
- **Product list sirf demo:** real products module Phase 9 mein; abhi schemas `src/modules/products/` mein hain aur ek non-production demo router unhe use karta hai (in-memory sample data).

Sequence:

**Step 1 — `validate()` middleware (`src/http/validate.js`).**

```js
router.post('/demo-products', validate({ body: createProductBodySchema }), handler);
```

params/query/body teeno `safeParse` hote hain; saari galtiyan ek saath `ValidationError` ke `details: [{ source, path, message }]` mein. Validated data `res.locals.valid.{params,query,body}` mein milta hai, kyunki Express 5 mein `req.query` read-only hai. Body schema ho to `Content-Type: application/json` zaruri (warna 415). Shared helper `src/errors/zod-details.js` ZodError ko details mein badalta hai (`to-app-error.js` bhi use karta hai).

**Step 2 — Query field helpers (`src/http/query/fields.js`).** `intString`, `booleanString`, `searchTerm`, `slug`. `z.coerce.number()` / `z.coerce.boolean()` jaan-boojh ke nahi use kiye: coerce `""`, `" 5 "`, `"1e3"` ko chupchaap number bana deta hai aur `"false"` ko `true`. Hum pehle strict regex lagate hain, phir convert.

**Step 3 — Pagination (`pagination.js`).** Offset strategy: `page` (1..10000, default 1), `limit` (1..100, default 20); `resolvePagination` offset nikalta hai; `buildPagination` response block banata hai. Cursor kyun nahi: offset simple hai aur total count deta hai; deep lists ke liye cursor baad mein per-endpoint (trade-off docs mein).

**Step 4 — Sorting allowlist (`sorting.js`).**

```js
export const PRODUCT_SORTABLE = { price: 'priceCents', createdAt: 'createdAt', name: 'name' };
// ?sort=-price,name  ->  [{ field:'price', column:'priceCents', direction:'desc' }, { field:'name', ... }]
```

Allowlist ek **map** hai (API naam -> DB column). Output mein sirf mapped column aata hai, isliye `sort=password`, `price;DROP TABLE`, `__proto__` sab regex par hi reject. Max 3 fields, duplicates nahi.

**Step 5 — List query builder (`list-query.js`).** `buildListQuerySchema({ sortable, defaultSort, filters, search, checkFilters })` ek strictObject banata hai (unknown query key = 400) aur normalized query deta hai: `{ page, limit, offset, sort, q?, filters }`. Cross-field rule (`minPrice <= maxPrice`) `checkFilters` mein. Default sort bhi allowlist ke against build time par check hota hai.

**Step 6 — Product DTO schemas (`src/modules/products/products.schemas.js`).** `productListQuerySchema`, `productIdParamsSchema` (UUID), `createProductBodySchema` (`z.strictObject`: `id`, `role`, `createdAt` jaise extra fields reject = mass-assignment protection), `productSchema`/`productListResponseSchema` (response DTO). Money integer minor units (`priceCents`), dates ISO string.

**Step 7 — Response convention (`src/http/schemas.js`).** Blanket envelope nahi: single resource = bare object (`201` + `Location` create par); collection = `{ items, pagination }`; `204` empty; error = `{ error: { code, message, details? } }`.

**Step 8 — Demo router (`src/examples/validation-examples.routes.js`).** Teen routes: `GET /demo-products` (list), `GET /demo-products/:productId` (UUID; Phase 6 mein ObjectId ho gaya), `POST /demo-products` (create, duplicate SKU = 409). In-memory 12 sample products; `applyListQuery` normalized query ko filter/sort/slice karta hai (wahi kaam jo Phase 9 mein Prisma karegi). `api.routes.js` ise non-production mein `/examples/validation` par mount karta hai.

**Step 9 — Existing tests (naye nahi).** Is phase ke tests (`query-helpers`, `validate-middleware`, `validation`) naya rule aane se pehle likhe gaye the; ab se naye tests nahi likhe jaate. Mutation checks se dekha ki safety pieces sach mein tests pakadte hain: sort regex hataya -> 27 fail; product body `strictObject` -> `object` -> 8 fail; `validate()` hataya -> ~100 fail; `booleanString` ko `z.coerce.boolean()` -> 11 fail; JSON content-type guard hataya -> 3 fail. (Seekh: mutation script mein hamesha assert lagao ki replace hua, Prettier ne ek baar line format badal di thi aur mutation silently apply nahi hui.)

**Step 10 — Real server smoke (repeatable).**

```bash
npm run dev
B=localhost:3000/api/v1/examples/validation/demo-products
curl "$B?category=shoes&sort=-price&limit=2"                   # 200, items + pagination
curl "$B?limit=0&role=admin&sort=password"                     # 400, 3 details (limit, unknown key, sort)
curl -X POST $B -H 'content-type: application/json' -d '{"sku":"X1","role":"admin"}'   # 400, field-wise details
curl $B/not-a-uuid                                             # 400, source params
```

**Step 11 — Docs aur matrix.** `docs/modules/validation-and-api-contracts.md` (validation, DTO strategy, pagination/sorting/filtering rules, response convention, API compatibility rules, naya route kaise add karein). Matrix section 5 ke 8 rows `verified`; "OpenAPI spec" aur "Swagger UI" `planned` (branch par bane hain).

**Step 12 — OpenAPI + Swagger branch mein kaise gaya (aur baad mein kaise milega).** Pehle poora Phase 5 (OpenAPI ke saath) ek temporary branch par save kiya, phir `main` par OpenAPI-free version banake commit kiya, phir `main` ke upar `feature/openapi-swagger` banayi jisme sirf OpenAPI/Swagger ke changes hain (`src/openapi/`, `src/docs/`, contract-based demo routes, `API_DOCS_ENABLED`, 2 dependencies, unke tests aur docs). Project ke end mein:

```bash
git checkout main
git merge feature/openapi-swagger     # conflicts ho to: README/matrix/validation doc/demo router mein
npm ci && npm test
```

Us branch par README (Phase 5 ka OpenAPI explainer, contract.js ka kaam, `/docs` ka use) aur doc already hain. Naye routes jo tab tak main par plain `router.get(..., validate(...), handler)` se bane honge, unhe `defineRoute` contracts mein badalna padega.

Result (main): 390/390 existing tests pass, lint aur format clean.

### Phase 6 — Persistence: MongoDB + Mongoose

**Goal:** poora project ek hi database par: **MongoDB + Mongoose** (PostgreSQL/Prisma/SQL bilkul nahi). Collections/schemas, integrity ke rules, migrations, seed, connection module, readiness, repositories, transaction helper, aur Mongo error mapping. Ismein naye tests nahi likhe gaye (owner ka rule); evidence repeatable manual verification se hai.

**Pehle decision badla (aur kyun).** Phase 6 originally PostgreSQL + Prisma ke liye plan tha. Owner ne poora project MongoDB par rakhne ka decision liya. Maine pehle honest trade-offs bataye: FK/CHECK constraints nahi milte, transactions ke liye replica set chahiye, migrations alag se banane padte hain; fir owner ke confirm karne par switch kiya. Is liye pehle jo Postgres/Prisma wala Phase 6 kaam shuru hua tha wo owner ne discard kar diya (kabhi commit nahi hua); maine uske bacha hua Docker container, volume aur khaali folders hataye.

Sequence:

**Step 1 — Playbook aur project ke decisions badle.** `ShopSphere_Claude_Code_Prompt_Playbook.md` (repo copy + Downloads copy) mein: project decisions (MongoDB + Mongoose, replica set, no SQL), Prompt 06 (collections, embedding vs referencing, validators, migrations, replica set), Prompt 09 (stock ke liye atomic conditional updates), Prompt 11 (NoSQL operator injection + regex/ReDoS), Prompt 20 (Compose mein MongoDB replica set), Prompt 22 (ab "MongoDB advanced-features lab": aggregation, TTL, text/partial indexes, `explain()`, change streams, `$jsonSchema`), checklist. `CLAUDE.md` ke fixed decisions, `docs/architecture/*`, aur matrix ke section 6 aur 22 bhi badle; memory mein bhi save kiya.

**Step 2 — Versions aur docs verify kiye** (CLAUDE.md rule): `mongoose@9.11.2` (Node >= 20.19), `mongo:8` image (server 8.3.13). Mongoose docs se: `connection.transaction()` driver ke `withTransaction` ko wrap karta hai, aur `transactionAsyncLocalStorage` se transaction ke andar session apne aap judta hai.

**Step 3 — `compose.yaml`: single-node replica set.** Transactions sirf replica set par chalte hain, to local container bhi replica set hai: `--replSet rs0` aur healthcheck jo `rs.status()` fail hone par `rs.initiate()` chalata hai. Port sirf `127.0.0.1` par. Local mein auth band hai (auth + replica set ke liye keyFile chahiye, throwaway DB ke liye overkill); production mein authenticated cluster ki URI.

```bash
npm run db:up      # docker compose up -d mongo
```

**Step 4 — Probe: design se pehle Mongoose ka asli behaviour dekha.** Ek throwaway script se confirm hua:

- Initial connect fail hone par **usi connection par `openUri` dobara chalta hai** (isse background retry loop banta hai).
- `connection.transaction()` + `transactionAsyncLocalStorage`: rollback bina `{ session }` pass kiye kaam karta hai; do conflicting transactions mein haarne wala apne aap retry hota hai (callback 3 baar chala).
- Atomic conditional decrement: 3 parallel requests mein sirf 1 safal (oversell nahi), bina transaction ke.
- Partial index (`$in`) aur TTL index chalte hain.
- **Gotcha:** `updateOne` par Mongoose validators default se **nahi** chalte (negative qty allowed ho gaya), aur `$inc` par update validators kabhi nahi chalte. Isliye `runValidators` global + **server-side collection validators** (SQL ke CHECK ka Mongo roop) jo har write par lagte hain.

**Step 5 — Config (`src/config/env.js`).** `MONGODB_URI` (`mongodb://` ya `mongodb+srv://`, **production mein required**, dev/test mein optional) aur `DB_POOL_MAX` (default 10), `AUTH_JWT_SECRET` (>= 32 chars; dev mein na ho to random + warning, **production mein required**), `APP_BASE_URL` (email links; production mein https), `ACCESS_TOKEN_TTL_SECONDS` (default 900), `REFRESH_TOKEN_TTL_DAYS` (default 30), optional `SEED_PASSWORD` (seed users ka dev password). `ServiceUnavailableError` (503, `Retry-After`, `isOperational: false`) naya error class.

**Step 6 — Models (`src/db/models/`).** 15 models, 4 files (identity, catalog, commerce, reliability) + `enums.js`, `shared.js`, `validators.js`. Har schema `strict: 'throw'` (schema ke bahar ka field error), timestamps, enums, aur JSON mein `_id` -> `id`. Embedding vs referencing ke decisions:

- **Stock product ke andar embedded** (`stock: { onHand, reserved }`): ek document par atomic update, transaction nahi chahiye.
- **Cart items cart ke andar**, **order items order ke andar snapshot** (naam/sku/price copy; seller ke orders `items.sellerId` multikey index se).
- Users, sellers, reviews, payment attempts alag collections (alag lifecycle, unbounded growth).
- `categorySlug` product mein denormalized (category filter bina join ke).
  Indexes: unique (email, seller+sku, review pair, wishlist pair, order number, token hashes), partial unique (ek user ka ek ACTIVE cart; provider reference sirf jab set ho), TTL (tokens, idempotency records), partial outbox index (sirf PENDING/FAILED).

**Step 7 — Server-side validators (`validators.js`).** Negative stock/price, `reserved <= onHand`, rating 1..5, cart quantity 1..100, order total = subtotal + shipping + tax, lowercase email, payment amount > 0, ye sab `collMod`/`createCollection` ke validators hain, to `$inc` ya raw script se bhi andar nahi ja sakte (error code 121).

**Step 8 — Database module (`src/db/database.js`).** `createDatabase({ uri, poolMax, logger })` -> `{ connection, models, repositories, connect, transaction, checkReady, disconnect }`.

```js
mongoose.set('transactionAsyncLocalStorage', true); // transaction ke andar session khud judta hai
mongoose.set('runValidators', true); // updates par bhi schema validators
// connect options: maxPoolSize, serverSelectionTimeoutMS 5000, bufferTimeoutMS 5000, autoIndex false, autoCreate false
```

- `connect({ retry: true })`: fail hone par backoff (0.5s -> 15s) ke saath background retry; server DB ke bina bhi start hota hai.
- `autoIndex`/`autoCreate` band: production mein app restart par bade collection par index build nahi hota; wo migrations ka kaam hai.
- `checkReady()`: `readyState === 1` + `admin().ping()`.
- Logs mein URI/credentials kabhi nahi (sirf error ka naam aur message).

**Step 9 — Error mapping (`src/db/map-database-error.js`).** `toAppError` ab Mongo errors ko bhi classify karta hai: duplicate key `11000` -> 409, validator failure `121` / write conflict `112` / `VersionError` -> 409, Mongoose `ValidationError` / `CastError` -> 400 (value echo nahi), `DocumentNotFoundError` -> 404, network/selection/auth/timeout/buffering errors -> 503, `StrictModeError` aur unknown -> 500.

**Step 10 — Repositories (`src/db/repositories/`).** `users`, `categories`, `products`, `audit`, `outbox`, `sequences` (aur `serialize.js`: `_id` -> `id`, `__v` hata ke). `users` mein `passwordHash` `select: false` hai, sirf `findAuthByEmail` use laata hai. `products.list(normalizedQuery)` Phase 5 ke normalized query ko seedha Mongo filter/sort/skip/limit banata hai (filter values validated primitives, isliye `{ "$ne": null }` jaisa operator injection nahi; search text regex-escape: `q=.*` aur `(a+)+$` kuch match nahi karte). `audit` secret-jaisi keys (nested bhi) reject karta hai. `sequences.next(name)` atomic `$inc` + upsert.

**Step 11 — Migrations (`src/db/migrations.js`, `migrations/`, `scripts/db.js`).** Mongo mein SQL jaisi built-in migrations nahi, to chhota versioned runner: `migrations/NNNN_name.js` (`name`, `up({ database })`), applied names `_migrations` collection mein. `0001_collections_validators_and_indexes` har collection validator ke saath banata hai aur schema indexes sync karta hai (idempotent).

```bash
npm run db:migrate   # pending migrations
npm run db:status    # applied / PENDING
npm run db:seed      # sample data (idempotent)
npm run db:reset     # DB drop + migrate + seed (production mein mana)
```

**Step 12 — Seed (`src/db/seed.js`).** 5 users (`@shopsphere.test`, passwordHash nahi: password hashing Phase 7 mein), 3 seller profiles (2 approved, 1 pending), 3 categories, 14 products (12 ACTIVE, 1 DRAFT, 1 PENDING_REVIEW), reviews, wishlist, ek active cart. Upsert se rerun-safe.

**Step 13 — Wiring (`server.js`, `app.js`).** `startServer` DB banata hai (`config.mongodbUri` ho to), readiness mein `db: () => database.checkReady()` jodta hai, `database.connect()` background mein chalata hai, `app.locals.database` set karta hai, aur `close()` mein **sabse aakhir** mein `database.disconnect()` (readiness off -> HTTP close -> DB close). `MONGODB_URI` na ho (dev/test) to warning log aur readiness mein db check nahi.

**Step 14 — Phase 5 ke DTOs UUID se ObjectId.** `objectId()` helper (24 hex), `productIdParamsSchema` aur `productSchema.id` ObjectId, demo router ke ids `randomBytes(12).toString('hex')`.

**Step 15 — Purane tests mein minimal edits (naye nahi).** Deliberate behaviour changes ki wajah se: production configs ko ek dummy `MONGODB_URI` chahiye (production mein required), config default object mein `dbPoolMax: 10`, aur `validation.test.js` mein UUID constants ki jagah ObjectId.

**Step 16 — Manual verification (`docs/modules/database-and-persistence.md` mein commands aur observed results).**

- 19 constraint checks: validators (`121`) aur duplicates (`11000`) sahi; partial indexes sahi allow/deny.
- Repositories: filters/sort/pagination/search, hidden `passwordHash`, regex-special searches 3-8 ms mein khaali.
- Transactions: commit se 3 documents, rollback se 0 (session pass kiye bina), conflicting transactions retry hue, 20 concurrent sequence numbers unique, atomic stock reservation mein ek hi jeeta.
- Server: DB up 200, Mongo band 503 (live 200), restart par apne aap recover, DB band hote hue boot par bhi server start aur baad mein 200, SIGTERM clean exit, production mein URI ke bina exit 1.
  Verification mein 3 cheezein pakdi gayi aur theek hui: `findOneAndUpdate({ new: true })` Mongoose 9 mein deprecated (`returnDocument: 'after'`); `$inc` par validators nahi chalte (isliye server-side validators); shutdown ek in-flight connect attempt ka intezaar karta hai (~3s, max 5s).

**Step 17 — Docs aur matrix.** `docs/modules/database-and-persistence.md` (data model, embedding vs referencing, integrity table (database vs application enforced), indexes, transactions, migrations, failure handling, manual verification, test DB strategy). Matrix section 6: 12 rows `verified`, "Test database isolation" `planned` (strategy documented, tests nahi likhe).

Result: 390/390 purane tests pass (koi naya test nahi), lint aur format clean.

**Dhyaan:** branch `feature/openapi-swagger` abhi purane (UUID wale) `main` par based hai. Merge karte waqt ObjectId wale changes (`products.schemas.js`, `fields.js`, validation tests/spec) conflict de sakte hain.

### Phase 7 — Authentication

**Goal:** account authentication: signup, login, logout, password hashing, access-token verification, refresh-token rotation/revocation, expiry, email verification, aur password reset. Tokens sirf hash ke roop mein store, reset/verify tokens expiring aur single-use, logs mein kabhi password/hash/token nahi, aur account enumeration kam se kam. Authorization (roles/ownership) Phase 8 mein hai. Naye tests nahi likhe (owner ka rule); evidence manual verification se (`docs/modules/authentication.md`).

Sequence:

**Step 1 — Libraries verify ki** (CLAUDE.md rule): `argon2@0.45.1` (maintained, OWASP ka Argon2id) aur `jsonwebtoken@9.0.3` (JWT library; shuru mein `jose` use hua tha, owner ki preference par badla). Ek probe se confirm hua: argon2id hash/verify ~22 ms, `needsRehash` kaam karta hai, corrupt hash par `verify` throw karta hai (isliye wrapper use), aur JWT library expired / galat signature / galat audience / garbage / **`alg=none`** sab reject karti hai jab `algorithms: ['HS256']` pin ho. (Ye probe pehle `jose` par chala tha; `jsonwebtoken` par switch ke baad dobara, Step 12 dekho.)

**Step 2 — Config.** `AUTH_JWT_SECRET` (>= 32 chars, **production mein required**; dev mein na ho to har run par random secret + warning), `APP_BASE_URL` (email links, production mein `https://`), `ACCESS_TOKEN_TTL_SECONDS` (default 900), `REFRESH_TOKEN_TTL_DAYS` (default 30). Ye `config.auth` ke andar. `AuthorizationError` ko `code` override milta hai (`EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED` ke liye).

**Step 3 — Repositories.** `refresh-tokens` (create, findByHash, atomic `claim`, `linkReplacement`, `revokeFamily`, `revokeAllForUser`), `one-time-tokens` (create, atomic `consume`, `invalidateOutstanding`), aur `users` mein `setPasswordHash`, `markEmailVerified`.

```js
// Single-use ek hi atomic update se: token mile, purpose sahi ho, usedAt null ho, expire na hua ho, aur "used" mark ho jaye.
OneTimeToken.findOneAndUpdate(
  { tokenHash, purpose, usedAt: null, expiresAt: { $gt: new Date() } },
  { $set: { usedAt: new Date() } },
  { returnDocument: 'before' },
);
```

**Step 4 — Email (test-only).** `src/email/test-mailer.js`: emails memory mein jama (last 100), log mein sirf template ka naam. `templates.js`: verification, password reset, password changed, already-registered. Non-production route `GET /api/v1/examples/mailbox` taaki flows curl se test ho sakein (production mein 404). Production mein asli email abhi nahi jaati: startup par warning.

**Step 5 — Auth module (`src/modules/auth/`).**

- `password-hasher.js`: Argon2id (m=19 MiB, t=2, p=1), `verify` kabhi throw nahi karta, `verifyDummy` (unknown email ke liye barabar time), `needsRehash`.
- `token-service.js`: access token = JWT (HS256, `sub`, `role`, `iss`, `aud`, `exp`, `jti`); refresh/verify/reset = 256-bit random opaque token, DB mein SHA-256 hash.
- `attempt-limiter.js`: in-memory `check / record / reset` (rate-limit **hook**: baad mein Redis se badla ja sakta hai). Limits: login (email+ip) 5 / 15 min, ip 30, email 20; mail endpoints email 3 / ghanta, ip 20.
- `auth.schemas.js`: `z.strictObject` bodies. Email trim + lowercase, password 12..128 (trim nahi), tokens length-bounded.
- `auth.service.js`: poora business logic (neeche flows).
- `auth.middleware.js`: `authenticate` Bearer token verify karke `res.locals.auth = { userId, role }` rakhta hai; sab failures ek jaisa 401 + `WWW-Authenticate`.
- `auth.controller.js`: sirf HTTP; `auth.routes.js`: routes + `Cache-Control: no-store`; `index.js`: composition root (limiters, services, router).

**Step 6 — Flows (`auth.service.js`).**

```
signup  -> hash PEHLE (timing barabar) -> transaction: user + verification token + audit -> email commit ke BAAD
login   -> throttle -> user lookup -> argon2 verify (unknown email par dummy) -> TABHI status check -> tokens
refresh -> hash lookup -> revoked? (rotate hua tha = reuse) -> expiry -> user ACTIVE? -> atomic claim + naya token (same family)
reset   -> transaction: token consume + naya hash + saare sessions revoke + baaki reset tokens bekaar + audit
```

Principles: signup/forgot/resend hamesha ek hi generic `202`; login galat email aur galat password par ek hi `401`; status (`403`) sirf sahi password ke baad dikhta hai; verify/reset token ki har failure ek jaisa `400 INVALID_TOKEN`; email transaction ke andar nahi (commit ke baad), fail ho to sirf log.

**Step 7 — Wiring.** `createApiRouter({ config, database, logger })`: database ho to `createAuthModule(...)` ka router `/auth` par; database nahi (tests, `MONGODB_URI` set nahi) to `/auth` khaali router rehta hai (fake endpoint nahi, 404). `app.js` ab `database` aur `logger` pass karta hai.

**Step 8 — Seed.** `SEED_PASSWORD` (optional env, >= 12 chars) set ho to `@shopsphere.test` users ko argon2 hash milta hai (local login ke liye). Source mein koi password nahi.

```bash
SEED_PASSWORD='something-long-123' npm run db:seed
```

**Step 9 — Purane tests mein minimal edits (naye nahi).** Config ke naye rules ki wajah se: production configs ko `AUTH_JWT_SECRET` aur `https` `APP_BASE_URL` chahiye, aur default config object mein `auth: {...}`. 390 tests ab bhi pass.

**Step 10 — Manual verification (60 checks, sab pass; poori list `docs/modules/authentication.md` mein).** Asli server + MongoDB par throwaway script se:

- Enumeration: duplicate signup ka response **byte-identical**, forgot-password existing/unknown identical, login unknown vs wrong password identical body, timing 23.3 ms vs 22.2 ms.
- Tokens: bogus/reused/expired verification aur reset tokens sab ek jaisa `400`; access token garbage, expired, forged secret, wrong audience/issuer, `alg=none`, non-Bearer sab `401`.
- Refresh: rotation, purana token replay = poori family revoke + audit event, do parallel refresh mein sirf ek jeeta, expired refresh 401, logout ke baad replay 401 (aur reuse flag nahi), logout-all sab sessions band.
- Reset: saare sessions revoke, purana password band, notification email.
- Policy: unverified 403, disabled 403, disabled user ka refresh band aur `/me` 401.
- Limits: 5 failures ke baad sahi password par bhi 429 + `Retry-After`, doosra email unaffected, success counter reset karta hai, mail endpoint 4th request 429.
- DB/logs mein koi raw password, token, JWT ya `$argon2` nahi. Startup: secret ke bina dev warning, production mein secret/https ke bina exit 1.

Ek galat alarm bhi mila: meri ek check ne "reuse events == 1" maana tha jabki parallel-refresh test pehle hi ek legitimate reuse event bana chuka tha. Before/after count se dobara check karne par logout ke baad replay reuse nahi gina jaata aur rotate ke baad replay gina jaata hai.

**Step 11 — Docs aur matrix.** `docs/modules/authentication.md` (endpoints, flows, token lifecycle, cookie vs header decision, account policy, anti-enumeration, rate limits, threats aur trade-offs, manual verification). Matrix section 7 ke 12 rows `verified`.

**Step 12 — `jose` se `jsonwebtoken` par switch (owner ki preference).** Pura JWT code ek hi file mein tha (`src/modules/auth/token-service.js`), isliye sirf wahi badli: `npm uninstall jose`, `npm install --save-exact jsonwebtoken@9.0.3`. Docs mein `exp` ke baare mein kuch saaf nahi tha, isliye pehle asli behaviour probe kiya:

- **Gotcha:** `jsonwebtoken.verify` bina `exp` claim wale token ko bhi accept karta hai (agar signature sahi ho), yaani aisa token kabhi expire nahi hota. Isliye verify ke baad `exp`, `sub` aur `role` ka hona explicitly zaruri kiya (nahi to `JsonWebTokenError` -> 401).
- Baaki sab reject: expired, wrong secret, wrong audience/issuer, tampered payload (ADMIN), `alg=none`, HS384/HS512 (algorithm pinned), future `nbf`, garbage.
- `sign`/`verify` ab sync hain (string/object return); callers `await` karte hain, to koi aur file nahi badli. `expiresIn` number = seconds.
  Switch ke baad auth flows aur token attacks dobara verify kiye (sab pass).

Result: 390/390 purane tests pass (koi naya test nahi), lint aur format clean.

### Phase 8 — Authorization, ownership aur browser sessions

**Goal:** authorization ko authentication se alag banana: roles customer/seller/admin, explicit permission aur ownership checks (seller sirf URL mein id badalkar doosre seller ka product/inventory na chhoo sake), admin-only seller approval aur product moderation, sensitive admin actions ka audit trail (bina secrets), aur ek documented **browser session path** (secure cookie + Redis store + CSRF protection) jo bearer-token auth se saaf alag ho. Naye tests nahi likhe (owner ka rule); evidence 121 manual checks + mutation checks se (`docs/modules/authorization-and-sessions.md`).

Design decisions:

- **Permission-based, default deny:** code kabhi `if (role === 'ADMIN')` nahi likhta; route `requirePermission('admin:seller:review')` maangta hai aur ek role->permissions table faisla karti hai.
- **Role database se, token se nahi:** har protected request par user DB se padha jaata hai (ek `_id` lookup), isliye role hata do ya user disable karo to turant asar, 15 min intezaar nahi.
- **Ownership server tay karta hai:** seller ki pehchan actor ke seller profile se, client ke bheje `sellerId` se kabhi nahi.
- **Do raaste, ek authorization:** bearer aur session alag authenticate karte hain, lekin dono `res.locals.auth` banate hain aur aage ka authorization code ek hi hai.
- **Redis sessions ke liye `redis` (node-redis) + `connect-redis`:** `connect-redis` v10 ka documented client yahi hai (ioredis nahi); BullMQ ke liye ioredis Phase 14 mein alag se.

Sequence:

**Step 1 — Libraries aur infra verify.** `express-session@1.19.0`, `connect-redis@10.0.0`, `redis@6.3.0`. `compose.yaml` mein `redis:8-alpine` (sirf `127.0.0.1`, disk par kuch save nahi), aur `npm run db:up` ab MongoDB aur Redis dono chalata hai. Ek probe se express-session ka asli behaviour dekha: cookie flags, anonymous request par cookie nahi, `regenerate` se naya session id (purana dead), forged cookie anonymous, aur **gotcha:** `Secure` cookie bina `trust proxy` ke plain HTTP request par chupchaap set nahi hoti (login "safal" dikhta par session nahi banti).

**Step 2 — Config.** `REDIS_URL` (optional; na ho to session routes mount nahi), `SESSION_SECRET` (>= 32 chars; `REDIS_URL` ke saath production mein required), `SESSION_IDLE_MINUTES` (30), `SESSION_ABSOLUTE_HOURS` (12), `TRUST_PROXY_HOPS` (0; `app.set('trust proxy', n)`).

**Step 3 — Redis module (`src/redis/redis.js`).** `createRedis({ url, logger })`: `disableOfflineQueue: true` (Redis down ho to command turant fail, request latki nahi), reconnect backoff 250ms..5s, `error` listener, `checkReady()` (PING). `server.js` ise background mein connect karta hai, readiness mein `redis` check judta hai, aur shutdown order ab: HTTP close -> Redis -> MongoDB.

**Step 4 — Authorization module (`src/modules/authz/`).**

- `permissions.js`: 9 permissions aur `ROLE_PERMISSIONS` (CUSTOMER: `seller:apply`, `seller:read:own`; SELLER: product/inventory `:own` permissions; ADMIN: `admin:seller:review`, `admin:product:moderate`, `admin:audit:read`). `can(role, permission)` default deny.
- `authorize.js`: `requirePermission(p)` user DB se padhta hai, `ACTIVE` zaruri, permission na ho to `403`, aur `res.locals.actor = { id, role }` set karta hai. Denial sirf log hota hai (audit mein nahi: koi bhi spam karke use bhar sakta hai).
- `ownership.js`: `requireApprovedSeller` (profile `APPROVED` na ho to `403 SELLER_NOT_APPROVED`) aur `requireOwnedProduct` (product nahi mila 404, kisi aur seller ka 403).

```js
router.post(
  '/products',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCT_CREATE),
  validate({ body }),
  controller.create,
);
```

**Step 5 — Seller aur product mutations (real endpoints).** `POST /sellers/apply`, `GET /sellers/me`; `POST /products` (DRAFT), `PATCH /products/:id`, `PUT /products/:id/stock`, `POST /products/:id/submit`. Ownership **do layers** mein: service check, aur update query ka filter `{ _id, sellerId: <actor ka profile>, status: <allowed> }`:

```js
Product.findOneAndUpdate({ _id: id, sellerId, status: { $in: allowedStatuses } }, { $set: set }, ...)
```

Owner sirf DRAFT/REJECTED product edit kar sakta hai (approved product edit karna moderation bypass hota). Product schema mein `moderationNote`, `moderatedAt`, `moderatedBy` jude.

**Step 6 — Admin module.** Seller transitions explicit table se (`approve` PENDING->APPROVED, `reject` PENDING->REJECTED, `suspend` APPROVED->SUSPENDED, `reinstate` SUSPENDED->APPROVED), conditional update se (galat status 409, do admins ek saath to ek hi jeetta). Approve par user ka role `SELLER` usi transaction mein. Product moderation: `PENDING_REVIEW` -> `ACTIVE` ya `REJECTED` (reason zaruri); suspended seller ka product approve nahi hota. `GET /admin/audit-events` filters ke saath (Phase 5 ka list toolkit).

**Step 7 — Audit.** Har seller/product/admin action usi transaction mein `audit_events` mein: actor, entity, `{ from, to, reason }` (ya sirf badle hue field ke naam). Secret-jaisi keys audit repository reject karta hai; tokens/cookies/CSRF kabhi nahi pahunchte.

**Step 8 — Auth service refactor.** `login` ka credentials wala hissa `checkCredentials` mein nikala (throttle -> password -> status), aur `verifyCredentials` ke roop mein expose kiya, taaki session login wahi rules use kare. `resetPassword` aur `logoutAll` ab browser sessions bhi revoke karte hain (`sessions.revokeAll`).

**Step 9 — Session module (`src/modules/session/`).**

- `session.middleware.js`: `express-session` + `RedisStore` (`prefix: 'sess:'`, `ttl` = idle timeout), `saveUninitialized: false` (anonymous ko cookie nahi), `rolling: true`. Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` + naam `__Host-sid` production mein.
- `session.controller.js`: login (origin check -> `verifyCredentials` -> **`regenerate`** (session fixation se bachav) -> `userId`, `createdAt`, `csrfToken` store -> registry mein id), logout, logout-all, me, csrf. Production mein "Secure cookie par request HTTPS nahi dikhi" par saaf `500` + log (chupchaap fail nahi).
- `session-registry.js`: Redis set `sess_user:<userId>` jisse ek user ki saari sessions ek saath delete ho sakti hain (password reset, logout-all).
- `csrf.js`: unsafe methods par (1) `SameSite=Lax`, (2) **synchronizer token** `X-CSRF-Token` (session se bandha, constant-time compare), (3) **Origin check** (`APP_BASE_URL` ka origin ya request ka apna; `Sec-Fetch-Site: cross-site` reject). Login par sirf origin check (token abhi hai hi nahi).
- Absolute timeout: `createdAt` se 12 ghante baad session band, chahe active ho.

**Step 10 — Bearer aur session alag, authorization ek (`authenticate-either.js`).**

```js
if (req.get('authorization') || !session) return bearer(req, res, next); // header ho to SIRF bearer, cookie dekhi hi nahi
return session(req, res, next); // warna cookie + CSRF
```

Isse invalid bearer + valid cookie `401` deta hai (cookie par fallback nahi), aur bearer request ko CSRF token nahi chahiye.

**Step 11 — Wiring (`api.routes.js`, `app.js`, `server.js`).** Database ho to auth + authz + sellers/products/admin real; Redis bhi ho to `/session` bhi; warna wo hisse khaali routers (404). `createApp` ab `redis` leta hai aur `trust proxy` set karta hai.

**Step 12 — Manual verification (121 checks, sab pass; poori list doc mein).** Asli server + MongoDB + Redis par:

- **Unauthenticated:** 7 endpoints `401` + `WWW-Authenticate`.
- **Forbidden:** customer/seller/admin ko galat jagah `403`; pending seller `403 SELLER_NOT_APPROVED`.
- **Correct owner:** create/patch/stock/submit sab chalte hain; client ka `sellerId`/`status`/`sku` body mein `400`.
- **Wrong owner:** seller2 seller1 ke product par (patch, stock, submit, sirf URL ki id badal kar) `403`, aur document byte-for-byte same.
- **Admin:** approve/reject/suspend/reinstate, invalid transitions `409`, role promotion, moderation, 12 audit action types (actor/from/to/reason), audit mein koi secret nahi.
- **Turant asar:** DB mein seller ka role badalne ya admin disable karne par **wahi access token** agli request par refuse.
- **Sessions/CSRF:** cookie flags, fixation, forged cookie `401`, bina/galat/doosre session ke token ya foreign Origin par `403` aur kuch create nahi hota; sahi token par `201`; logout/logout-all/password reset/disable se session khatam; idle aur absolute timeout; 5 failed logins ke baad `429`.
- **Failure modes:** Redis band hone par cookie requests `503` + `Retry-After` jabki bearer aur public routes `200`, readiness `503`, wapas aane par recover; production mein `__Host-sid; Secure` proxy ke peeche; `SESSION_SECRET` ke bina production exit 1.
  **Mutation checks:** service ka ownership check hataya -> product phir bhi safe (`409`, query filter ne roka); dono layers hataye -> product hijack ho gaya; CSRF check hataya -> bina token ka cookie POST `201`; `can()` ko hamesha true -> seller ne admin audit padh liya. (Pehli baar M1 ka result bekar tha kyunki seller2 ka password session test mein reset ho chuka tha aur login 401 de raha tha, to "safe" khali sach tha. Seller2 ke naye password se dobara chalaya tab asli natija mila. Seekh: mutation test mein pehle confirm karo ki attacker login sach mein safal hai.)

**Ek bug mila aur theek hua:** Redis band hone par cookie requests `500` de rahi thi. Wajah: node-redis ke errors ka `err.name` sirf `'Error'` hota hai (class ka naam `constructor.name` mein), isliye 503 mapping unhe pehchan nahi pa rahi thi. `map-database-error.js` ab constructor ka naam bhi dekhta hai.

**Step 13 — Docs aur matrix.** `docs/modules/authorization-and-sessions.md` (roles/permissions, request pipeline, ownership aur status codes, lifecycle, endpoints, audit, cookie settings, Redis store, CSRF, bearer vs session, failure handling, manual verification, trade-offs). Matrix section 8 ke 10 rows `verified`. Purane docs (`authentication.md`, `routing-and-http.md`) mein stale "Phase 8" wale hisse theek kiye.

Result: 390/390 purane tests pass (koi naya test nahi), lint aur format clean, `npm audit --omit=dev` 0.

## 8. Current project structure

```
.
├── CLAUDE.md                     # persistent working rules
├── README.md                     # ye file
├── package.json / package-lock.json
├── eslint.config.js  jest.config.js  .prettierrc.json  .prettierignore
├── .env.example  .gitignore
├── src/
│   ├── app.js                    # createApp(): Express app factory
│   ├── server.js                 # startServer(), main(), signals
│   ├── config/env.js             # loadConfig(), ConfigError
│   ├── logging/logger.js         # createLogger(): Pino + redaction
│   ├── middleware/               # request-id, request-logger, conditional (when/unless), security-headers
│   ├── health/
│   │   ├── readiness.js          # createReadiness()
│   │   └── health.routes.js      # /health/live, /health/ready
│   ├── routes/api.routes.js      # /api/v1: parsers + module mounts (+ examples, non-prod)
│   ├── redis/redis.js           # createRedis(): node-redis client (browser sessions)
│   ├── modules/                  # auth (Phase 7); authz, session, sellers, products, admin (Phase 8); users, cart, orders abhi khaali-par-mounted
│   ├── db/                       # database.js, migrations.js, seed.js, serialize.js, map-database-error.js, models/, repositories/
│   ├── email/                    # test-mailer.js (memory mein emails), templates.js
│   ├── errors/                   # app-errors.js (hierarchy), to-app-error.js (classification), zod-details.js
│   ├── http/                     # error-handler.js, not-found.js, route-guards.js, validate.js, schemas.js
│   │   └── query/                # fields.js, pagination.js, sorting.js, list-query.js
│   └── examples/                 # teaching only, /api/v1/examples/*, non-prod: http-examples, middleware-examples, error-examples, validation-examples
├── migrations/                   # 0001_collections_validators_and_indexes.js (versioned, Mongo)
├── scripts/db.js                 # CLI: migrate | status | seed | reset
├── compose.yaml                  # local MongoDB single-node replica set + Redis
├── public/example.txt            # served at /static
├── tests/
│   ├── helpers/log-capture.js    # Pino ko memory mein capture (tests)
│   ├── unit/        config, readiness, middleware-units, errors, query-helpers, validate-middleware .test.js
│   └── integration/ health, server, routing, static, middleware, error-handling, validation .test.js
└── docs/
    ├── architecture/ (overview.md, phases.md, decisions/)
    ├── coverage/EXPRESS_CONCEPT_MATRIX.md
    ├── modules/ application-foundation.md, routing-and-http.md, middleware.md, error-handling.md, validation-and-api-contracts.md, database-and-persistence.md, authentication.md, authorization-and-sessions.md
    └── runbooks/ security/ testing/   # abhi sirf index
```

Planned: `src/worker.js`, `labs/`, `deploy/`. Layout Phase 2+ mein evolve ho sakta hai.

## 9. Run kaise karein (setup, scripts)

Prerequisites: Node.js >= 24, npm, Docker (local MongoDB aur Redis ke liye). Redis sirf browser sessions ke liye; na ho to bearer auth chalta hai.

```bash
npm ci
cp .env.example .env    # MONGODB_URI, DB_POOL_MAX isme hain
npm run db:up           # Docker mein MongoDB (replica set) + Redis
npm run db:migrate && npm run db:seed
npm run dev             # http://127.0.0.1:3000/health/ready
```

| Script                             | Kaam                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                      | `node --watch` + `.env` auto-load                              |
| `npm start`                        | Real environment variables ke saath run                        |
| `npm test`                         | Jest + Supertest (native ESM, experimental warning normal hai) |
| `npm run lint`                     | ESLint                                                         |
| `npm run format` / `format:check`  | Prettier write / check                                         |
| `npm run db:up` / `db:down`        | Local MongoDB + Redis containers start / stop                  |
| `npm run db:migrate` / `db:status` | Migrations apply / status                                      |
| `npm run db:seed` / `db:reset`     | Sample data / poora DB drop + migrate + seed (dev only)        |

Environment variables: `NODE_ENV` (`development\|test\|production`, default `development`), `HOST` (default `127.0.0.1`), `PORT` (default `3000`, `0` = ephemeral), `LOG_LEVEL` (`trace|debug|info|warn|error|fatal|silent`; default `info`, tests mein `silent`), `MONGODB_URI` (`mongodb://` ya `mongodb+srv://`; **production mein required**, dev/test mein optional: na ho to DB ke bina chalta hai aur warning), `DB_POOL_MAX` (default 10).

**Phase 8 env vars (sab optional):** `REDIS_URL` (`redis://` ya `rediss://`; set ho tabhi `/api/v1/session/*` mount hota hai), `SESSION_SECRET` (>= 32 chars; `REDIS_URL` ke saath production mein required; dev mein na ho to har run par random), `SESSION_IDLE_MINUTES` (default 30, 5-1440), `SESSION_ABSOLUTE_HOURS` (default 12, 1-168), `TRUST_PROXY_HOPS` (default 0, max 5: production mein TLS proxy ke peeche 1 rakho, warna Secure cookie wala session login jaan-boojh ke fail hota hai).

Endpoints abhi:

| Endpoint                                                      | Response                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                                            | `200 {"status":"live"}`                                                                                                                                                                                                                                                                                                                                              |
| `GET /health/ready`                                           | `200 {"status":"ready","checks":{"db":"up"}}` (DB configured ho to), ya `503` (`not_ready` / `shutting_down`)                                                                                                                                                                                                                                                        |
| `GET /static/example.txt`                                     | `200 text/plain` (`express.static`, `public/`)                                                                                                                                                                                                                                                                                                                       |
| `/api/v1/auth/*`                                              | **Auth** (database ho tab): `signup`, `login`, `refresh`, `logout`, `logout-all`, `me`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`. Database nahi to 404                                                                                                                                                                             |
| `/api/v1/sellers/*`, `/api/v1/products/*`, `/api/v1/admin/*`  | **Phase 8** (database ho tab): `POST /sellers/apply`, `GET /sellers/me`; `POST /products`, `PATCH /products/:id`, `PUT /products/:id/stock`, `POST /products/:id/submit` (approved seller + owner); `/admin/sellers` (+ approve/reject/suspend/reinstate), `/admin/products` (+ approve/reject), `GET /admin/audit-events` (admin only). Bearer token ya cookie+CSRF |
| `/api/v1/session/*`                                           | **Phase 8** (database + `REDIS_URL` ho tab): `POST login`, `POST logout`, `POST logout-all`, `GET me`, `GET csrf`. Cookie `HttpOnly` + `SameSite=Lax` (production: `Secure` + `__Host-sid`); state-changing requests par `X-CSRF-Token` zaruri                                                                                                                       |
| `/api/v1/{users,cart,orders}/*`                               | `404` abhi (modules khaali)                                                                                                                                                                                                                                                                                                                                          |
| `/api/v1/examples/mailbox`                                    | Dev-only: test mailer ki emails (tokens ke saath); production mein 404                                                                                                                                                                                                                                                                                               |
| `/api/v1/examples/*`                                          | Teaching endpoints (non-production only): `ping`, `echo/:value`, `echo/json`, `echo/form`, `old-notes`, `notes`, `notes/:id`, `notes/:noteId/comments`                                                                                                                                                                                                               |
| `/api/v1/examples/middleware/*`                               | Middleware demos (non-production only): `chain`, `conditional`, `guarded`, `fail`, `app-config`, `stats`                                                                                                                                                                                                                                                             |
| `/api/v1/examples/validation/demo-products` (+ `/:productId`) | Validation demo (non-production only): `GET` list (page, limit, sort, filters, q), `GET` by ObjectId, `POST` create. In-memory sample data                                                                                                                                                                                                                           |
| `/api/v1/examples/errors/*`                                   | Error demos (non-production only): `raise/:kind`, `sync-throw`, `async-reject`, `next-err`, `throw-string`, `service/*`, `after-headers`                                                                                                                                                                                                                             |
| anything else                                                 | `404 {"error":{"code":"NOT_FOUND","message":"Resource not found"}}`                                                                                                                                                                                                                                                                                                  |

### API Reference (har route ki list)

Ye list **code ke route files se nikaali gayi hai** (`src/**/*.routes.js`), isliye har route yahan hai. Sab `/api/v1` ke neeche hain (health aur static ko chhodkar). Naya route add karo to is section ko bhi update karo.

**Access column padhne ka tareeka:**

- **Public**: login ki zarurat nahi.
- **Bearer**: `Authorization: Bearer <accessToken>` (Phase 7 token).
- **Bearer ya Cookie+CSRF** (`authenticateEither`): `Authorization` header ho to **sirf bearer** chalta hai; header na ho to Redis session cookie chalti hai, aur tab POST/PUT/PATCH/DELETE par `X-CSRF-Token` zaruri hai. Dono ek request mein mix nahi hote.
- **Cookie session**: sirf browser session (`/session/*`), Redis zaruri.
- Role/permission wale routes mein role **har request par DB se** padha jata hai. Galat role = `403`, token/cookie nahi = `401`.

Sab error responses ek hi shape mein: `{"error":{"code","message","details?"}}`. Common errors har route par: `400` (validation, unknown field bhi), `401`, `403`, `404`, `429` (rate limit), `503` (DB/Redis down).

#### Health aur static (`/api/v1` prefix ke bina)

| Method | Path                  | Access | Kaam                                        | Success                                        |
| ------ | --------------------- | ------ | ------------------------------------------- | ---------------------------------------------- |
| GET    | `/health/live`        | Public | Process zinda hai (dependency check nahi)   | `200 {"status":"live"}`                        |
| GET    | `/health/ready`       | Public | Dependencies (db, redis) ready hain?        | `200 ready` ya `503 not_ready / shutting_down` |
| GET    | `/static/example.txt` | Public | `public/` se static file (`express.static`) | `200 text/plain`                               |

#### Auth: `/api/v1/auth` (bearer-token path, database chahiye)

| Method | Path                        | Access | Body                                         | Success                      | Khaas errors / notes                                                                    |
| ------ | --------------------------- | ------ | -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/auth/signup`              | Public | `email`, `name` (1-100), `password` (12-128) | `202` generic message        | Hamesha ek jaisa 202 (email registered ho ya nahi): anti-enumeration                    |
| POST   | `/auth/login`               | Public | `email`, `password`                          | `200` access + refresh token | `401` ek jaisa (galat email/password), `403 EMAIL_NOT_VERIFIED`, `429` 5 galat par lock |
| POST   | `/auth/refresh`             | Public | `refreshToken`                               | `200` naye tokens (rotation) | `401` (purana/reuse hua to poori family revoke)                                         |
| POST   | `/auth/logout`              | Public | `refreshToken`                               | `204`                        | Us refresh token ki family revoke                                                       |
| POST   | `/auth/logout-all`          | Bearer | -                                            | `204`                        | Saare refresh tokens + saari browser sessions khatam                                    |
| GET    | `/auth/me`                  | Bearer | -                                            | `200 {user}`                 | Disabled user ko `401`                                                                  |
| POST   | `/auth/verify-email`        | Public | `token`                                      | `200`                        | Token single-use; galat/expired `400`                                                   |
| POST   | `/auth/resend-verification` | Public | `email`                                      | `202` generic                | Hamesha 202                                                                             |
| POST   | `/auth/forgot-password`     | Public | `email`                                      | `202` generic                | Hamesha 202; dev mein link mailbox mein                                                 |
| POST   | `/auth/reset-password`      | Public | `token`, `newPassword` (12-128)              | `200`                        | Saare refresh tokens + sessions revoke                                                  |

#### Browser session: `/api/v1/session` (Redis + database chahiye, warna `404`)

| Method | Path                  | Access                | Body                | Success                                | Khaas errors / notes                                                                                       |
| ------ | --------------------- | --------------------- | ------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/session/login`      | Public (Origin check) | `email`, `password` | `200` user + `csrfToken`, `Set-Cookie` | Cross-site/galat `Origin` = `403 CSRF_ORIGIN_INVALID`; session id login par regenerate hoti hai (fixation) |
| POST   | `/session/logout`     | Cookie session + CSRF | -                   | `204`                                  | Cookie clear + Redis session delete                                                                        |
| POST   | `/session/logout-all` | Cookie session + CSRF | -                   | `204`                                  | User ki saari sessions revoke                                                                              |
| GET    | `/session/me`         | Cookie session        | -                   | `200 {user}`                           | Idle/absolute timeout ke baad `401`                                                                        |
| GET    | `/session/csrf`       | Cookie session        | -                   | `200 {csrfToken, csrfHeader}`          | Is token ko state-changing request par `X-CSRF-Token` mein bhejo                                           |

Koi bhi cookie wali write request bina sahi token ke = `403 CSRF_TOKEN_INVALID`. Redis down = `503` (bearer routes chalte rehte hain).

#### Sellers: `/api/v1/sellers`

| Method | Path             | Access (Bearer ya Cookie+CSRF) | Permission                           | Body                                              | Success                                                   | Khaas errors / notes                     |
| ------ | ---------------- | ------------------------------ | ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| POST   | `/sellers/apply` | Login zaruri                   | `seller:apply` (customer)            | `storeName` (2-100), `slug` (>=3), `description?` | `201` + `Location: /api/v1/sellers/me`, profile `PENDING` | `409` (pehle se apply kiya / slug taken) |
| GET    | `/sellers/me`    | Login zaruri                   | `seller:read:own` (customer, seller) | -                                                 | `200` apna seller profile                                 | `404` (apply nahi kiya)                  |

#### Products (seller side): `/api/v1/products`

Sab routes: login + `PRODUCT_*`/`INVENTORY_*` permission (role **seller**) + **approved seller** (`403 SELLER_NOT_APPROVED`) + **ownership** (apna product: product nahi mila = `404`, doosre seller ka = `403 "You do not own this product"` + server log mein warning; DB query filter bhi owner check karta hai, to race mein bhi doosre ka data nahi badalta).

| Method | Path                          | Permission             | Body / Params                                                                                                     | Success                            | Khaas errors / notes                                                                |
| ------ | ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/products`                   | `product:create`       | `sku` (A-Z0-9-, 3-40), `name`, `description?`, `category` (slug), `priceCents`, `currency` (INR/USD/EUR), `stock` | `201` + `Location`, status `DRAFT` | `409` duplicate SKU (seller ke andar), `400` agar category slug exist nahi karta    |
| PATCH  | `/products/:productId`        | `product:update:own`   | `name?`, `description?`, `priceCents?` (kam se kam ek)                                                            | `200`, status wapas `DRAFT`        | Sirf `DRAFT`/`REJECTED` product edit hota hai, warna `409` (moderation bypass nahi) |
| PUT    | `/products/:productId/stock`  | `inventory:update:own` | `onHand` (0-1,000,000)                                                                                            | `200`                              | `409` jab `onHand` reserved quantity se kam ho ya product archived ho               |
| POST   | `/products/:productId/submit` | `product:submit:own`   | - (params only)                                                                                                   | `200`, status `PENDING_REVIEW`     | `409` agar `DRAFT`/`REJECTED` nahi                                                  |

`:productId` 24-hex ObjectId hona chahiye, warna `400`. Public product listing/search abhi nahi bani (Phase 9).

#### Admin: `/api/v1/admin` (role **admin** only; customer/seller ko `403`)

Sab POST routes: Bearer ya Cookie+CSRF, JSON content-type, **body zaruri** (`{}` bhi chalega jahan field optional ho; body bilkul na ho to `415`). Har successful action ek **audit event** likhta hai (secret ke bina). Galat state par `409` (e.g. `PENDING` na ho to approve nahi), id nahi mili to `404`.

| Method | Path                                 | Permission               | Body / Query                                                                                     | Transition / Success                                                               |
| ------ | ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| GET    | `/admin/sellers`                     | `admin:seller:review`    | query: `status` (PENDING/APPROVED/REJECTED/SUSPENDED), page, limit, sort                         | `200` paginated list                                                               |
| POST   | `/admin/sellers/:sellerId/approve`   | `admin:seller:review`    | `reason?` (3-500)                                                                                | `PENDING -> APPROVED`; user ka role `SELLER` ban jata hai; event `seller.approved` |
| POST   | `/admin/sellers/:sellerId/reject`    | `admin:seller:review`    | `reason` (3-500, zaruri)                                                                         | `PENDING -> REJECTED`; event `seller.rejected`                                     |
| POST   | `/admin/sellers/:sellerId/suspend`   | `admin:seller:review`    | `reason` (zaruri)                                                                                | `APPROVED -> SUSPENDED`; event `seller.suspended`                                  |
| POST   | `/admin/sellers/:sellerId/reinstate` | `admin:seller:review`    | `reason?`                                                                                        | `SUSPENDED -> APPROVED`; event `seller.reinstated`                                 |
| GET    | `/admin/products`                    | `admin:product:moderate` | query: `status` (product status), page, limit, sort (`createdAt`, `price`)                       | `200` paginated list                                                               |
| POST   | `/admin/products/:productId/approve` | `admin:product:moderate` | `reason?`                                                                                        | `PENDING_REVIEW -> ACTIVE`; event `product.approved`                               |
| POST   | `/admin/products/:productId/reject`  | `admin:product:moderate` | `reason` (zaruri)                                                                                | `PENDING_REVIEW -> REJECTED`; event `product.rejected`                             |
| GET    | `/admin/audit-events`                | `admin:audit:read`       | query: `entityType`, `entityId`, `actorId`, `action` (e.g. `seller.approved`), page, limit, sort | `200` paginated audit list                                                         |

Seller `approve` hone par `users.role` ka `CUSTOMER -> SELLER` badalna aur status change ek hi transaction mein hota hai.

#### Abhi khaali (mounted, koi endpoint nahi)

`/api/v1/users/*`, `/api/v1/cart/*`, `/api/v1/orders/*`: sab `404 NOT_FOUND`. Ye Phase 9-10 mein bharenge. Koi bhi unknown path `404 {"error":{"code":"NOT_FOUND"}}`.

#### Teaching examples: `/api/v1/examples/*` (sirf `NODE_ENV != production`, DB nahi chahiye; data in-memory)

| Group       | Routes                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP basics | `GET /examples/ping`, `GET /examples/echo/:value`, `POST /examples/echo/json` (JSON only), `POST /examples/echo/form` (urlencoded only), `GET /examples/old-notes` (301 -> notes)                           |
| Notes       | `GET`/`POST /examples/notes`, `GET /examples/notes/latest`, `GET`/`PUT`/`DELETE /examples/notes/:id`, `GET`/`POST /examples/notes/:noteId/comments` (id positive integer, warna `400`; baaki methods `405`) |
| Middleware  | `GET /examples/middleware/{chain, conditional, guarded, fail, app-config, stats}`                                                                                                                           |
| Validation  | `GET /examples/validation/demo-products` (page, limit, sort, filters, q), `GET /examples/validation/demo-products/:productId`, `POST /examples/validation/demo-products`                                    |
| Errors      | `GET /examples/errors/{raise/:kind, sync-throw, async-reject, next-err, throw-string, service/reserve/:sku, service/load, after-headers}`                                                                   |
| Mailbox     | `GET /examples/mailbox?to=<email>` (test mailer ke emails, tokens ke saath), `DELETE /examples/mailbox` (saaf karo)                                                                                         |

## 10. Verification results (ab tak)

Phase 8 ke end par (main) actual run hue commands (pichhle phases ke checks bhi included):

| Command                                                       | Result                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                    | 13 suites, 390 tests passed                                    |
| `npm run lint`                                                | clean                                                          |
| `npm run format:check`                                        | clean                                                          |
| `node src/server.js` + curl (`/health/live`, `/health/ready`) | dono 200; SIGTERM par exit                                     |
| `npm run dev` + temp `.env`                                   | `.env` load hua, `/health/ready` 200                           |
| `npm audit --omit=dev`                                        | 0 vulnerabilities                                              |
| `npm audit`                                                   | dev-only (Jest chain) moderate advisories, fix apply nahi kiya |

Phase 5 extras (main): paanch mutation checks (sort regex hataya -> 27 fail; product body strict -> object -> 8 fail; `validate()` hataya -> ~100 fail; `coerce.boolean` -> 11 fail; JSON content-type guard hataya -> 3 fail); curl smoke (valid list, 400 details). OpenAPI/Swagger ki verification (spec validator, asli Chrome mein Swagger UI) branch `feature/openapi-swagger` par hui hai.

Phase 4 extras: chaar mutation checks (`headersSent` guard hataya -> 2 fail; 500 body mein asli message -> 11 fail; error handler unmount -> 50 fail; unexpected error `warn` par -> 7 fail; restore par 183/183); real server smoke (dev: generic 500s, 409, 429, truncated `after-headers`; production: 404/400 safe, logs mein `"stack"` 0).

Phase 3 extras: teen mutation checks (requestId logger ke baad -> 3 fail; Helmet `/api/v1` ke baad -> 5 fail; guard se `return` hataya -> 1 fail; restore par 123/123); real server smoke (response headers, request-ID reuse, JSON log lines, health probe unlogged, 4 secrets ka logs mein 0 match).

Phase 2 extras: ordering test ka mutation check (order badalne par 1 test fail, restore par pass); real server par curl smoke (201+Location, static 200, 301, 405, module 404).

Comments pass (alag se, Phase ke bahar): 33 JS files mein sirf comments jode gaye; AST compare (comments ke bina HEAD vs working tree) mein 0 code changes; lint, format aur 183 tests pass.

Phase 8 extras: asli server + MongoDB + Redis par **121 manual checks**: 71 authorization (401 / 403 / owner / wrong-owner / admin / audit / role badalte hi turant asar) aur 50 session (cookie flags, session fixation, CSRF ke variants, bearer-vs-session separation, logout / logout-all / password-reset / disable, idle + absolute timeout, rate limit). Mutation checks: ownership comparison hataya to query filter ne bachaya (409); dono layers hataye to product hijack ho gaya (isliye dono rakhe hain); CSRF check hataya to attack chala; `can()` hamesha true karne par privilege escalation. Redis band karke: cookie routes `503` + `Retry-After`, bearer aur public routes theek, `/health/ready` 503, Redis wapas aate hi recovery. Production cookie `__Host-sid; Path=/; HttpOnly; Secure; SameSite=Lax`; `TRUST_PROXY_HOPS` ke bina Secure login generic 500 + log mein wajah; `SESSION_SECRET` ke bina production exit 1; `REDIS_URL` ke bina `/session/*` 404; logs/audit mein koi secret nahi. Koi naya test nahi likha (owner decision): 390 purane tests pass.

Phase 7 extras: asli server + MongoDB par 60 auth checks (enumeration, token attacks, refresh reuse, reset, disabled/unverified, rate limits, timing 23.3 vs 22.2 ms, DB/logs mein koi secret nahi); startup scenarios (secret ke bina dev warning, production mein secret/https ke bina exit 1, database ke bina /auth 404); koi naya automated test nahi.

Phase 6 extras (MongoDB 8.3.13 replica set, Docker): `db:migrate` ek baar apply + dobara no-op; `db:seed` do baar = same counts; 19 constraint checks (validators `121`, duplicates `11000`, partial indexes); repositories/transactions/error-mapping probe (60+ checks, sab pass; rollback, retry, atomic reservation, 503 mapping); server readiness up/down/recover, DB band hote hue boot, SIGTERM; config errors (production mein URI ke bina exit 1). Koi naya automated test nahi (owner ka rule): evidence `docs/modules/database-and-persistence.md` mein.

Environment-dependent checks: MongoDB (Docker) ab zaruri hai DB features verify karne ke liye; Redis ab Phase 8 ke session checks ke liye zaruri hai (`npm run db:up` dono chalata hai).

## 11. Roadmap (Phase 0–25)

| #   | Phase                                                                             | Status  |
| --- | --------------------------------------------------------------------------------- | ------- |
| 0   | Guardrails                                                                        | done    |
| 1   | Foundation (app/server, config, health)                                           | done    |
| 2   | HTTP & routing (`/api/v1`, params/query/body, static, 404)                        | done    |
| 3   | Middleware pipeline, request IDs, `res.locals`, `req.app`                         | done    |
| 4   | Error handling (hierarchy, `headersSent`)                                         | done    |
| 5   | Validation, pagination (OpenAPI + Swagger: branch par, baad mein merge)           | done    |
| 6   | MongoDB + Mongoose: models, validators, migrations, repositories, transactions    | done    |
| 7   | Authentication (hashing, refresh rotation, verify/reset)                          | done    |
| 8   | Authorization, ownership, sessions, CSRF                                          | done    |
| 9   | Catalog, inventory concurrency, reviews, wishlists                                | next    |
| 10  | Cart, checkout, idempotency, order state machine                                  | planned |
| 11  | Security hardening + threat model                                                 | planned |
| 12  | Uploads (Multer), storage adapters, CSV streaming                                 | planned |
| 13  | Redis caching + benchmarks                                                        | planned |
| 14  | BullMQ worker, retries, outbox                                                    | planned |
| 15  | Webhooks (signature, idempotency)                                                 | planned |
| 16  | OAuth2 / OIDC (PKCE, state, nonce)                                                | planned |
| 17  | Socket.IO realtime + notifications                                                | planned |
| 18  | Test strategy, coverage, CI                                                       | planned |
| 19  | Observability + graceful shutdown                                                 | planned |
| 20  | Docker, Nginx, worker_threads, scaling                                            | planned |
| 21  | Express concept lab (+ Express 4 compat lab)                                      | planned |
| 22  | MongoDB features lab (aggregation, TTL/text indexes, change streams, $jsonSchema) | planned |
| 23  | Docs audit                                                                        | planned |
| 24  | Concept coverage audit                                                            | planned |
| 25  | Release gate                                                                      | planned |

Detail: [docs/architecture/phases.md](docs/architecture/phases.md).

## 12. Concept coverage matrix ka status

[docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md): 234 concepts. Abhi sections 1-4 (44), section 5 (8 of 10: OpenAPI aur Swagger branch par), section 6 (12 of 13: "Test database isolation" `planned`), section 7 (Authentication, 12) aur section 8 (Authorization aur sessions, 10) `verified`: kul **86 verified**. Baaki `planned`. Har phase ke baad sirf evidence-backed rows update hote hain.

## 13. Is project ko recipe ki tarah reuse karna

Naye Express 5 project ke liye Phase 0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 ka reusable sequence:

1. Pehle `CLAUDE.md` + docs skeleton + coverage matrix banao (rules aur tracking pehle, code baad mein).
2. `npm init`, `"type": "module"`, `engines` set karo; dependencies `--save-exact`; lockfile commit.
3. Tooling: Prettier, ESLint flat config (prettier-config last), Jest native ESM (`--experimental-vm-modules`, `transform: {}`).
4. Config ko Zod schema se validate karo, `loadConfig(env)` pure function rakho; fail hone par saare errors print karke `exit(1)`.
5. `createApp(deps)` factory (no side effects) aur alag `server.js` (listen, signals). `server.js` mein "direct execution" guard lagao taaki tests import kar sakein.
6. Health: `live` (dependency-free) aur `ready` (named checks + timeout + shutdown flag) alag rakho; DB/Redis aate hi unke checks register karo.
7. Tests: unit (config, readiness), integration (Supertest on app, real-port server test, invalid-config subprocess test).
8. Manual smoke (curl + SIGTERM + dev script), `npm audit --omit=dev`, phir docs/README/matrix update.
9. Routing: har feature ka `src/modules/<name>/<name>.routes.js`, ek `api.routes.js` jo sirf prefixes aur parsers jaanta ho; parsers sirf API router mein, explicit limit ke saath.
10. Mount order fix rakho: `health -> static -> /api/v1 -> 404 -> error handler`. Literal routes parameterised se pehle; `route().all(methodNotAllowed)` se 405.
11. Express 5 gotchas: inline regex path params nahi; query parser "simple"; `req.body` unparsed content type par undefined.
12. Test ke baad ek mutation check karo (ordering ya guard hata ke dekho test fail hota hai ya nahi); phir real server par curl smoke.
13. Middleware order: `requestId -> requestLogger -> helmet -> health -> static -> /api (parsers, modules) -> 404 -> error handler`. Logger ko injectable (`stream`) rakho taaki tests logs capture kar sakein.
14. Logs mein sirf metadata: method, status, duration, route _pattern_, request ID. Query/headers/cookies/bodies/path-param values nahi; redaction sirf safety net.
15. Production middleware (`src/middleware/`) aur teaching demos (`src/examples/`, non-prod) alag folders mein.
16. Errors: `AppError` hierarchy (status + stable `code` + `isOperational`), `toAppError()` jo koi bhi thrown value classify kare, aur sabse last ek `errorHandler`. Code sirf throw/`next(err)` kare; response koi aur jagah na bane.
17. Error response mein `NODE_ENV` branch mat rakho; client ko stack/cause/raw message kabhi nahi. Diagnostics logs mein: unexpected = `error` level + original stack, operational = request line mein `errorCode`.
18. Express 5 mein async handlers par wrapper mat lagao. `res.headersSent` check karke default handler ko delegate karo.
19. Validation: har request schema `z.strictObject`; `validate({params, query, body})` handler se pehle; handler sirf `res.locals.valid` padhe. Query ke liye `z.coerce` nahi, strict string-first helpers.
20. List endpoints: ek `buildListQuerySchema` (page/limit offset, sort allowlist **map**, filters allowlist, search) jo normalized query de; DB column kabhi user string se nahi.
21. MongoDB: local mein single-node **replica set** (transactions ke liye), `autoIndex`/`autoCreate` off, collections/indexes/validators migrations se. Mongoose globals: `transactionAsyncLocalStorage`, `runValidators`, `strictQuery`.
22. FK/CHECK nahi hote: unique + partial/TTL indexes, **server-side collection validators** (`$inc` par bhi lagte hain), atomic conditional updates, aur transactions se integrity banao; "database vs application enforced" table likho.
23. Embed vs reference: bounded aur saath padhe jaane wala child embed (cart/order items, stock), shared/unbounded alag collection. Order items snapshot.
24. Server DB ke bina bhi start ho (background connect retry), readiness `db` check se 503/200 de, shutdown mein DB sabse aakhir mein band. Search text regex-escape karo.
25. Auth: passwords Argon2id, access token chhota stateless JWT (algorithm pinned), refresh/verify/reset random tokens sirf SHA-256 hash ke roop mein; refresh rotation + reuse detection; single-use atomic `consume`; sab failures generic; email transaction ke baad.
26. Anti-enumeration: signup/forgot/resend ek jaisa 202, login ek jaisa 401 + dummy hash timing, status sirf sahi password ke baad. Rate limit ko interface (hook) ke peeche rakho (in-memory abhi, Redis baad mein).
27. Authorization authentication se alag: permission map (default deny), role har request par DB se (role badalte hi asar), `requirePermission`; sirf role kaafi nahi: ownership check **service mein bhi aur DB query filter mein bhi** (defense in depth); wrong-owner par 403 (product na ho to 404), policy ek jagah (`ownership.js`).
28. Admin kaam state machine se (seller: approve/reject/suspend/reinstate; product moderation) aur har sensitive action audit event: kaun, kya, kis par, kab, bina secret.
29. Browser path alag: Redis-backed `express-session`; cookie `HttpOnly` + `SameSite=Lax` (+ `Secure`/`__Host-` production mein), login par `regenerate` (fixation), idle + absolute timeout, CSRF token + Origin check, bearer aur cookie ek hi request mein mix nahi (Authorization header ho to sirf bearer). Redis down = 503, data corruption nahi.
30. Safety pieces ko mutation se test karo aur hamesha assert karo ki mutation lagi aur attacker sach mein login kar sakta tha (warna "safe" result bekaar hai).

## 14. Known limitations / tradeoffs

- Graceful shutdown abhi minimal hai (server close + readiness 503). Request draining with deadline aur ordered dependency close Phase 19 mein.
- Validation errors 400 hain (422 nahi), `details` entries `{source?, path, message}`; purane teaching routes (notes, echo) abhi simple inline Zod use karte hain.
- **OpenAPI + Swagger UI `main` par nahi hain** (owner ka decision: abhi development par focus). Wo branch `feature/openapi-swagger` par pushed hain; merge steps Phase 5 ke Step 12 mein.
- **Foreign keys nahi hote**: kisi `userId`/`productId` ka sach mein exist karna application ka kaam hai (dangling reference possible); deletes soft/archive se (convention).
- Local MongoDB container mein auth band hai (sirf `127.0.0.1`); production mein authenticated cluster zaruri. Transactions ke liye replica set zaruri (plain `mongod` par nahi).
- Name search regex hai (index use nahi karta); text index / Atlas Search Phase 13 mein.
- Migrations ka runner chhota hai: lock nahi, ek hi jagah (deploy step) se chalao; `syncIndexes` purane indexes drop karta hai, aage ki migrations specific index operations se likho.
- DB tests ke liye strategy documented hai (separate database, cleanup) lekin koi test likhe nahi gaye. Evidence manual verification hai.
- Branch `feature/openapi-swagger` abhi UUID wale purane `main` par based hai; merge par ObjectId changes conflict de sakte hain.
- **Auth:** limiter in-memory (per instance, restart par reset); access token revoke nahi hota (15 min tak chalta hai, disabled user ko `/me` aur refresh rokte hain); refresh body mein hai (browser ke liye alag cookie session path Phase 8 mein bana, bearer se bilkul alag); koi MFA/breached-password check/change-password/OAuth nahi (OIDC Phase 16); `req.ip` ke liye `TRUST_PROXY_HOPS` sahi set karna zaruri hai (poora proxy/CORS hardening Phase 11).
- **Authorization/Sessions:** permission map code mein hai (DB-managed roles nahi); har protected request par user DB se padha jata hai (ek extra read, badle mein role/disable turant lagta hai); session registry per user `sess_user:<id>` Redis mein hai (Redis flush = sab sessions khatam); CSRF/Origin check sirf cookie path par; Redis single instance (HA/cluster nahi); product moderation abhi simple (approve/reject + reason), review queue/notifications baad ke phases mein; audit events ke liye retention/export policy abhi nahi.
- **Email:** abhi sirf test mailer (memory mein); production mein verification/reset emails deliver nahi hoti jab tak provider adapter na lage (startup par warning).
- Concurrent refresh (ek token se do requests) loser ko reuse maanke family revoke kar deta hai: clients ek token se parallel refresh na karein.
- Offset pagination deep pages par slow hai (`page` max 10000); cursor pagination abhi nahi bani.
- Unexpected-error logs mein asli error message aata hai; Pino redaction sirf known keys ko cover karti hai, to error messages secrets se mat banao.
- Rate limiting: sirf auth/session login par in-memory hook hai; global/IP-based limiting Phase 11 mein.
- `/api/v1/examples` abhi inline Zod use karta hai; shared validation + response convention Phase 5 mein. Examples in-memory hain aur production mein mount nahi hote.
- Query values strings hote hain; typed coercion/validation Phase 5 mein.
- Logging Pino hai, lekin metrics, Sentry, trace propagation aur dashboards Phase 19 mein. Config-error message (logger banne se pehle) `console.error` hai.
- Helmet abhi defaults par hai; CSP/HSTS/CORS review Phase 11 mein.
- Request ID sirf HTTP tak; background jobs mein propagation Phase 14/19.
- `route` log field router-relative pattern hai (`/ping`, `/notes/:id`), full path nahi; trade-off: token-safe, lekin full URL debug ke liye alag se dekhna padta hai.
- `createApp()` return hone ke baad register kiye gaye routes 404 handler ke baad aate hain (kabhi match nahi honge): routes routers ke andar add karo.
- Jest ESM experimental warning print karta hai.
- `.env` change hone par `npm run dev` auto-restart nahi karta (`--watch` sirf imported files dekhta hai); manually restart karo.

## 15. FAQ / troubleshooting

| Problem                                                                                        | Wajah / fix                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server start nahi hota, `Invalid environment configuration`                                    | Env var galat hai (e.g. `PORT=abc`, `NODE_ENV=staging`). Message mein saari invalid fields listed hain. `.env` ya shell env theek karo.                                                                                                                                                                                                |
| `EADDRINUSE`                                                                                   | Port pehle se use mein hai. `PORT` badlo ya purana process band karo (`lsof -i :3000`).                                                                                                                                                                                                                                                |
| `.env` badalne par kuch nahi badla                                                             | `npm run dev` `.env` change par restart nahi karta; manually restart karo. Aur shell mein pehle se set env var `.env` ko override kar deta hai (dotenv override nahi karta).                                                                                                                                                           |
| `npm test` par `ExperimentalWarning: VM Modules`                                               | Normal hai: Jest native ESM `--experimental-vm-modules` se chalta hai.                                                                                                                                                                                                                                                                 |
| Test mein `jest is not defined`                                                                | ESM mein `jest` global nahi; `import { jest } from '@jest/globals'` karo.                                                                                                                                                                                                                                                              |
| `GET /api/v1/auth/login` 404 kyun deta hai?                                                    | `login` `POST` hai (GET nahi), aur auth module sirf tab mount hota hai jab `MONGODB_URI` set ho; uske bina poora `/auth` 404 hai. Sahi call: `POST /api/v1/auth/login`.                                                                                                                                                                |
| `/api/v1/examples/*` production mein 404 kyun?                                                 | Teaching endpoints sirf `NODE_ENV !== 'production'` mein mount hote hain.                                                                                                                                                                                                                                                              |
| `/notes/abc` par 400 kyun?                                                                     | `requireNumericParam('id')` route middleware positive integer maangta hai. Express 5 mein inline regex (`:id(\\d+)`) support nahi.                                                                                                                                                                                                     |
| Tests mein logs kyun nahi dikhte?                                                              | `NODE_ENV=test` par `LOG_LEVEL` default `silent` hai. Dekhna ho to `LOG_LEVEL=debug npm test`, ya test mein `createLogCapture()` use karo.                                                                                                                                                                                             |
| Mera `X-Request-Id` badal gaya                                                                 | Sirf `[A-Za-z0-9._-]{8,128}` accept hota hai; chhota/lamba/special chars wala ID replace hota hai (log injection se bachne ke liye).                                                                                                                                                                                                   |
| Logs mein full URL/params kyun nahi dikhte?                                                    | Intentional: route pattern + request ID log hota hai; query/path-param values mein tokens ho sakte hain. Debug ke liye request ID se context dhundo.                                                                                                                                                                                   |
| `app.get(...)` `createApp()` ke baad lagaya, 404 aa raha hai                                   | 404 handler pehle registered hai; late routes tak request pahunchti hi nahi. Route router ke andar add karo.                                                                                                                                                                                                                           |
| Naya validated route kaise add karun?                                                          | `docs/modules/validation-and-api-contracts.md` ka "How to add a validated route": schema (`z.strictObject`) -> `router.x(path, validate({...}), handler)` -> handler `res.locals.valid` padhe -> manual verification (curl) likho.                                                                                                     |
| `?limit=10abc` ya `?page=1&page=2` 400 kyun deta hai?                                          | Query values strict string patterns se check hoti hain (`z.coerce` nahi) aur repeated keys arrays banti hain jo string schema fail karte hain.                                                                                                                                                                                         |
| Request mein extra field bhejne par 400 kyun?                                                  | Schemas `z.strictObject` hain; unknown field reject hota hai (mass-assignment se bachne ke liye). Naya field accept karna ho to schema mein add karo (non-breaking change).                                                                                                                                                            |
| `sort=password` jaisi cheez kaise rokta hai?                                                   | Sort allowlist map hai (`{price: 'priceCents', ...}`) aur uska regex sirf allowed naam accept karta hai; DB column hamesha map se aata hai.                                                                                                                                                                                            |
| `npm run dev` par server start hota hai par `/health/ready` 503 deta hai                       | MongoDB nahi chal raha ya `MONGODB_URI` galat. `npm run db:up` chalao (container healthy hone mein ~10-15s lagte hain) aur `docker compose ps` dekho. Server khud retry karta hai, restart nahi chahiye.                                                                                                                               |
| `db:migrate` "MONGODB_URI is not set" deta hai                                                 | `cp .env.example .env` karo (scripts bhi `.env` padhte hain).                                                                                                                                                                                                                                                                          |
| Transaction par "Transaction numbers are only allowed on a replica set member"                 | Plain mongod par transactions nahi chalte. `compose.yaml` ka replica set use karo aur URI mein `replicaSet=rs0&directConnection=true` rakho.                                                                                                                                                                                           |
| Mongoose se write kiya to chal gaya par script se likhte hi `Document failed validation` (121) | Collection validators server par har write check karte hain (`src/db/models/validators.js`). Ye jaan-boojh ke hain: `$inc` ya raw script se negative stock jaisa data nahi ghus sakta.                                                                                                                                                 |
| Naya index/validator kaise add karun?                                                          | Schema mein index likho aur ek **nayi migration** (`migrations/000N_...js`) jo `createIndex`/`collMod` chalaye. `autoIndex` band hai, isliye sirf schema badalne se index nahi banta.                                                                                                                                                  |
| `findOneAndUpdate` par `new` option ka warning                                                 | Mongoose 9 mein `{ new: true }` ki jagah `{ returnDocument: 'after' }`.                                                                                                                                                                                                                                                                |
| Login `403 EMAIL_NOT_VERIFIED` deta hai                                                        | Pehle email verify karo. Dev mein link `GET /api/v1/examples/mailbox?to=<email>` se milta hai (test mailer). Seed users already verified hain.                                                                                                                                                                                         |
| Seed users se login kaise karun?                                                               | `SEED_PASSWORD='kuch-lamba-123' npm run db:seed` (password >= 12 chars), phir `customer@shopsphere.test` se login. Ya forgot-password flow se mailbox ka link lekar password set karo.                                                                                                                                                 |
| 401 aur 403 mein kya farq hai?                                                                 | 401 = "tum kaun ho pata nahi" (token/cookie nahi ya galat). 403 = "pata hai tum kaun ho, par ye kaam tumhara nahi" (role/permission/seller approval). Dusre seller ka product: `403` (product exist na kare to `404`), `ownership.js`.                                                                                                 |
| Seller ko `403 SELLER_NOT_APPROVED`                                                            | Seller profile abhi `PENDING` hai. Admin `POST /api/v1/admin/sellers/:id/approve` (body `{}`) karega tab product bana payega.                                                                                                                                                                                                          |
| `POST .../approve` par `415`                                                                   | Body-less POST par bhi JSON content-type aur `{}` body chahiye (strict body schema). `-H 'Content-Type: application/json' -d '{}'`.                                                                                                                                                                                                    |
| Cookie wali request par `403 CSRF_TOKEN_INVALID`                                               | State-changing request (POST/PUT/PATCH/DELETE) par `X-CSRF-Token` header zaruri hai: pehle `GET /api/v1/session/csrf` se token lo (session ke saath bound). Origin bhi allowed hona chahiye.                                                                                                                                           |
| `/api/v1/session/*` 404 deta hai                                                               | `REDIS_URL` set nahi (ya database nahi). `npm run db:up` chalao aur `.env` mein `REDIS_URL=redis://127.0.0.1:6379` rakho.                                                                                                                                                                                                              |
| Session login production mein 500 deta hai                                                     | Secure cookie sirf HTTPS request par set ho sakti hai. Proxy ke peeche ho to `TRUST_PROXY_HOPS=1` set karo aur proxy `X-Forwarded-Proto: https` bheje. Server log mein wajah likhi hoti hai.                                                                                                                                           |
| Cookie requests `503` deti hain par bearer chalta hai                                          | Redis down hai (by design: sessions nahi, baaki API theek). `docker compose ps` dekho, `npm run db:up`. Redis wapas aate hi apne aap theek.                                                                                                                                                                                            |
| Naya permission kaise add karun?                                                               | `src/modules/authz/permissions.js` mein `PERMISSIONS` + `ROLE_PERMISSIONS` map, route par `requirePermission(...)`, aur ownership wala resource ho to `ownership.js` ka check. Detail: `docs/modules/authorization-and-sessions.md`.                                                                                                   |
| Role badla par purana token chal raha hai?                                                     | Role token se nahi, DB se har request par padha jata hai, isliye role badalte hi naya role lagta hai.                                                                                                                                                                                                                                  |
| Server restart ke baad purana access token 401 deta hai                                        | `AUTH_JWT_SECRET` set nahi hai to har run par naya random secret banta hai. `.env` mein fixed secret do.                                                                                                                                                                                                                               |
| Login par achanak `429`                                                                        | 5 galat koshishon ke baad (email+ip) 15 min lock; `Retry-After` header dekho. Limiter in-memory hai: server restart se reset ho jaata hai.                                                                                                                                                                                             |
| Refresh karte hi `401` jabki token naya tha                                                    | Token ek hi baar chalta hai (rotation). Purana/dobara use hua to poori session family revoke ho jaati hai; dobara login karo. Ek token se parallel refresh mat karo.                                                                                                                                                                   |
| Naya error type kaise add karun?                                                               | `src/errors/app-errors.js` mein `AppError` extend karo (status + stable `code`), service/handler mein `throw` karo. Handler mein kuch nahi badalna. Detail: `docs/modules/error-handling.md`.                                                                                                                                          |
| Production mein 500 par kuch detail kyun nahi milta?                                           | By design: client ko generic message. Asli error + stack server log mein `unexpected error` line (`level: 50`) mein hai; response header `X-Request-Id` se wo line dhundo.                                                                                                                                                             |
| `asyncHandler`/try-catch kyun nahi?                                                            | Express 5 async handler ke throw aur rejected Promise ko khud error middleware tak bhejta hai. Express 4 mein wrapper chahiye hota tha.                                                                                                                                                                                                |
| Mere `throw new Error('...')` ka message client ko kyun nahi dikha?                            | Plain `Error` unexpected maana jata hai (generic 500). Client ko message dikhana hai to matching `AppError` subclass throw karo.                                                                                                                                                                                                       |
| `src/` ke code ke comments kis style mein likhne hain?                                         | Hinglish, English technical terms ke saath: file ka purpose, design/ordering ka reason, aur library ka behaviour jo naye developer ko na pata ho. Tests mein naye comments nahi likhte. Models: `env.js`, `server.js`, `app.js`. Comments add karne ke baad check karo ki code same hai (AST compare) aur lint/format/tests pass hain. |
| Naya env var kaise add karun?                                                                  | `src/config/env.js` ke Zod schema mein + `.env.example` mein dono jagah; config object se hi padho, `process.env` seedha nahi.                                                                                                                                                                                                         |
| Naya route kaise add karun?                                                                    | `docs/modules/routing-and-http.md` -> "How to add a new route".                                                                                                                                                                                                                                                                        |
| Naya phase khatam hone par kya update karun?                                                   | Tests + `docs/modules/<module>.md` + matrix rows (evidence ke saath) + **README**: status, TOC, Build Log (naya phase), structure, run/endpoints, verification, roadmap, glossary, FAQ, limitations.                                                                                                                                   |
| `npm audit` moderate dikhata hai                                                               | Sirf Jest ke dev-time dependency chain mein; `npm audit --omit=dev` = 0. Suggested `--force` fix Jest ko downgrade karta hai, isliye nahi lagaya.                                                                                                                                                                                      |

## 16. Docs index

| Area                  | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working rules         | [CLAUDE.md](CLAUDE.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Architecture overview | [docs/architecture/overview.md](docs/architecture/overview.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Phase plan            | [docs/architecture/phases.md](docs/architecture/phases.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ADRs                  | [docs/architecture/decisions/](docs/architecture/decisions/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Module docs           | [docs/modules/](docs/modules/README.md) (abhi: [application-foundation](docs/modules/application-foundation.md), [routing-and-http](docs/modules/routing-and-http.md), [middleware](docs/modules/middleware.md), [error-handling](docs/modules/error-handling.md), [validation-and-api-contracts](docs/modules/validation-and-api-contracts.md), [database-and-persistence](docs/modules/database-and-persistence.md), [authentication](docs/modules/authentication.md), [authorization-and-sessions](docs/modules/authorization-and-sessions.md)) |
| Runbooks              | [docs/runbooks/](docs/runbooks/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Security              | [docs/security/](docs/security/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Test strategy         | [docs/testing/](docs/testing/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Concept matrix        | [docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
