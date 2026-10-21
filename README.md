# ShopSphere

Multi-vendor e-commerce backend (customers, sellers, admins). Express 5 + ESM JavaScript, PostgreSQL + Prisma, Redis, BullMQ, Socket.IO.

> Ye README poora project guide hai. Har phase ke baad update hoti hai: kya banaya, kis sequence mein, kyun, aur kaunse commands/snippets use hue. Sirf ise padh ke poora project samajh aa jana chahiye, aur isi ko recipe ki tarah follow karke doosra project bhi banaya ja sake.

**Current status: Phase 2 complete** (foundation + `/api/v1` routing, parsing, status codes, static, safe 404). Business endpoints (auth, products, orders) abhi nahi bane; module routers khaali hain.

---

## Table of Contents

1. [Project ka overview](#1-project-ka-overview)
2. [Tech stack aur fixed decisions](#2-tech-stack-aur-fixed-decisions)
3. [Working rules (CLAUDE.md) aur workflow](#3-working-rules-claudemd-aur-workflow)
4. [Build Log (phase by phase)](#4-build-log-phase-by-phase)
   - [Phase 0 — Guardrails aur docs skeleton](#phase-0--guardrails-aur-docs-skeleton)
   - [Phase 1 — Application foundation](#phase-1--application-foundation)
   - [Phase 2 — HTTP fundamentals aur routing](#phase-2--http-fundamentals-aur-routing)
5. [Current project structure](#5-current-project-structure)
6. [Run kaise karein (setup, scripts)](#6-run-kaise-karein-setup-scripts)
7. [Verification results (ab tak)](#7-verification-results-ab-tak)
8. [Roadmap (Phase 0–25)](#8-roadmap-phase-025)
9. [Concept coverage matrix ka status](#9-concept-coverage-matrix-ka-status)
10. [Is project ko recipe ki tarah reuse karna](#10-is-project-ko-recipe-ki-tarah-reuse-karna)
11. [Known limitations / tradeoffs](#11-known-limitations--tradeoffs)
12. [Docs index](#12-docs-index)

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

Is repo ka secondary goal: har Express concept (middleware, error handling, `next('route')`, `res.headersSent`, trust proxy, streams, etc.) code + test + doc ke saath demonstrate karna. Isliye ek coverage matrix maintain hota hai (section 9).

## 2. Tech stack aur fixed decisions

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

## 3. Working rules (CLAUDE.md) aur workflow

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

## 4. Build Log (phase by phase)

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

**Step 5 — 4xx errors ka interim handler (`src/http/client-errors.js`).** Problem: malformed JSON, oversized body ya undecodable URL param par Express ka default handler non-production mein stack trace wala HTML deta. Isliye chhota handler jo sirf 4xx ko fixed message ke saath JSON mein map karta hai; baaki errors `next(err)` se aage jaate hain.

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

## 5. Current project structure

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
│   ├── health/
│   │   ├── readiness.js          # createReadiness()
│   │   └── health.routes.js      # /health/live, /health/ready
│   ├── routes/api.routes.js      # /api/v1: parsers + module mounts (+ examples, non-prod)
│   ├── modules/<name>/<name>.routes.js   # auth users sellers products cart orders admin (empty, mounted)
│   ├── http/                     # not-found.js, client-errors.js, route-guards.js
│   └── examples/http-examples.routes.js  # teaching endpoints, /api/v1/examples, non-prod only
├── public/example.txt            # served at /static
├── tests/
│   ├── unit/        config.test.js, readiness.test.js
│   └── integration/ health, server, routing, static .test.js
└── docs/
    ├── architecture/ (overview.md, phases.md, decisions/)
    ├── coverage/EXPRESS_CONCEPT_MATRIX.md
    ├── modules/ application-foundation.md, routing-and-http.md
    └── runbooks/ security/ testing/   # abhi sirf index
```

Planned: `src/worker.js`, `prisma/`, `labs/`, `deploy/`. Layout Phase 2+ mein evolve ho sakta hai.

## 6. Run kaise karein (setup, scripts)

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

Environment variables: `NODE_ENV` (`development\|test\|production`, default `development`), `HOST` (default `127.0.0.1`), `PORT` (default `3000`, `0` = ephemeral).

Endpoints abhi:

| Endpoint                                                    | Response                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health/live`                                          | `200 {"status":"live"}`                                                                                                                                |
| `GET /health/ready`                                         | `200 {"status":"ready","checks":{}}`, ya `503` (`not_ready` / `shutting_down`)                                                                         |
| `GET /static/example.txt`                                   | `200 text/plain` (`express.static`, `public/`)                                                                                                         |
| `/api/v1/{auth,users,sellers,products,cart,orders,admin}/*` | `404` abhi (modules khaali)                                                                                                                            |
| `/api/v1/examples/*`                                        | Teaching endpoints (non-production only): `ping`, `echo/:value`, `echo/json`, `echo/form`, `old-notes`, `notes`, `notes/:id`, `notes/:noteId/comments` |
| anything else                                               | `404 {"error":{"code":"NOT_FOUND","message":"Resource not found"}}`                                                                                    |

## 7. Verification results (ab tak)

Phase 2 ke end par actual run hue commands (Phase 1 ke checks bhi included):

| Command                                                       | Result                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                    | 6 suites, 81 tests passed                                      |
| `npm run lint`                                                | clean                                                          |
| `npm run format:check`                                        | clean                                                          |
| `node src/server.js` + curl (`/health/live`, `/health/ready`) | dono 200; SIGTERM par exit                                     |
| `npm run dev` + temp `.env`                                   | `.env` load hua, `/health/ready` 200                           |
| `npm audit --omit=dev`                                        | 0 vulnerabilities                                              |
| `npm audit`                                                   | dev-only (Jest chain) moderate advisories, fix apply nahi kiya |

Phase 2 extras: ordering test ka mutation check (order badalne par 1 test fail, restore par pass); real server par curl smoke (201+Location, static 200, 301, 405, module 404).

Environment-dependent checks (Postgres, Redis, Docker) abhi applicable nahi.

## 8. Roadmap (Phase 0–25)

| #   | Phase                                                       | Status  |
| --- | ----------------------------------------------------------- | ------- |
| 0   | Guardrails                                                  | done    |
| 1   | Foundation (app/server, config, health)                     | done    |
| 2   | HTTP & routing (`/api/v1`, params/query/body, static, 404)  | done    |
| 3   | Middleware pipeline, request IDs, `res.locals`, `req.app`   | next    |
| 4   | Error handling (hierarchy, `headersSent`)                   | planned |
| 5   | Validation, pagination, OpenAPI + Swagger                   | planned |
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

## 9. Concept coverage matrix ka status

[docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md): 235 concepts. Abhi sections 1 (Foundation, 7) aur 2 (HTTP & routing, 14) `verified` (21 concepts); baaki sab `planned`. Har phase ke baad sirf evidence-backed rows update hote hain.

## 10. Is project ko recipe ki tarah reuse karna

Naye Express 5 project ke liye Phase 0 + 1 + 2 ka reusable sequence:

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

## 11. Known limitations / tradeoffs

- Graceful shutdown abhi minimal hai (server close + readiness 503). Request draining with deadline aur ordered dependency close Phase 19 mein.
- `/health/ready` abhi koi real dependency check nahi karta (koi dependency hai hi nahi); DB check Phase 6 mein.
- 404 aur 4xx handling (`notFound`, `clientErrorHandler`) interim hai: sirf 4xx map hote hain, unexpected 5xx par Express ka default handler chalta hai. Central error hierarchy Phase 4 mein.
- `/api/v1/examples` abhi inline Zod use karta hai; shared validation + response convention Phase 5 mein. Examples in-memory hain aur production mein mount nahi hote.
- Query values strings hote hain; typed coercion/validation Phase 5 mein.
- Logging abhi `console` hai; structured Pino logging Phase 3/19 mein.
- Jest ESM experimental warning print karta hai.
- `.env` change hone par `npm run dev` auto-restart nahi karta (`--watch` sirf imported files dekhta hai); manually restart karo.

## 12. Docs index

| Area                  | Where                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working rules         | [CLAUDE.md](CLAUDE.md)                                                                                                                                                 |
| Architecture overview | [docs/architecture/overview.md](docs/architecture/overview.md)                                                                                                         |
| Phase plan            | [docs/architecture/phases.md](docs/architecture/phases.md)                                                                                                             |
| ADRs                  | [docs/architecture/decisions/](docs/architecture/decisions/README.md)                                                                                                  |
| Module docs           | [docs/modules/](docs/modules/README.md) (abhi: [application-foundation](docs/modules/application-foundation.md), [routing-and-http](docs/modules/routing-and-http.md)) |
| Runbooks              | [docs/runbooks/](docs/runbooks/README.md)                                                                                                                              |
| Security              | [docs/security/](docs/security/README.md)                                                                                                                              |
| Test strategy         | [docs/testing/](docs/testing/README.md)                                                                                                                                |
| Concept matrix        | [docs/coverage/EXPRESS_CONCEPT_MATRIX.md](docs/coverage/EXPRESS_CONCEPT_MATRIX.md)                                                                                     |
