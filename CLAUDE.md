# ShopSphere — Working Rules for Claude

ShopSphere is a production-style multi-vendor e-commerce backend (customers, sellers, admins). These rules apply to every phase. The phase list is in `docs/architecture/phases.md`; the coverage tracker is `docs/coverage/EXPRESS_CONCEPT_MATRIX.md`.

## Process

- Work in small phases. Implement only the phase requested. Never skip ahead, and never replace implementation with a plan.
- Before editing, read the relevant files (and README, architecture overview, matrix at the start of a phase). Preserve working code.
- If blocked, state the exact blocker. Do not silently skip or stub the work.
- Check official docs for version-sensitive APIs (Express 5, Mongoose/MongoDB driver, BullMQ, Socket.IO, OIDC libraries). Pin dependencies via the lockfile and explain important choices in docs.

## Fixed decisions

- Node.js current LTS, Express 5, modern JavaScript ES modules. No TypeScript.
- Modular monolith; a separate worker process lives in the same repo. No microservices without a demonstrated reason.
- **MongoDB + Mongoose is the only core database.** No PostgreSQL, Prisma or SQL anywhere in the project (owner's decision). Transactions need a replica set, so local dev runs a single-node replica set (Docker). Integrity that SQL would enforce with foreign keys/CHECK constraints is enforced with schema validators, unique/partial indexes, atomic conditional updates and transactions, and documented as such.
- Redis (cache, queues, sessions), BullMQ (jobs), Socket.IO (realtime), S3-compatible storage behind an adapter.
- Jest + Supertest, Zod, Pino, Helmet, explicit CORS, rate limiting, OpenAPI, Docker, Nginx example.
- Payments, email and other external services use **mock/test providers** in development and tests. Never use real payment credentials, real card data, or live transactions.
- The Express 4 comparison lives only in `labs/express-v4-compat` with its own manifest. Never mix Express majors in the main runtime.

## Code standards

- Clear module boundaries, small cohesive modules, no unnecessary abstractions.
- No business logic in controllers. Controllers translate HTTP to service calls; services hold rules; repositories hold data access.
- Validate all input explicitly (Zod) before controllers run. Secure defaults. Useful, safe error messages.
- No secrets in source. Config comes from validated environment variables; commit only `.env.example`.
- Never log passwords, tokens, cookies, reset links or sensitive bodies.
- No feature TODOs, stubs, fake success responses, empty handlers, or untested placeholder implementations. Empty route modules are allowed only if valid and wired.

## Code comments

- **Every file under `src/`** carries detailed **Hinglish** comments so a fresher can understand it. Model files: `src/config/env.js`, `src/server.js`, `src/app.js`.
- **Tests do not get new comments** (owner's decision). The comments already present in existing test files and JS config files stay as they are; do not remove them, and do not add new ones in new or edited tests/config files (test names should be descriptive instead).
- Start each file with a short comment on its purpose and where it fits. Explain the _why_ behind design and ordering, and explain library behaviour a newcomer may not know (e.g. what a Zod method does, why an error middleware has 4 arguments). Skip pure trivia.
- Keep code identifiers, commands and error text in English; comments in Hinglish. Apply this to every new or edited file under `src/` in every future phase.
- Comments must never change behaviour. When adding comments to existing code, verify the code is unchanged (e.g. compare ASTs with and without comments), then run lint, format and tests.

## Testing and verification

- **Do not write new tests** (owner's decision: the current focus is development, not testing). Do not create new test files or add test cases. Existing tests and helpers stay; keep them passing, and change an existing test only when a deliberate behaviour change breaks it (minimal edit). This overrides any phase prompt that asks for tests.
- Without new automated tests, record evidence as a **repeatable manual verification** (exact curl/commands and their observed results) in the module doc and README. A concept with only manual evidence can be `documented`; mark it `verified` only if its checks are repeatable and were actually run (a documented command sequence counts).
- Run the existing tests, lint, format and build/check scripts that exist. Report the actual commands and results. Never claim a command passed unless it ran successfully; label environment-dependent checks (Postgres, Redis, Docker) as such.
- Fix failing or flaky tests instead of skipping them. If a skip is unavoidable, record the reason.

## Documentation

- After **every** implementation phase, update `README.md` before finishing, plus focused docs under `docs/` and the concept matrix.
- **README is the complete, self-contained project guide** (this replaces any earlier "keep README short" rule). The owner should be able to read only the README and understand the whole project, and reuse it as a recipe to build another project.
  - Language: **Hinglish** (Hindi in Roman script mixed with English technical terms). Audience: owner **plus any new developer or fresher** who must be able to understand the whole project and its code from the README. Explain each concept the project uses in a line or two (key concepts section), but skip trivia (what npm is, how to install Node) and don't be childish.
  - Top of the file: a **"README kaise padhein"** reading guide (paths by goal) and a **Table of Contents** covering the whole project. Keep both current when sections are added.
  - Keep these sections current every phase: quick start, code reading order, the end-to-end request walkthrough (update it when the pipeline changes), key concepts glossary (add new concepts introduced in the phase), FAQ/troubleshooting (add real errors hit during the phase).
  - Keep a chronological **Build Log**: one section per phase, with the steps in the exact order they were done (kya kiya, kis sequence mein, kyun), the exact commands run, and **code snippets** wherever they clarify the implementation. Append the new phase; do not rewrite history except to fix errors.
  - Also keep current: project structure, how to run, scripts, decisions and their reasons, verification results (actual commands/outcomes only), known limitations, roadmap status.
  - Length is not a concern; completeness and accuracy are. Snippets must match the real code. Never describe something as done if code or tests are missing.
- Detailed per-module pages still live in `docs/modules/`, architecture rationale and ADRs in `docs/architecture/`, operating instructions in `docs/runbooks/`, security in `docs/security/`, test strategy in `docs/testing/`. README links to them but must stay understandable without them.
- Docs under `docs/` stay concise and written for an experienced developer. Never document a feature as complete if its code or tests are missing.

## Concept matrix rule

**No concept is complete until all evidence exists:** implementation/demo, automated test or repeatable verification, focused documentation, and exact paths/commands for each. A concept is `verified` only after its checks have actually been run and passed. Advance statuses only on evidence, one step at a time:
`planned → in progress → implemented → tested → documented → verified`.
