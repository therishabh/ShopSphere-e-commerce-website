# Catalog and Inventory

## Purpose

The product domain, end to end: seller application and approval (built in Phase 8, see [authorization-and-sessions.md](authorization-and-sessions.md)), seller product CRUD with soft delete, a public catalog (category, search, filter, sort, pagination), concurrency-safe inventory, wishlist, and product reviews with a rating summary. Everything needs the database; the public routes need no login. Without `MONGODB_URI` these routers are empty (404).

## Rules in one place

| Rule                                                                                                     | Where it is enforced                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customers only see `ACTIVE` products, and only allowlisted fields                                        | `products.repository.js` (`publicOnly` filter), `products.public.js` (copies named fields; no spread)                                                                                          |
| Hidden product (draft, in review, rejected, on hold, archived) is `404` on detail, reviews, wishlist add | `products.service.js` (`getPublic`), `reviews.service.js`, `wishlist.service.js`                                                                                                               |
| Seller ID never comes from the client                                                                    | taken from the actor's approved seller profile (`ownership.js`)                                                                                                                                |
| Mass assignment impossible                                                                               | every body is `z.strictObject`; unknown keys (`sellerId`, `status`, `userId`, `ratingCount`, `moderationNote`...) are `400`                                                                    |
| Sort and filter allowlists                                                                               | `PUBLIC_PRODUCT_SORTABLE` (`price`, `createdAt`, `name`, `rating`); filters `category`, `minPrice`, `maxPrice`, `inStock`; anything else (`?status=`, `?sellerId=`, `?sort=password`) is `400` |
| SKU unique per seller                                                                                    | unique index `{ sellerId, sku }` -> `409`                                                                                                                                                      |
| One review per user per product                                                                          | unique index `{ productId, userId }` -> `409` (also under concurrency)                                                                                                                         |
| One wishlist row per user per product                                                                    | unique index `{ userId, productId }`; add is idempotent                                                                                                                                        |
| Suspended seller's products leave the catalog                                                            | suspend moves `ACTIVE` -> `ON_HOLD` (same transaction), reinstate moves them back                                                                                                              |

## Product lifecycle

```
DRAFT --submit--> PENDING_REVIEW --admin approve--> ACTIVE <--reinstate-- ON_HOLD (seller suspended)
  ^                    |                              |
  |                    +--admin reject--> REJECTED    +--seller archive--> ARCHIVED (also from DRAFT/PENDING/REJECTED/ON_HOLD)
  +------ edit (DRAFT or REJECTED) ------+
```

Edit rules (`products.service.js`): `DRAFT`/`REJECTED` products accept any editable field and go back to `DRAFT`; an `ACTIVE` product accepts a price-only change (stays `ACTIVE`); name/description change on `ACTIVE` is `409` because it would bypass moderation; other statuses are not editable. Archive is a soft delete (`DELETE` returns `204`, row stays so reviews and orders keep their reference).

## Inventory concurrency

Stock lives inside the product document (`stock.onHand`, `stock.reserved`; available = onHand - reserved), so every stock change is a single-document update, which MongoDB applies atomically.

| Operation                                                                            | Query                                                                                                                                              | Guard                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Seller `POST /products/:id/stock/adjust` (`delta`)                                   | `findOneAndUpdate({ _id, sellerId, status != ARCHIVED, $expr: onHand + delta >= reserved and <= 1,000,000 }, { $inc: { 'stock.onHand': delta } })` | filter fails -> `null` -> `409` |
| Seller `PUT /products/:id/stock` (absolute)                                          | filter `reserved <= newOnHand`                                                                                                                     | `409`                           |
| `reserve` (checkout, Phase 10; see [checkout-and-orders.md](checkout-and-orders.md)) | `{ _id, status: ACTIVE, $expr: onHand - reserved >= qty }` + `$inc reserved`                                                                       | no row -> `null`                |
| `release`                                                                            | `{ _id, 'stock.reserved': { $gte: qty } }` + `$inc reserved -qty`                                                                                  | double release -> `null`        |
| `commitReservation` (payment ok, Phase 10)                                           | `{ _id, reserved >= qty, onHand >= qty }` + `$inc reserved -qty, onHand -qty`                                                                      | double commit -> `null`         |
| `restock` (paid order cancelled, Phase 10)                                           | `{ _id, onHand + qty <= 1,000,000 }` + `$inc onHand +qty`                                                                                          | over the cap -> `null`          |

