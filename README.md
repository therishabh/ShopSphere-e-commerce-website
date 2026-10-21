# ShopSphere

Multi-vendor e-commerce backend (customers, sellers, admins). Express 5 + ESM JavaScript, PostgreSQL + Prisma, Redis, BullMQ, Socket.IO.

> Ye README poora project guide hai: kya banaya, kis sequence mein, kyun, aur code kaise kaam karta hai. Har phase ke baad update hoti hai. Naye developer ya fresher ko sirf ise padh ke project aur uska code samajh aa jana chahiye, aur isi ko recipe ki tarah follow karke doosra project bhi banaya ja sake.

**Current status: Phase 4 complete** (foundation, `/api/v1` routing, middleware pipeline, aur centralized error handling: error hierarchy, safe responses, expected vs unexpected logging). Business endpoints (auth, products, orders) abhi nahi bane; module routers khaali hain.

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
8. [Current project structure](#8-current-project-structure)
9. [Run kaise karein (setup, scripts)](#9-run-kaise-karein-setup-scripts)
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
clients ──> Nginx ──> API process (Express 5) ──> PostgreSQL (Prisma)
                          │  └── Redis (cache, sessions)
                          │  └── Socket.IO (realtime)
                          └── outbox rows ──> Worker (BullMQ + Redis)
                                                └── email / reports / alerts / realtime fan-out
```

Module ka layering rule (jab modules aayenge): `route → validation (Zod) → controller (sirf HTTP) → service (business rules, transactions) → repository (Prisma)`. Controller mein business logic nahi.

Is repo ka secondary goal: har Express concept (middleware, error handling, `next('route')`, `res.headersSent`, trust proxy, streams, etc.) code + test + doc ke saath demonstrate karna. Isliye ek coverage matrix maintain hota hai (section 12).

## 2. Quick start

Prerequisite: Node.js >= 24 aur npm. PostgreSQL/Redis abhi zaruri nahi.

```bash
git clone https://github.com/therishabh/ShopSphere-e-commerce-website.git
cd ShopSphere-e-commerce-website
npm ci                      # lockfile se exact versions
cp .env.example .env        # optional; defaults kaam karte hain
npm run dev                 # server http://127.0.0.1:3000
```

Check karo ki chal raha hai:

```bash
curl localhost:3000/health/ready
# {"status":"ready","checks":{}}

curl -i localhost:3000/api/v1/examples/ping       # X-Request-Id + security headers dekho; server terminal mein JSON log line

curl -X POST localhost:3000/api/v1/examples/notes -H 'content-type: application/json' -d '{"text":"hello"}'
# {"id":1,"text":"hello"}   (201, Location header ke saath)

npm test                    # 183 tests, ~1-2 sec
```

Aage ka detail section 9 mein hai.

## 3. Tech stack aur fixed decisions

| Area        | Choice                                     | Reason / note                                                                                              |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Runtime     | Node.js current LTS (`>=24`), ESM          | Native `--watch`; no TypeScript by choice                                                                  |
| Framework   | Express 5.3.0                              | Async handler ke rejected promises automatically error middleware tak jaate hain (wrapper ki zarurat nahi) |
| Core DB     | PostgreSQL + Prisma                        | Relational data, transactions, constraints                                                                 |
| Alt DB      | MongoDB + Mongoose, sirf isolated lab mein | Core data model mein mix nahi hoga                                                                         |
| Redis       | Cache, BullMQ queues, sessions             | Outage pe commerce state corrupt nahi hona chahiye                                                         |
| Realtime    | Socket.IO                                  | Order status updates                                                                                       |
| Storage     | S3-compatible, adapter ke peeche           | Local adapter dev ke liye                                                                                  |
| Validation  | Zod 4.6.7                                  | Env + request validation                                                                                   |
| Tests       | Jest 30 + Supertest                        | Native ESM mode                                                                                            |
| Lint/format | ESLint 10 (flat config) + Prettier 3       |                                                                                                            |
| Payments    | **Mock provider only**                     | Real card data / live credentials kabhi nahi                                                               |

Saari dependencies `--save-exact` se pinned hain aur `package-lock.json` committed hai.

## 4. Working rules (CLAUDE.md) aur workflow

`CLAUDE.md` root mein hai aur har phase ke liye persistent instructions deta hai. Core rules:

- Ek baar mein ek phase. Plan ko implementation ki jagah nahi dena, aur aage skip nahi karna.
- Edit se pehle relevant files padho; working code preserve karo.
- Koi TODO / stub / fake success response / empty handler nahi. Blocker ho to exact blocker batao.
- Har meaningful behaviour aur error path ke liye test. Commands actually run karke hi "pass" bolna.
- Controllers mein business logic nahi, secrets source mein nahi, sensitive data log mein nahi.
- Payments/email/external services ke liye mock providers.
- **Har implementation ke baad README update** (Hinglish, Table of Contents, step-by-step Build Log, snippets) + docs + matrix.
- Concept matrix rule: **koi concept tab tak complete nahi jab tak implementation, test, doc aur exact path/command, sab evidence na ho.**

Phase workflow: prompt do → implement → diff + checks review → fail ho to fix → commit → agla phase.

## 5. Code kaise padhein: reading order aur request walkthrough

### 5.1 Reading order (Phase 4 tak ka code)

Is order mein files kholo; har step pichle step par build hota hai. Har source file ke saath uska test bhi padho.

| #   | File                                                                                       | Kya samajh aayega                                                                             |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | `package.json`                                                                             | ESM (`"type": "module"`), scripts, pinned deps                                                |
| 2   | `src/config/env.js`                                                                        | Environment variables ek jagah validate hote hain (Zod); baaki code `process.env` nahi chhuta |
| 3   | `src/server.js`                                                                            | Process ka entrypoint: `dotenv` -> config -> listen -> signals. App yahan nahi banta          |
| 4   | `src/app.js`                                                                               | `createApp()` factory: **mount order** yahin dikhta hai                                       |
| 5   | `src/health/readiness.js`, `health.routes.js`                                              | Liveness vs readiness; named dependency checks                                                |
| 6   | `src/logging/logger.js`, `src/middleware/*.js`                                             | Pino logger + redaction; request ID, request logger, conditional `when/unless`, Helmet        |
| 7   | `src/routes/api.routes.js`                                                                 | `/api/v1` prefix, body parsers, module mounts                                                 |
| 8   | `src/modules/auth/auth.routes.js` (koi bhi)                                                | Khaali-par-mounted module; baaki 6 bilkul same                                                |
| 9   | `src/http/route-guards.js`                                                                 | Reusable route-specific middleware (415, 400, 405)                                            |
| 10  | `src/errors/app-errors.js`, `to-app-error.js`, `src/http/error-handler.js`, `not-found.js` | Error hierarchy, thrown value ki classification, aur central safe response + logging          |
| 11  | `src/examples/http-examples.routes.js`, `middleware-examples.routes.js`                    | HTTP aur middleware concepts ke working demos; comments mein concept naam likha hai           |
| 12  | `tests/**` (+ `tests/helpers/log-capture.js`)                                              | Behaviour ka spec; examples/tests se hi seekhna sabse tez hai                                 |

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

| Concept                                           | Matlab aur is project mein kahan                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESM**                                           | `import/export` module system (`"type": "module"`). File extensions import mein likhne padte hain (`./app.js`).                                                                                                                  |
| **App factory**                                   | `createApp({ config, readiness })` ek function hai jo app _banata_ hai, global state nahi rakhta. Isse tests har baar fresh app bana sakte hain aur port ki zarurat nahi. (`src/app.js`)                                         |
| **app.js vs server.js**                           | `app.js` = Express app ki wiring (testable). `server.js` = process-level kaam: port, env, signals, exit codes.                                                                                                                   |
| **Dependency injection (halka)**                  | Config aur readiness ko function argument ki tarah pass karte hain, import se nahi. Tests fakes inject kar sakte hain.                                                                                                           |
| **Fail-fast config**                              | Galat env var par server start hi nahi hota; saari errors ek saath print hoti hain (`ConfigError`, exit 1).                                                                                                                      |
| **Liveness vs readiness**                         | `/health/live` = process zinda hai (dependency check nahi, restart decide karne ke liye). `/health/ready` = traffic lene layak hai (dependencies up, shutdown nahi). DB down ho to ready 503, live 200.                          |
| **Readiness check**                               | Named async function; reject ya timeout = `down`. Phase 6 mein `db` check judega.                                                                                                                                                |
| **Middleware**                                    | `(req, res, next)` function. Response bhejke pipeline rok sakta hai, ya `next()` se aage bhejta hai.                                                                                                                             |
| **Router / mount**                                | `Router()` mini-app hai; `app.use('/prefix', router)` use ek URL prefix par lagata hai.                                                                                                                                          |
| **Mount order**                                   | Express registration order mein match karta hai. Literal route (`/notes/latest`) ko parameter route (`/notes/:id`) se pehle rakhna padta hai.                                                                                    |
| **Route-specific middleware**                     | Sirf ek route par lagne wala guard, e.g. `post(requireJson, handler)`.                                                                                                                                                           |
| **`route().all()` fallback**                      | Same path ke methods group karke aakhir mein `.all(...)` lagao: koi method match na ho to 405 + `Allow`.                                                                                                                         |
| **Body parser limit**                             | `express.json({limit:'100kb'})`: bada body 413 se reject. Parser sirf `/api/v1` par lagta hai.                                                                                                                                   |
| **Simple query parser (Express 5)**               | `?x=1&x=2` -> `['1','2']`; `a[b]=1` nested object nahi banta. Values hamesha string.                                                                                                                                             |
| **Status codes**                                  | 201 + `Location` (create), 204 (delete, empty body), 400 (invalid input), 404, 405, 413, 415. Table: `docs/modules/routing-and-http.md`.                                                                                         |
| **Safe error response**                           | Fixed `{error:{code,message}}`, raw error text ya stack nahi; 404 requested path echo nahi karta.                                                                                                                                |
| **Application / router / route-level middleware** | `app.use(...)` poori app par; `router.use(...)` ek router par; `router.get(path, mw, handler)` sirf us route par. Teeno ke examples: `requestId`, body parsers, `requireJson`.                                                   |
| **`next()` / `next(err)`**                        | `next()` = agle matching middleware par; `next(err)` = normal middleware/handler skip karke error middleware (4 args) par. Response bhejke `next()` na call karna = pipeline yahin ruk gayi (`return res...` likho).             |
| **Conditional middleware**                        | `when(pred, mw)` / `unless(pred, mw)`: predicate par middleware chalao ya seedha `next()`. Health probes ka logging aise skip hota hai.                                                                                          |
| **Request ID / correlation ID**                   | Har request ka unique ID (`X-Request-Id`); logs aur response mein same. Valid incoming ID reuse hota hai taaki ek call services ke beech trace ho sake.                                                                          |
| **`res.locals`**                                  | Ek response/request ke liye scratchpad (`requestId`, `log`). Sirf downstream ko chahiye wahi values; entities ya secrets nahi. Requests ke beech share nahi hota.                                                                |
| **`req.app`**                                     | Handler se owning Express app tak pahunch (`req.app.locals.config`), import ke bina.                                                                                                                                             |
| **Structured logging (Pino)**                     | Har log JSON object hai (`level`, `requestId`, `status`, ...), machine-searchable. `LOG_LEVEL` se control; tests mein `silent`.                                                                                                  |
| **Redaction**                                     | Pino `redact` paths sensitive keys (`password`, `token`, `authorization`, `cookie`) ko `[Redacted]` kar dete hain. Safety net hai; asli rule: sensitive data log hi mat karo.                                                    |
| **Helmet / security headers**                     | `X-Content-Type-Options`, `Content-Security-Policy`, `X-Frame-Options`... ek middleware se. Har response par (errors par bhi).                                                                                                   |
| **Route pattern vs raw path**                     | Logs mein `/echo/:value` (pattern) jaata hai, `/echo/abc123` nahi, kyunki path params mein tokens ho sakte hain.                                                                                                                 |
| **Operational vs unexpected error**               | Operational = expected (validation, 404, conflict): client ko message milta hai, stack log nahi. Unexpected = bug/infra (DB down): client ko generic 500, server log mein poora error + stack. `isOperational` flag isi ke liye. |
| **AppError hierarchy**                            | `AppError` ki subclasses (`NotFoundError`, `ConflictError`, ...), har ek ka fixed status aur stable `code`. Service/handler bas `throw new ...Error()` karta hai. (`src/errors/`)                                                |
| **Error middleware (4 args)**                     | `(err, req, res, next)`: Express ise isi signature se pehchanta hai; sabse last mount hota hai. Ek hi jagah saare errors ka response + logging.                                                                                  |
| **Express 5 async errors**                        | `async` handler mein throw ya rejected Promise Express 5 khud `next(err)` bana deta hai; try/catch ya `asyncHandler` wrapper ki zarurat nahi (Express 4 mein hoti thi).                                                          |
| **Safe error response**                           | `{ error: { code, message, details? } }`; kabhi stack, cause, ya raw error text nahi. Handler mein `NODE_ENV` branch nahi, isliye production aur dev same.                                                                       |
| **`res.headersSent`**                             | Response shuru ho chuka ho to naya error response nahi bhej sakte; handler `next(err)` se Express ke default handler ko deta hai jo connection band karta hai.                                                                   |
| **Interim**                                       | Abhi ke liye kaafi, baad ke phase mein replace (e.g. Phase 2 ka `clientErrorHandler` Phase 4 mein central `errorHandler` se replace hua).                                                                                        |
| **Modular monolith**                              | Ek deployable app, andar alag modules (auth, products, ...). Microservices nahi.                                                                                                                                                 |
| **Mock provider**                                 | Payment/email ke test-safe fake adapters; real credentials kabhi nahi.                                                                                                                                                           |
| **Exact pinning**                                 | `--save-exact` + committed `package-lock.json`: har machine par same versions.                                                                                                                                                   |
| **Supertest**                                     | Bina port khole app par HTTP requests chalane ka tool (`request(app).get(...)`).                                                                                                                                                 |
| **Mutation check**                                | Code jaan-boojh ke todke dekhna ki test fail hota hai ya nahi; pass-karne-wale-lekin-bekar tests pakadne ke liye.                                                                                                                |
| **Status ladder**                                 | Matrix mein `planned → ... → verified`; evidence ke bina aage nahi badhta.                                                                                                                                                       |

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

- 7 module routers (**auth, users, sellers, products, cart, orders, admin**) valid aur mounted hain, lekin **khaali** (URL space reserved, koi endpoint nahi).
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
│   ├── modules/<name>/<name>.routes.js   # auth users sellers products cart orders admin (empty, mounted)
│   ├── errors/                   # app-errors.js (hierarchy), to-app-error.js (classification)
│   ├── http/                     # error-handler.js, not-found.js, route-guards.js
│   └── examples/                 # teaching only, /api/v1/examples/*, non-prod: http-examples, middleware-examples, error-examples
├── public/example.txt            # served at /static
├── tests/
│   ├── helpers/log-capture.js    # Pino ko memory mein capture (tests)
│   ├── unit/        config, readiness, middleware-units, errors .test.js
│   └── integration/ health, server, routing, static, middleware, error-handling .test.js
└── docs/
    ├── architecture/ (overview.md, phases.md, decisions/)
    ├── coverage/EXPRESS_CONCEPT_MATRIX.md
    ├── modules/ application-foundation.md, routing-and-http.md, middleware.md, error-handling.md
    └── runbooks/ security/ testing/   # abhi sirf index
```

Planned: `src/worker.js`, `prisma/`, `labs/`, `deploy/`. Layout Phase 2+ mein evolve ho sakta hai.

## 9. Run kaise karein (setup, scripts)

Prerequisites: Node.js >= 24, npm. PostgreSQL/Redis abhi zaruri nahi.

```bash
npm ci
cp .env.example .env    # optional, defaults kaam karte hain
npm run dev             # http://127.0.0.1:3000/health/ready
```

| Script                            | Kaam                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                     | `node --watch` + `.env` auto-load                              |
| `npm start`                       | Real environment variables ke saath run                        |
| `npm test`                        | Jest + Supertest (native ESM, experimental warning normal hai) |
| `npm run lint`                    | ESLint                                                         |
| `npm run format` / `format:check` | Prettier write / check                                         |

Environment variables: `NODE_ENV` (`development\|test\|production`, default `development`), `HOST` (default `127.0.0.1`), `PORT` (default `3000`, `0` = ephemeral), `LOG_LEVEL` (`trace|debug|info|warn|error|fatal|silent`; default `info`, tests mein `silent`).

Endpoints abhi:

| Endpoint                                                    | Response                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health/live`                                          | `200 {"status":"live"}`                                                                                                                                |
| `GET /health/ready`                                         | `200 {"status":"ready","checks":{}}`, ya `503` (`not_ready` / `shutting_down`)                                                                         |
| `GET /static/example.txt`                                   | `200 text/plain` (`express.static`, `public/`)                                                                                                         |
| `/api/v1/{auth,users,sellers,products,cart,orders,admin}/*` | `404` abhi (modules khaali)                                                                                                                            |
| `/api/v1/examples/*`                                        | Teaching endpoints (non-production only): `ping`, `echo/:value`, `echo/json`, `echo/form`, `old-notes`, `notes`, `notes/:id`, `notes/:noteId/comments` |
| `/api/v1/examples/middleware/*`                             | Middleware demos (non-production only): `chain`, `conditional`, `guarded`, `fail`, `app-config`, `stats`                                               |
| `/api/v1/examples/errors/*`                                 | Error demos (non-production only): `raise/:kind`, `sync-throw`, `async-reject`, `next-err`, `throw-string`, `service/*`, `after-headers`               |
| anything else                                               | `404 {"error":{"code":"NOT_FOUND","message":"Resource not found"}}`                                                                                    |

## 10. Verification results (ab tak)

Phase 4 ke end par actual run hue commands (pichhle phases ke checks bhi included):

| Command                                                       | Result                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                    | 10 suites, 183 tests passed                                    |
| `npm run lint`                                                | clean                                                          |
| `npm run format:check`                                        | clean                                                          |
| `node src/server.js` + curl (`/health/live`, `/health/ready`) | dono 200; SIGTERM par exit                                     |
| `npm run dev` + temp `.env`                                   | `.env` load hua, `/health/ready` 200                           |
| `npm audit --omit=dev`                                        | 0 vulnerabilities                                              |
| `npm audit`                                                   | dev-only (Jest chain) moderate advisories, fix apply nahi kiya |

Phase 4 extras: chaar mutation checks (`headersSent` guard hataya -> 2 fail; 500 body mein asli message -> 11 fail; error handler unmount -> 50 fail; unexpected error `warn` par -> 7 fail; restore par 183/183); real server smoke (dev: generic 500s, 409, 429, truncated `after-headers`; production: 404/400 safe, logs mein `"stack"` 0).

Phase 3 extras: teen mutation checks (requestId logger ke baad -> 3 fail; Helmet `/api/v1` ke baad -> 5 fail; guard se `return` hataya -> 1 fail; restore par 123/123); real server smoke (response headers, request-ID reuse, JSON log lines, health probe unlogged, 4 secrets ka logs mein 0 match).

Phase 2 extras: ordering test ka mutation check (order badalne par 1 test fail, restore par pass); real server par curl smoke (201+Location, static 200, 301, 405, module 404).

Environment-dependent checks (Postgres, Redis, Docker) abhi applicable nahi.

## 11. Roadmap (Phase 0–25)

| #   | Phase                                                       | Status  |
| --- | ----------------------------------------------------------- | ------- |
| 0   | Guardrails                                                  | done    |
| 1   | Foundation (app/server, config, health)                     | done    |
| 2   | HTTP & routing (`/api/v1`, params/query/body, static, 404)  | done    |
| 3   | Middleware pipeline, request IDs, `res.locals`, `req.app`   | done    |
| 4   | Error handling (hierarchy, `headersSent`)                   | done    |
| 5   | Validation, pagination, OpenAPI + Swagger                   | next    |
| 6   | PostgreSQL + Prisma, migrations, repositories, transactions | planned |
| 7   | Authentication (hashing, refresh rotation, verify/reset)    | planned |
| 8   | Authorization, ownership, sessions, CSRF                    | planned |
| 9   | Catalog, inventory concurrency, reviews, wishlists          | planned |
| 10  | Cart, checkout, idempotency, order state machine            | planned |
| 11  | Security hardening + threat model                           | planned |
| 12  | Uploads (Multer), storage adapters, CSV streaming           | planned |
| 13  | Redis caching + benchmarks                                  | planned |
| 14  | BullMQ worker, retries, outbox                              | planned |
| 15  | Webhooks (signature, idempotency)                           | planned |
| 16  | OAuth2 / OIDC (PKCE, state, nonce)                          | planned |
| 17  | Socket.IO realtime + notifications                          | planned |
| 18  | Test strategy, coverage, CI                                 | planned |
| 19  | Observability + graceful shutdown                           | planned |
| 20  | Docker, Nginx, worker_threads, scaling                      | planned |
| 21  | Express concept lab (+ Express 4 compat lab)                | planned |
| 22  | Mongoose lab                                                | planned |
| 23  | Docs audit                                                  | planned |
| 24  | Concept coverage audit                                      | planned |
| 25  | Release gate                                                | planned |

Detail: [docs/architecture/phases.md](docs/architecture/phases.md).

## 12. Concept coverage matrix ka status

[docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md): 235 concepts. Abhi sections 1 (Foundation, 7), 2 (HTTP & routing, 14), 3 (Middleware, 14) aur 4 (Error handling, 9) `verified` (44 concepts); baaki sab `planned`. Har phase ke baad sirf evidence-backed rows update hote hain.

## 13. Is project ko recipe ki tarah reuse karna

Naye Express 5 project ke liye Phase 0 + 1 + 2 + 3 + 4 ka reusable sequence:

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

## 14. Known limitations / tradeoffs

- Graceful shutdown abhi minimal hai (server close + readiness 503). Request draining with deadline aur ordered dependency close Phase 19 mein.
- `/health/ready` abhi koi real dependency check nahi karta (koi dependency hai hi nahi); DB check Phase 6 mein.
- Validation errors abhi 400 hain aur `details` plain `{path, message}` array hai; source (`body|query|params`) aur API-wide response convention Phase 5 mein finalize.
- DB/driver errors abhi sab generic 500 hain; known DB errors (unique violation -> `ConflictError`) ka mapping Phase 6 mein repository boundary par.
- Unexpected-error logs mein asli error message aata hai; Pino redaction sirf known keys ko cover karti hai, to error messages secrets se mat banao.
- Rate limiting, authentication/authorization errors ke classes bane hain lekin unhe throw karne wale features aage ke phases mein.
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

| Problem                                                             | Wajah / fix                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server start nahi hota, `Invalid environment configuration`         | Env var galat hai (e.g. `PORT=abc`, `NODE_ENV=staging`). Message mein saari invalid fields listed hain. `.env` ya shell env theek karo.                                                              |
| `EADDRINUSE`                                                        | Port pehle se use mein hai. `PORT` badlo ya purana process band karo (`lsof -i :3000`).                                                                                                              |
| `.env` badalne par kuch nahi badla                                  | `npm run dev` `.env` change par restart nahi karta; manually restart karo. Aur shell mein pehle se set env var `.env` ko override kar deta hai (dotenv override nahi karta).                         |
| `npm test` par `ExperimentalWarning: VM Modules`                    | Normal hai: Jest native ESM `--experimental-vm-modules` se chalta hai.                                                                                                                               |
| Test mein `jest is not defined`                                     | ESM mein `jest` global nahi; `import { jest } from '@jest/globals'` karo.                                                                                                                            |
| `GET /api/v1/auth/login` 404 kyun deta hai?                         | Module abhi khaali hai (Phase 7 mein bhara jayega). Fake endpoint nahi banate.                                                                                                                       |
| `/api/v1/examples/*` production mein 404 kyun?                      | Teaching endpoints sirf `NODE_ENV !== 'production'` mein mount hote hain.                                                                                                                            |
| `/notes/abc` par 400 kyun?                                          | `requireNumericParam('id')` route middleware positive integer maangta hai. Express 5 mein inline regex (`:id(\\d+)`) support nahi.                                                                   |
| Tests mein logs kyun nahi dikhte?                                   | `NODE_ENV=test` par `LOG_LEVEL` default `silent` hai. Dekhna ho to `LOG_LEVEL=debug npm test`, ya test mein `createLogCapture()` use karo.                                                           |
| Mera `X-Request-Id` badal gaya                                      | Sirf `[A-Za-z0-9._-]{8,128}` accept hota hai; chhota/lamba/special chars wala ID replace hota hai (log injection se bachne ke liye).                                                                 |
| Logs mein full URL/params kyun nahi dikhte?                         | Intentional: route pattern + request ID log hota hai; query/path-param values mein tokens ho sakte hain. Debug ke liye request ID se context dhundo.                                                 |
| `app.get(...)` `createApp()` ke baad lagaya, 404 aa raha hai        | 404 handler pehle registered hai; late routes tak request pahunchti hi nahi. Route router ke andar add karo.                                                                                         |
| Naya error type kaise add karun?                                    | `src/errors/app-errors.js` mein `AppError` extend karo (status + stable `code`), service/handler mein `throw` karo. Handler mein kuch nahi badalna. Detail: `docs/modules/error-handling.md`.        |
| Production mein 500 par kuch detail kyun nahi milta?                | By design: client ko generic message. Asli error + stack server log mein `unexpected error` line (`level: 50`) mein hai; response header `X-Request-Id` se wo line dhundo.                           |
| `asyncHandler`/try-catch kyun nahi?                                 | Express 5 async handler ke throw aur rejected Promise ko khud error middleware tak bhejta hai. Express 4 mein wrapper chahiye hota tha.                                                              |
| Mere `throw new Error('...')` ka message client ko kyun nahi dikha? | Plain `Error` unexpected maana jata hai (generic 500). Client ko message dikhana hai to matching `AppError` subclass throw karo.                                                                     |
| Naya env var kaise add karun?                                       | `src/config/env.js` ke Zod schema mein + `.env.example` mein dono jagah; config object se hi padho, `process.env` seedha nahi.                                                                       |
| Naya route kaise add karun?                                         | `docs/modules/routing-and-http.md` -> "How to add a new route".                                                                                                                                      |
| Naya phase khatam hone par kya update karun?                        | Tests + `docs/modules/<module>.md` + matrix rows (evidence ke saath) + **README**: status, TOC, Build Log (naya phase), structure, run/endpoints, verification, roadmap, glossary, FAQ, limitations. |
| `npm audit` moderate dikhata hai                                    | Sirf Jest ke dev-time dependency chain mein; `npm audit --omit=dev` = 0. Suggested `--force` fix Jest ko downgrade karta hai, isliye nahi lagaya.                                                    |

## 16. Docs index

| Area                  | Where                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Working rules         | [CLAUDE.md](CLAUDE.md)                                                                                                                                                                                                                                             |
| Architecture overview | [docs/architecture/overview.md](docs/architecture/overview.md)                                                                                                                                                                                                     |
| Phase plan            | [docs/architecture/phases.md](docs/architecture/phases.md)                                                                                                                                                                                                         |
| ADRs                  | [docs/architecture/decisions/](docs/architecture/decisions/README.md)                                                                                                                                                                                              |
| Module docs           | [docs/modules/](docs/modules/README.md) (abhi: [application-foundation](docs/modules/application-foundation.md), [routing-and-http](docs/modules/routing-and-http.md), [middleware](docs/modules/middleware.md), [error-handling](docs/modules/error-handling.md)) |
| Runbooks              | [docs/runbooks/](docs/runbooks/README.md)                                                                                                                                                                                                                          |
| Security              | [docs/security/](docs/security/README.md)                                                                                                                                                                                                                          |
| Test strategy         | [docs/testing/](docs/testing/README.md)                                                                                                                                                                                                                            |
| Concept matrix        | [docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md)                                                                                                                                                                                 |
