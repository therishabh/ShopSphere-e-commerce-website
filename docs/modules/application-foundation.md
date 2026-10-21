# Application Foundation

## Purpose

Process skeleton every later module plugs into: validated config, an Express app factory, a server entrypoint, and health endpoints.

## `app.js` vs `server.js`

|              | `src/app.js`                                      | `src/server.js`                                        |
| ------------ | ------------------------------------------------- | ------------------------------------------------------ |
| Exports      | `createApp({ config, readiness })`                | `startServer(config, { readiness })`                   |
| Does         | Builds routers/middleware, returns an Express app | Calls `app.listen`, owns the port and shutdown         |
| Side effects | None: no port, no `process.env`, no I/O at import | Binds a port; entrypoint reads env and handles signals |
| Tested via   | Supertest directly against the app                | Real ephemeral port (`PORT=0`)                         |

Why: tests build the app in-process with injected config and fake dependencies, and never need a port. Everything process-level (env, signals, exit codes) stays in `server.js`, which only runs `main()` when executed directly, so importing it in tests is safe.

## Startup flow

1. `loadConfig()` validates `process.env` with Zod. Invalid config prints every problem and exits `1` before anything starts.
2. `startServer()` creates the readiness tracker and the app, then listens. It resolves once the port is bound and rejects on bind errors (e.g. `EADDRINUSE`); `main()` exits `1` on rejection.
3. On `SIGTERM`/`SIGINT`, readiness flips to `shutting_down` (503), then the server closes. Draining with a deadline and closing dependencies in order is deferred to the observability/reliability phase.

## Environment strategy

- Config is parsed once into a frozen object and passed in; nothing else reads `process.env`.
- `loadConfig(env)` takes its source as an argument, so tests pass plain objects.
- Variables: `NODE_ENV` (`development|test|production`, default `development`), `HOST` (default `127.0.0.1`), `PORT` (default `3000`, `0` = ephemeral).
- `dotenv` is called only in `main()` of `src/server.js` (`dotenv.config({ quiet: true })`), never at import time, so tests and `createApp` are unaffected by a local `.env`. It does not override variables already set, so real environment variables win in production. Only `.env.example` is committed.
- New variables are added to the Zod schema in `src/config/env.js` and `.env.example` together.

## Health endpoints

| Endpoint            | Meaning                                                                          | Responses                       |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `GET /health/live`  | Process is up. Never checks dependencies, so an outage doesn't trigger restarts. | `200 {status:"live"}`           |
| `GET /health/ready` | Safe to route traffic: not shutting down and every required dependency is up.    | `200` or `503 {status, checks}` |

Readiness (`src/health/readiness.js`) runs registered named async checks in parallel, each with a timeout (default 2s); a rejection or timeout is `down`. Phase 1 has no dependencies, so it reports ready whenever the process is not shutting down. The database phase registers a `db` check (Redis later), at which point a database outage turns `/health/ready` into 503. Nothing is hard-coded to "healthy".

## Important files

`src/config/env.js`, `src/app.js`, `src/server.js`, `src/health/{readiness,health.routes}.js`; tests in `tests/unit/{config,readiness}.test.js` and `tests/integration/{health,server}.test.js`.

## Failure modes

- Bad config: exit `1`, message lists all invalid fields.
- Port in use: startup rejects, exit `1`.
- Dependency down: `/health/ready` 503 with the failing check named; `/health/live` stays 200.
- Hung dependency: check times out and counts as `down`.

## Commands

```
npm run dev | start | test | lint | format | format:check
```

## Tradeoffs and choices

- Dependencies are pinned exactly (`save-exact`) and `package-lock.json` is committed. Express `5.3.0`, Zod `4.6.7`; Node `>=24` (current LTS at time of writing).
- Jest runs native ESM via `--experimental-vm-modules` (prints an experimental warning; no Babel transform). Import `jest` from `@jest/globals` in tests that need it.
- `npm audit` reports moderate advisories only in Jest's dev-time dependency chain; production dependencies report none. The offered fix downgrades Jest, so it is not applied.