Two independent walls: the conditional filter, and the server-side collection validator `reserved <= onHand` (see [database-and-persistence.md](database-and-persistence.md)), which also applies to `$inc`. `inventory.service.js` exports `reserveItems`/`releaseItems`/`commitItems`/`restockItems` (Phase 10), which run several products in the caller's transaction (checkout and order transitions) ordered by product ID: any failing item aborts the transaction and the items already reserved roll back. They are also wrapped as `reserveMany`... for standalone use.

Review rating changes are also two writes (review row + product summary), so they run in a transaction (`reviews.service.js`); the summary `$inc` serializes concurrent reviews on one product (write conflict -> driver retry).

## Ratings

`products.ratingCount`, `ratingSum`, `ratingAverage` are a cache of the reviews collection (so a list page can show and sort by rating without reading reviews). The validator enforces `ratingCount >= 0` and `count <= sum <= 5 * count`. Migration 0002 backfills the fields and recomputes them from `reviews`; the seed sets them for seeded reviews.

## Indexes and why (`src/db/models/catalog.models.js`)

Every public query starts with `status: 'ACTIVE'` (equality), then the sort key, ending with `_id` (the list queries use `_id` as tie-breaker so pages never repeat or skip rows; its direction follows the sort key, `sortSpec` in the repository). Without `_id` in the index MongoDB had to sort the whole matching set in memory; the first `explain()` run showed `SORT` with 4,514 documents examined for the default list.

| Index                                                                                                             | Serves                                               |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `{ sellerId, sku }` unique                                                                                        | SKU uniqueness per seller                            |
| `{ status, createdAt -1, _id -1 }`                                                                                | default list, `inStock`, `q` search                  |
| `{ status, categorySlug, createdAt -1, _id -1 }`                                                                  | `?category=`                                         |
| `{ status, priceCents, _id }`                                                                                     | `sort=price`, price range                            |
| `{ status, categorySlug, priceCents, _id }`                                                                       | `?category=` + price sort/range                      |
| `{ status, name, _id }`                                                                                           | `sort=name`                                          |
| `{ status, ratingAverage -1, _id -1 }`                                                                            | `sort=rating`                                        |
| `{ sellerId, status, createdAt -1, _id -1 }` / `{ sellerId, createdAt -1, _id -1 }`                               | seller's own list with / without status filter       |
| reviews `{ productId, userId }` unique; `{ productId, createdAt -1, _id -1 }`; `{ productId, rating -1, _id -1 }` | duplicate guard; review list sorted by date / rating |
| wishlist_items `{ userId, productId }` unique; `{ userId, createdAt -1, _id -1 }`                                 | duplicate guard; newest-first list                   |

`explain('executionStats')` with 5,014 products (5,000 generated extra, `limit(20)`):

| Query                                 | Winning plan                                                 | Keys / docs examined                                          |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| default list                          | `LIMIT <- FETCH <- IXSCAN(status, createdAt, _id)`           | 20 / 20                                                       |
| `category=shoes`                      | `IXSCAN(status, categorySlug, createdAt, _id)`               | 20 / 20                                                       |
| `sort=price`                          | `IXSCAN(status, priceCents, _id)`                            | 20 / 20                                                       |
| category + price range + `sort=price` | `IXSCAN(status, categorySlug, priceCents, _id)`              | 20 / 20                                                       |
| `sort=name`, `sort=-rating`           | `IXSCAN(status, name, _id)` / `(status, ratingAverage, _id)` | 20 / 20                                                       |
| seller's list (with / without status) | `IXSCAN(sellerId[, status], createdAt, _id)`                 | 20 / 20                                                       |
| `q=item 12` (regex, case-insensitive) | `IXSCAN(status, createdAt, _id)`, filter on `name`           | 1,102 / 1,102 (cost grows with how rare the match is)         |
| `inStock=true` (`$expr` on stock)     | `IXSCAN(status, createdAt, _id)`                             | 24 / 24 here (cost depends on the share of out-of-stock rows) |

