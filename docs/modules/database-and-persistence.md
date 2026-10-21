# Database and Persistence (MongoDB + Mongoose)

## Purpose

The only data store: MongoDB through Mongoose. This page covers the data model and why it looks this way, how integrity is enforced without foreign keys, transactions, indexes, migrations/seed, and failure handling. There is no PostgreSQL, Prisma or SQL anywhere in the project.

## Local setup (replica set)

MongoDB multi-document transactions only work on a replica set, so even local development uses a single-node replica set from `compose.yaml` (healthcheck runs `rs.initiate` once).

```bash
cp .env.example .env     # MONGODB_URI=mongodb://127.0.0.1:27017/shopsphere?replicaSet=rs0&directConnection=true
npm run db:up            # docker compose up -d mongo (waits until healthy)
npm run db:migrate       # collections + validators + indexes (idempotent)
npm run db:seed          # sample data (idempotent)
npm run dev
```

| Command                     | What                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run db:up` / `db:down` | start / stop the container (data lives in the `shopsphere_mongo_data` volume; `docker compose down -v` wipes it) |
| `npm run db:migrate`        | apply pending migrations from `migrations/`                                                                      |
| `npm run db:status`         | list applied / pending migrations                                                                                |
| `npm run db:seed`           | upsert sample users, sellers, categories, products, reviews, wishlist, cart                                      |
| `npm run db:reset`          | drop the whole database, migrate, seed (refuses `NODE_ENV=production`)                                           |

The local container has auth disabled and is bound to `127.0.0.1` only (auth plus a replica set needs a keyFile, which is overkill for a throwaway dev database). Production uses an authenticated cluster through `MONGODB_URI` (required when `NODE_ENV=production`).

## Collections and the embedding vs referencing decision

| Collection                          | Key fields                                                                                                     | Shape decision                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `users`                             | email (unique, lowercase), name, passwordHash (`select: false`), role, status                                  | Referenced by everything else by `_id`                                                                    |
| `seller_profiles`                   | userId (unique), storeName, slug, status, approvedBy                                                           | Referenced: own lifecycle (approval)                                                                      |
| `categories`                        | slug (unique), name                                                                                            | Small, referenced; slug also **denormalized** into products                                               |
| `products`                          | sellerId, categoryId, categorySlug, sku, priceCents, currency, status, **`stock {onHand, reserved}` embedded** | Stock is embedded: one document gives atomic conditional updates (`$inc` + filter) with no transaction    |
| `reviews`                           | productId, userId, rating 1..5                                                                                 | Referenced: unbounded growth                                                                              |
| `wishlist_items`                    | userId, productId                                                                                              | One document per pair; unique index prevents duplicates                                                   |
| `carts`                             | userId, status, **`items [{productId, quantity}]` embedded**                                                   | Items are meaningless without the cart and always read with it                                            |
| `orders`                            | number, userId, totals, shippingAddress, **`items [...]` embedded snapshot**                                   | Name/sku/price are copied so old orders stay correct; `items.sellerId` multikey index serves seller views |
| `payment_attempts`                  | orderId, provider, providerReference, status, amountCents                                                      | Separate: many attempts per order, updated by webhooks                                                    |
| `refresh_tokens`, `one_time_tokens` | userId, tokenHash (unique), expiresAt                                                                          | Only SHA-256 hashes; **TTL index** deletes expired documents                                              |
| `audit_events`                      | actorId, action, entityType, entityId, metadata                                                                | Append-only; metadata must not hold secrets (repository enforces)                                         |
| `idempotency_records`               | (userId, scope, key) unique, requestHash, response                                                             | TTL on `expiresAt`                                                                                        |
| `outbox_events`                     | type, aggregate, payload, status, availableAt                                                                  | Written in the same transaction as the business change                                                    |
| `counters`                          | `_id` = sequence name, seq                                                                                     | Atomic `$inc` for order numbers                                                                           |

Rules of thumb used: embed when the child has no life outside the parent, is bounded and is read together; reference when it is shared, grows without bound, or is updated independently. Ids are `ObjectId`, exposed as 24-char hex `id` strings. Money is integer minor units (`priceCents`). No raw card data anywhere; payment attempts keep only a provider reference.

## Integrity without foreign keys

MongoDB has no FK or CHECK constraints, so each rule is enforced at the strongest layer available. **Collection validators** (`src/db/models/validators.js`, applied by migration 0001) are the server-side CHECK equivalent: they run on every write, including `$inc` and raw scripts, which Mongoose validators do not cover (verified: Mongoose update validators skip `$inc`).

| Rule                                                                                                                                                                       | Enforced by                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Unique email / (seller, sku) / (product, user) review / wishlist pair / order number / token hashes                                                                        | unique indexes (database)                                                                                                 |
| One ACTIVE cart per user; unique provider reference only when set                                                                                                          | partial unique indexes (database)                                                                                         |
| Stock >= 0, reserved >= 0, reserved <= onHand, price >= 0, rating 1..5, cart quantity 1..100, order total = subtotal + shipping + tax, email lowercase, payment amount > 0 | collection validators (database, error code 121) + Mongoose validators                                                    |
| Status/role values                                                                                                                                                         | Mongoose enums (and application code)                                                                                     |
| A referenced `userId`/`productId` actually exists                                                                                                                          | **application only** (no FKs). Services must check or accept dangling references; deletes are rare and soft by convention |
| Cart has each product once                                                                                                                                                 | Mongoose pre-validate check now; atomic add-to-cart in Phase 10                                                           |
| Order item `lineTotal = unit * quantity`, `subtotal = sum(lines)`                                                                                                          | Mongoose pre-validate (the validator covers the grand total only)                                                         |

## Repositories and layering

`route -> validate() -> controller -> service -> repository -> Mongoose`. Repositories live in `src/db/repositories/` and take the models, never `req`/`res`. They return plain serialized objects (`id` string, no `_id`/`__v`), never Mongoose documents. `users` hides `passwordHash` (`select: false`); only `findAuthByEmail` loads it. `products.list(normalizedQuery)` consumes the Phase 5 normalized query directly: sort columns come from the allowlist map, filter values are validated primitives (so no `{ "$ne": null }` operator injection), and the search text is regex-escaped (verified: `q=.*` and `(a+)+$` match nothing and return in a few ms).

## Transactions

`database.transaction(async (repositories) => { ... })` wraps Mongoose `connection.transaction` (driver `withTransaction`):

- Throw = rollback, return = commit; snapshot read concern, majority write concern, `maxCommitTimeMS` 10s.
- `transactionAsyncLocalStorage` is on, so every Mongoose operation inside the callback joins the transaction automatically. There is no `{ session }` to forget (a forgotten session silently runs outside the transaction).
- Transient conflicts are retried by the driver (verified: two conflicting transactions, callback ran 3 times, both committed). The callback can therefore run more than once: no side effects outside the database inside it, and never call external services (payment, email) in a transaction. Use the outbox instead.
- Keep transactions short; prefer a single-document atomic update when one document is enough.

Stock reservation needs no transaction: `updateOne({ _id, $expr: available >= n }, { $inc: { 'stock.reserved': n } })` is atomic. Verified: 3 parallel reservations of 2 against 3 available, exactly one wins. Phase 10 uses a transaction only when several documents must change together (order + stock + outbox).

## Indexes (query patterns)

| Index                                                                                                           | Serves                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products {status, createdAt:-1, _id:-1}` and the other catalog indexes (category, price, name, rating, seller) | public list, filters and sorts; every index ends with `_id` (sort tie-breaker). Full table and `explain()` evidence: [catalog-and-inventory.md](catalog-and-inventory.md) |
| unique `products {sellerId, sku}`, `{sellerId, status, createdAt:-1, _id:-1}`                                   | SKU uniqueness, seller's own catalog                                                                                                                                      |
| `orders {userId, createdAt:-1}`, `{status, createdAt:-1}`, `{'items.sellerId':1, createdAt:-1}`                 | order history, admin views, seller order view (multikey)                                                                                                                  |
| `outbox_events {availableAt}` partial on status in (PENDING, FAILED)                                            | worker polling; SENT events are not indexed                                                                                                                               |
| TTL on `refresh_tokens.expiresAt`, `one_time_tokens.expiresAt`, `idempotency_records.expiresAt`                 | automatic cleanup                                                                                                                                                         |

Phase 9 reworked the products indexes (migration 0002); reviews and wishlist_items got `_id`-terminated list indexes. Trade-off: every index costs write time and memory. Name search is an unindexed regex; Phase 13 adds a text index or Atlas Search. Mongoose `autoIndex` and `autoCreate` are **off**: indexes and collections are created by migrations, so an app restart never triggers a long index build on a big collection.

## Migrations

MongoDB has no built-in SQL-style migrations, so `src/db/migrations.js` is a small versioned runner: files `migrations/NNNN_name.js` export `name` and `up({ database })`; applied names are stored in `_migrations`. Migration `0001` creates every collection with its validator and syncs all schema indexes; it is idempotent. Later changes are new files (`collMod` for validators, `createIndex`/`syncIndexes`, data fixes). Run migrations as one deploy step, not from every app instance (the unique name index prevents duplicate records, not a double run).

## Failure handling

| Situation                                                                        | Behaviour                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB down at boot                                                             | server starts, `/health/ready` is `503` (`db: down`), `/health/live` stays `200`; connect retries in the background with backoff (0.5s up to 15s) and flips to `200` on its own |
| MongoDB goes down later                                                          | readiness `503`; the driver reconnects automatically; recovery needs no restart (verified)                                                                                      |
| Query while not connected                                                        | buffers for 5s, then `ServiceUnavailableError` 503 + `Retry-After`                                                                                                              |
| Duplicate key (11000)                                                            | `409 CONFLICT` "Resource already exists"                                                                                                                                        |
| Validator failure (121) / write conflict (112, transient label) / `VersionError` | `409` ("Request violates a data rule" / "Concurrent update, please retry")                                                                                                      |
| Mongoose validation / `CastError`                                                | `400` with field details; submitted values are never echoed                                                                                                                     |
| `.orFail()` miss (`DocumentNotFoundError`)                                       | `404`                                                                                                                                                                           |
| Auth failure to the database, timeouts (50, 262), network errors                 | `503`, no credentials in the response                                                                                                                                           |
| `StrictModeError`, unknown errors                                                | `500` generic; real error and stack in logs (programming bug)                                                                                                                   |