`countDocuments` (for `pagination.total`) still walks all matching index keys (1,504 for one category): fine now, a known cost at large scale (cache or approximate counts, Phase 13).

## Migration 0002 (`migrations/0002_catalog_ratings_and_indexes.js`)

Order matters: backfill rating fields first (otherwise the stricter validator would reject updates of old documents, because a missing field fails `$gte`), recompute from reviews, `collMod` the products validator, then `syncIndexes` for products, reviews and wishlist_items. Idempotent. Verified on a database that already had 0001 and seed data (applied), again (no-op), and on a fresh `db:reset` (0001 then 0002).

## Responses and failure modes

| Situation                                                                    | Response                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unknown / unpublished product (detail, reviews, wishlist add, review create) | `404 NOT_FOUND`                                      |
| Unknown review / wishlist item                                               | `404`                                                |
| Another seller's product or another user's review                            | `403` (and a warning log with user and resource IDs) |
| Duplicate SKU, duplicate review, duplicate category name/slug                | `409`                                                |
| Edit/submit/archive in the wrong state, stock below reserved or below zero   | `409`                                                |
| Unknown category slug on create                                              | `400` (validation, `details[].path = category`)      |
| Seller reviewing own product                                                 | `403`                                                |
| Suspended/pending seller mutating products                                   | `403 SELLER_NOT_APPROVED`                            |
| Cookie-authenticated write without CSRF token                                | `403 CSRF_TOKEN_INVALID`                             |
| Database down                                                                | `503`                                                |

## Manual verification (repeatable)

Environment: `docker compose up -d mongo redis`, `SEED_PASSWORD='local-dev-password-1' npm run db:reset` (fresh migrations 0001 + 0002 + seed: 12 `ACTIVE`, 1 `DRAFT`, 1 `PENDING_REVIEW` product, 3 categories, 2 seeded reviews and 2 wishlist rows for the customer), server started with `MONGODB_URI`, `AUTH_JWT_SECRET`, `REDIS_URL`, `SESSION_SECRET`. Representative commands (`$B` = `http://127.0.0.1:3109/api/v1`, tokens from `POST $B/auth/login` as `customer@`, `seller1@`, `seller2@`, `admin@shopsphere.test`):

```bash
curl "$B/products?category=shoes&minPrice=100000&sort=-price&limit=5"      # 200, ACTIVE only, allowlisted fields
curl "$B/products?sort=password"                                          # 400 (sort allowlist)
curl "$B/products?status=DRAFT"                                           # 400 (unknown filter)
curl "$B/products?q=.*"                                                   # 200, 0 items (regex escaped)
curl -H "authorization: Bearer $S1" -d '{"sku":"X-1",...,"sellerId":"..."}' -H 'content-type: application/json' "$B/products"   # 400 (mass assignment)
curl -X PATCH -H "authorization: Bearer $S2" -d '{"name":"x"}' "$B/products/$S1_PRODUCT"        # 403 (wrong owner)
curl -X POST -H "authorization: Bearer $S1" -d '{"delta":-5}' "$B/products/$ID/stock/adjust"    # 200 or 409 below reserved
curl -X POST -H "authorization: Bearer $CUSTOMER" -d '{"rating":5}' "$B/products/$ID/reviews"   # 201, again -> 409
curl -X PUT -H "authorization: Bearer $CUSTOMER" "$B/wishlist/$ID"                              # 201, again -> 200
```

Observed with a scripted run of 172 checks against the real server, MongoDB 8.3.13 replica set and Redis (all passed):

- **Public catalog:** only the 12 `ACTIVE` seed products; no `sellerId`, `sku`, `stock`, `moderationNote`; pagination (page 3 of 12 at limit 5 = 2 items, past the end = 200 with empty items, `limit=101`/`page=0` = 400); category, price range, `inStock` true/false (9/3), `sort` price asc/desc and rating, case-insensitive search, regex characters escaped; 11 invalid queries all `400`; detail of draft/in-review products `404`.
- **Seller flow and ownership:** create `201` `DRAFT` with `Location`; same SKU twice `409`, same SKU for another seller `201`; five mass-assignment attempts `400`; unapproved seller, customer, admin cannot create; seller 2 gets `403` on read, patch, stock, adjust, submit, archive of seller 1's product and the document stays unchanged; submit -> admin approve -> public; renaming an `ACTIVE` product `409`, price-only `200`.
- **Inventory:** 40 concurrent `+1`/`-1` adjusts over HTTP leave `onHand` exactly 100; 30 concurrent `+2` give exactly 160; 25 concurrent reserves of 1 on stock 10 give exactly 10 winners and 15 `409`, `reserved = 10`; reduce below reserved `409`; double release `409`; two simultaneous two-product reservations for the last unit: one wins, the loser's reservation of the second product rolls back; a draft product cannot be reserved. Outside a transaction (repository level, 200 concurrent ops, 3 runs) the naive read-modify-write ended at 99 every time while `$inc` with the guarded filter ended at exactly 100; 50 concurrent `reserve(1)` on stock 10 -> exactly 10 succeed.
- **Reviews:** 401 without token, admin `403`, ratings 0/4.5/6 `400`, seller on own product `403`, hidden product `404`; summary avg/count correct after create, edit, delete and admin removal (back to 0); 8 concurrent identical reviews -> 1 `201`, 7 `409`, count 1; two concurrent reviewers -> count 2 avg 3.5; reviewer shown by name only (no user ID, no email); wrong-owner edit/delete `403`.
- **Wishlist:** per user; add `201`, again `200`, no duplicate; 8 concurrent adds -> one row; hidden/archived/bad IDs `404`/`400`; remove `204`, again `404`; an archived product disappears from the list and `total` stays consistent; sellers can use it, admin `403`.
- **Admin:** category create `201`, duplicate name/slug `409`, customer `403`; suspending a seller hides its 6 `ACTIVE` products from `/products` (audit `productsAffected = 6`), reinstating brings them back, suspended seller cannot create; audit has `product.archived`, `product.stock_adjusted`, `category.created`, `review.removed`, `seller.suspended`, no secrets.
- **Cookie path:** `PUT /wishlist/:id` with a session cookie and no CSRF token `403 CSRF_TOKEN_INVALID`, with the token `200/201`; reads need no token.
- **Server log:** 296 lines, no level >= 50, none of password/token/CSRF values.
- Existing suite: `npm test` 390/390, `npm run lint`, `npm run format:check` clean.

Mutation checks (each applied, verified applied, then restored):

| Mutation                                                                   | Result                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| public `status: ACTIVE` filter widened to include `DRAFT`/`PENDING_REVIEW` | 12 checks fail (hidden products leak)                                                                         |
| public serializer spreads the whole product                                | 3 checks fail (internal fields leak)                                                                          |
| review ownership check removed in the service                              | still safe (query filter `userId` returns 404 instead of 403); 2 checks fail on status code                   |
| ownership removed in service **and** query filter                          | attacker edits (200) and deletes (204) another user's review                                                  |
| unique review index dropped                                                | 8 concurrent identical reviews all `201`; count 9                                                             |
| `reserve` guard removed from the filter                                    | validator wall still prevents oversell (`reserved = 10`) but errors are no longer clean `409`s; 2 checks fail |

## Tradeoffs and limits

- Search is a case-insensitive substring regex on `name` (escaped, so `.*` or `(a+)+$` are literals): it matches partial words but cannot use an index for the match itself. Text index / Atlas Search is Phase 13.
- Offset pagination plus `total` count: deep pages and big counts get slower (page capped at 10,000).
- `inStock` uses `$expr` on two fields and cannot use a stock index; denormalize `available` if it becomes hot.
- Reviews are open to any logged-in customer/seller (not "verified purchase"); linking reviews to delivered orders is not done yet.
- `reserve`/`release` are used by checkout (Phase 10); stuck reservations of unpaid orders are released by the admin-triggered reconcile, a scheduled job comes in Phase 14.
- Seller product list sorted by price or name (not by created date) sorts in memory within one seller's products.
- Rating summary is a cache; if it ever drifts, migration 0002's recompute query rebuilds it from `reviews`.