Mapping lives in `src/db/map-database-error.js` and is called by `toAppError`, so services need no try/catch. Connection logs contain only the error name and message, never the URI. Shutdown order: readiness off, HTTP server closed, then the database connection closed (a shutdown during an in-flight connect attempt waits up to the 5s server-selection timeout).

## Manual verification (repeatable)

No automated tests were written for this phase (owner's decision); this is the evidence. All were run against `mongo:8` (8.3.13) as a single-node replica set.

```bash
npm run db:up && npm run db:migrate && npm run db:status      # applies 0001 once; second `db:migrate` -> "No pending migrations"
npm run db:seed && npm run db:seed                            # same counts after two runs: users 5, sellers 3, categories 3, products 14, reviews 2, wishlist 2, carts 1
docker compose exec -T mongo mongosh --quiet shopsphere --eval '
  try { db.products.updateOne({sku:"SEED-001"}, {$inc:{"stock.onHand":-1000}}) } catch (e) { print(e.code, e.codeName) }   // 121 DocumentValidationFailure
  try { db.users.insertOne({email:"Bad@X.com", name:"n", role:"CUSTOMER", status:"ACTIVE"}) } catch (e) { print(e.code) }    // 121
  try { db.users.insertOne({email:"admin@shopsphere.test", name:"n", role:"CUSTOMER", status:"ACTIVE"}) } catch (e) { print(e.code) } // 11000
'
```

Observed: 19 constraint checks matched expectations (negative stock via `$inc`, reserved > onHand, negative price, uppercase email, rating 6, cart quantity 0, order total mismatch, payment amount 0 all `121`; duplicate email, (seller, sku), review, wishlist pair, second ACTIVE cart, repeated provider reference, duplicate order number all `11000`; a second CHECKED_OUT cart, payment attempts without a reference, and an order with a correct total were allowed).

Repository and transaction checks (a throwaway script that imported `createDatabase`; the same snippets work in `node --input-type=module`):

```js
const db = createDatabase({ uri: process.env.MONGODB_URI, logger });
await db.connect({ retry: false });
await db
  .transaction(async ({ users, outbox }) => {
    // rollback: nothing persists, no session passed
    const u = await users.create({ email: 'rb@shopsphere.test', name: 'x' });
    await outbox.enqueue({ type: 't', aggregateType: 'User', aggregateId: u.id, payload: {} });
    throw new Error('fail');
  })
  .catch(() => {}); // -> user and outbox event both absent
```

Observed: list filters/sort/pagination/search/inStock correct against the seed; regex-special searches (`.*`, `(a+)+$`, `[`, `\`) match nothing in 3 to 8 ms; commit wrote user + audit event + outbox event; rollback wrote nothing; 2 conflicting transactions both committed (3 callback runs); 20 concurrent `sequences.next` calls gave 1..20 with no duplicates; error mapping gave 409 / 404 / 400 / 500 / 503 as in the table.

Server checks with `curl localhost:3000/health/ready`: `200 {"db":"up"}`; after `docker compose stop mongo` `503 {"db":"down"}` while `/health/live` stays `200`; after `docker compose start mongo` back to `200` without restart; booting while MongoDB is stopped serves `503` then flips to `200`; `SIGTERM` exits cleanly (also while retrying, in about 3 s); no `MONGODB_URI` in development logs a warning and has no db check; `NODE_ENV=production` without it, or a non-mongodb URI, exits `1` with a readable message.

## Test database strategy (documented, not implemented)

When tests are written: use the same replica-set container with a separate database (`shopsphere_test`) selected by a test-only `MONGODB_URI`; run `db:migrate` once before the suite; give each test file its own database name or empty the collections in `beforeEach` (`deleteMany({})` keeps indexes and validators); drop the database in `afterAll` and always `await database.disconnect()` so Jest exits without open handles. Do not run tests against the development database.

## Tradeoffs

- Referential integrity to other collections is application-level. A bug can leave a dangling `productId`; deletes are therefore restricted by convention (soft-delete/archive).
- Replica set is required even locally; a plain `mongod` cannot run transactions.
- Phase 9 added rating summary fields (`ratingCount`, `ratingSum`, `ratingAverage`), status `ON_HOLD`, and migration 0002 (backfill, recompute from reviews, stricter products validator, `syncIndexes` for products/reviews/wishlist_items). `syncIndexes()` in migration 0001 drops indexes that are not in the schemas; later migrations should create or drop specific indexes explicitly.
- The shared `ConflictError` for validator failures maps a database-rule violation to `409`; it usually indicates a race, but a programming bug that bypasses service validation looks the same.
- The auth-less local container is for development only.
