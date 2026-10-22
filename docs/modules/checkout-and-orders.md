# Checkout and Orders

## Purpose

Cart, server-side pricing, idempotent checkout, mock payment, the order state machine, seller fulfilment, admin order desk and the reconcile job for stuck payments/refunds (Phase 10). Everything is MongoDB + Mongoose; the payment provider is a mock adapter (`src/payments/mock-payment-provider.js`), no real card data or credentials anywhere.

## Rules in one place

| Rule                                                                        | Where it is enforced                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The client never sends or controls prices, totals, items, user or seller    | cart stores only `(productId, quantity)`; `z.strictObject` bodies (`price`, `totalCents`, `items`, `userId`... are `400`); checkout body is address + payment token only                        |
| Price, name, SKU, seller and status come from the database at checkout time | `cart-pricing.js` (`priceCart`), used by both `GET /cart` and checkout inside the transaction; order stores an immutable snapshot                                                               |
| One checkout creates one order per (seller, currency)                       | `orders.service.js` (`placeOrders`): group key `sellerId\|currency`; each order has one seller, so the state machine maps to one fulfiller                                                      |
| Stock is reserved atomically, never oversold                                | `products.repository.js` (`reserve`: conditional `$inc` guarded by `onHand - reserved >= qty`) + validator `reserved <= onHand`                                                                 |
| Multi-product reserve is all-or-nothing                                     | `reserveItems` runs inside the checkout transaction; any failure rolls back every earlier reserve, the orders and the cart change                                                               |
| Same `Idempotency-Key` never creates a second order                         | unique index `{ userId, scope, key }` on `idempotency_records` (claim = insert); replay returns the stored response                                                                             |
| Same key with a different body is rejected                                  | `requestHash` (SHA-256 of canonical JSON of the body) compared on replay -> `422 IDEMPOTENCY_KEY_REUSED`                                                                                        |
| No external call inside a database transaction                              | provider `charge`/`refund` run between short transactions (`settlePayment`, `refundPayment`)                                                                                                    |
| Every status change goes through one function                               | `applyTransition`: rule check (`order-state.js`), conditional update `status: from`, stock effect, payment attempt settle, audit event and outbox event in one transaction                      |
| Invalid transitions are rejected                                            | edge missing -> `409 INVALID_ORDER_TRANSITION`; edge exists but the actor kind may not use it -> `403 TRANSITION_NOT_ALLOWED`; concurrent change -> `409 ORDER_STATE_CHANGED`                   |
| Orders are private                                                          | customer reads `userId = actor`; seller reads `sellerId = own profile` and only statuses after payment; someone else's order id is `404`                                                        |
| Audit trail for important transitions                                       | `order.created`, `order.paid`, `order.payment_failed`, `order.processing`, `order.shipped`, `order.delivered`, `order.cancelled`, `order.refunded`, `payment.refunded`, `payment.refund_failed` |

## Checkout flow

```
POST /api/v1/orders   Idempotency-Key: <uuid>   { shippingAddress, paymentToken? }
  1. claim idempotency key (insert; duplicate -> replay / 422 / 409 IN_PROGRESS)           [no transaction]
  2. TRANSACTION 1 (database only, short)
       read ACTIVE cart -> price lines from current products -> validate every line
       reserve stock (atomic conditional $inc per product, sorted by productId)
       per (seller, currency): create order PENDING_PAYMENT + payment attempt PENDING + audit + outbox
       cart ACTIVE -> CHECKED_OUT (conditional)
     any throw = ROLLBACK of all of it; the idempotency key is released so the same key can be retried
  3. per order, OUTSIDE any transaction: payments.charge(...)  (10 s timeout)
  4. per order, small TRANSACTION 2: apply the outcome
       SUCCEEDED          -> PAID            stock committed (onHand -n, reserved -n), attempt SUCCEEDED
       DECLINED           -> PAYMENT_FAILED  stock released (reserved -n),             attempt FAILED
       provider unreachable / timeout (outcome unknown) -> order stays PENDING_PAYMENT, stock stays reserved
  5. store final status + body on the idempotency record; later retries get exactly that response
```

Response: `{ checkoutId, paymentStatus, orders: [...] }` with HTTP `201` (all paid), `202` (any order still pending), `402` (declined, or partly declined). A replay returns the stored status/body plus header `Idempotent-Replayed: true`.

Why orders are split per seller: a single order with items from two sellers would need item-level fulfilment status ("who ships first?"). One order = one seller keeps the state machine, seller views, cancellation and refunds simple. Payment is per order (a decline of one order does not undo another; `paymentStatus: PARTIAL` shows that).

## Stock life cycle

```
reserve   (checkout)            reserved +n                         onHand same
commit    (payment ok)          reserved -n, onHand -n              item left the warehouse
release   (decline / expiry)    reserved -n
restock   (paid order cancelled before delivery)   onHand +n
```

All four are atomic conditional updates (`reserve`, `release`, `commitReservation`, `restock` in `products.repository.js`); a guard that fails returns `null` and the service raises `409` (double commit / double release bugs surface instead of corrupting counts). `inventory.service.js` exports plain functions (`reserveItems`...) that run inside the caller's transaction, because MongoDB has no nested transactions.

## Order state machine (`src/modules/orders/order-state.js`)

```
PENDING_PAYMENT --payment ok--> PAID --seller--> PROCESSING --seller--> SHIPPED --seller/admin--> DELIVERED --admin--> REFUNDED
      |   \--decline--> PAYMENT_FAILED (terminal)      |   \--customer/admin--> CANCELLED       \--admin--> CANCELLED
      \--system expiry--> CANCELLED (terminal)
```

| From              | To               | Allowed actor kinds | Side effects                                        |
| ----------------- | ---------------- | ------------------- | --------------------------------------------------- |
| `PENDING_PAYMENT` | `PAID`           | SYSTEM              | stock commit, attempt `SUCCEEDED`                   |
| `PENDING_PAYMENT` | `PAYMENT_FAILED` | SYSTEM              | stock release, attempt `FAILED`                     |
| `PENDING_PAYMENT` | `CANCELLED`      | SYSTEM (reconcile)  | stock release, attempt `FAILED` (`EXPIRED`)         |
| `PAID`            | `PROCESSING`     | SELLER, ADMIN       | -                                                   |
| `PAID`            | `CANCELLED`      | CUSTOMER, ADMIN     | restock, then refund                                |
| `PROCESSING`      | `SHIPPED`        | SELLER, ADMIN       | -                                                   |
| `PROCESSING`      | `CANCELLED`      | ADMIN               | restock, then refund                                |
| `SHIPPED`         | `DELIVERED`      | SELLER, ADMIN       | -                                                   |
| `DELIVERED`       | `REFUNDED`       | ADMIN               | refund, no restock (returned goods need inspection) |

The actor _kind_ comes from the endpoint, not the user's role (a seller cancelling their own purchase is a CUSTOMER action). No endpoint produces SYSTEM; `PAID`, `PAYMENT_FAILED` and `PENDING_PAYMENT` cannot be set through any request body (Zod enums exclude them). `CANCELLED`, `PAYMENT_FAILED` and `REFUNDED` are terminal. Two layers: `assertTransition` (rules) and `orders.repository.js` `transition` (`findOneAndUpdate` with `status: from` in the filter), so two simultaneous valid requests produce exactly one winner.

## Idempotency details

- Header `Idempotency-Key` (16-128 chars of `A-Za-z0-9._:-`) is required on `POST /orders` (`idempotency-key.js`).
- Scope `orders.create`, per user; records expire after 24 h (TTL index on `expiresAt`).
- First request claims the key (`IN_PROGRESS`). A concurrent duplicate gets `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1`; after completion it gets the stored response. Even if that logic were wrong, the unique index would still stop a second order (verified by mutation below).
- If the request fails before any order exists (empty cart, stock, validation, rollback, crash), the record is deleted, so fixing the cart and retrying with the same key works.
- If a request dies after orders exist (e.g. process crash during payment), the record stays `IN_PROGRESS` until it expires: retries get `409` instead of risking duplicates; reconcile cancels the stuck orders.

## Reconcile (`POST /api/v1/admin/orders/reconcile`)

Admin-triggered for now; the Phase 14 scheduled worker will call the same service method.

1. Orders `PENDING_PAYMENT` for longer than `olderThanMinutes` (default 15, far above the 10 s provider timeout) become `CANCELLED`, stock released, attempt `FAILED/EXPIRED`.
2. Orders `CANCELLED`/`REFUNDED` whose payment attempt is still `SUCCEEDED` (the provider refund failed earlier) get the refund retried. Invariant: attempt `SUCCEEDED` + order `CANCELLED`/`REFUNDED` = refund owed (`payment.refundPending: true` in the API).

## Endpoints

| Method and path                                     | Who                                  | Notes                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /cart`                                         | customer, seller (`cart:manage:own`) | server prices, per-line `status` (`OK`, `UNAVAILABLE`, `INSUFFICIENT_STOCK`, `OWN_PRODUCT`, `NOT_PURCHASABLE`), `totals` per currency, `checkoutReady` |
| `POST /cart/items`                                  | same                                 | `{ productId, quantity }`; new line `201`, merged `200`; hidden product `404`; own product `403`; > 100 units `409`                                    |
| `PATCH /cart/items/:productId`                      | same                                 | `{ quantity }` absolute; missing line `404`                                                                                                            |
| `DELETE /cart/items/:productId`, `DELETE /cart`     | same                                 | line `404` if absent; clear `204`                                                                                                                      |
| `POST /orders`                                      | customer, seller (`order:create`)    | header `Idempotency-Key`; body `{ shippingAddress, paymentToken? }`                                                                                    |
| `GET /orders`, `GET /orders/:orderId`               | owner (`order:read:own`)             | list: pagination, `?status=`, sort `createdAt`/`total`; detail adds payment summary and timeline                                                       |
| `POST /orders/:orderId/cancel`                      | owner (`order:cancel:own`)           | only `PAID`; others `409`/`403`                                                                                                                        |
| `GET /orders/seller`, `GET /orders/seller/:orderId` | seller (`seller:order:read:own`)     | own orders after payment; items + shipping address; no customer id, payment or checkout id                                                             |
| `PATCH /orders/seller/:orderId/status`              | seller (`seller:order:fulfil`)       | `{ status: PROCESSING \| SHIPPED \| DELIVERED }`                                                                                                       |
| `GET /admin/orders`, `GET /admin/orders/:orderId`   | admin (`admin:order:read`)           | detail includes `userId`, `sellerId`                                                                                                                   |
| `PATCH /admin/orders/:orderId/status`               | admin (`admin:order:manage`)         | `{ status, reason? }`: `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`                                                                   |
| `POST /admin/orders/reconcile`                      | admin (`admin:order:manage`)         | `{ olderThanMinutes? }`                                                                                                                                |

`paymentToken` is an opaque mock token: `tok_mock_success` (default), `tok_mock_decline`, `tok_mock_error` (provider unreachable, outcome unknown). Anything else is `400`; it is never stored, logged or audited.

## Failure modes

| Situation                                      | Result                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Missing/malformed `Idempotency-Key`            | `400 IDEMPOTENCY_KEY_REQUIRED`                                                                           |
| Empty or already checked-out cart              | `409 CART_EMPTY`                                                                                         |
| A line is unavailable, over stock, own product | `409 CHECKOUT_INVALID` with one `details` entry per line; nothing reserved, cart unchanged, key released |
| Last unit taken by a concurrent checkout       | loser `409` (`Insufficient stock...`), its partial reservations rolled back                              |
| Same key, different body                       | `422 IDEMPOTENCY_KEY_REUSED`                                                                             |
| Same key still running                         | `409 IDEMPOTENCY_IN_PROGRESS` + `Retry-After`                                                            |
| Card declined                                  | `402`, order `PAYMENT_FAILED`, stock released                                                            |
| Provider unreachable                           | `202`, order `PENDING_PAYMENT`, stock stays reserved until reconcile                                     |
| Invalid / forbidden / concurrent transition    | `409 INVALID_ORDER_TRANSITION` / `403 TRANSITION_NOT_ALLOWED` / `409 ORDER_STATE_CHANGED`                |
| Someone else's order id                        | `404` (not `403`: order ids are private, existence is not revealed)                                      |
| Refund call fails after a cancel               | order stays `CANCELLED`, `payment.refundPending: true`, audit `payment.refund_failed`, reconcile retries |

## Migration 0003 (`migrations/0003_orders_seller_split_and_indexes.js`)

Adds `sellerId`, `checkoutId`, `statusChangedAt` to `orders` (backfilled for any pre-existing order; fails loudly if an old order spans several sellers instead of guessing), then `syncIndexes` for `orders` (`{sellerId, createdAt}`, `{checkoutId}`, `{status, statusChangedAt}`; the old multikey `items.sellerId` index is dropped) and `payment_attempts`.

## Manual verification (repeatable)

Environment: `docker compose up -d mongo redis`, `SEED_PASSWORD='Phase10-Test-Password-1' npm run db:reset` (migrations 0001-0003 + seed), server started with `MONGODB_URI`, `AUTH_JWT_SECRET`, `REDIS_URL`, `SESSION_SECRET`. `$B=http://127.0.0.1:3100/api/v1`, tokens from `POST $B/auth/login` (customer, seller1, admin). Command sequence run once end to end (observed output in comments):

```bash
curl -X DELETE $B/cart -H "authorization: Bearer $C"                                     # 204
curl -X POST $B/cart/items -H "authorization: Bearer $C" -H 'content-type: application/json' \
  -d "{\"productId\":\"$PID\",\"quantity\":2}"                                           # 201 unitPriceCents 25000, totals 50000, checkoutReady true
curl -X POST $B/orders -H "authorization: Bearer $C" -H 'content-type: application/json' \
  -H 'Idempotency-Key: demo-key-0000000001' -d '{"shippingAddress":{...},"totalCents":1}' # 400 Unrecognized key "totalCents"
curl -i -X POST $B/orders ... -H 'Idempotency-Key: demo-key-0000000001' -d "$BODY"        # 201 PAID
curl -i -X POST $B/orders ... -H 'Idempotency-Key: demo-key-0000000001' -d "$BODY"        # 201 + Idempotent-Replayed: true, no new order
curl -X POST $B/orders ... -H 'Idempotency-Key: demo-key-0000000001' -d "$OTHER_BODY"     # 422 IDEMPOTENCY_KEY_REUSED
curl -X PATCH $B/orders/seller/$OID/status -H "authorization: Bearer $S1" -d '{"status":"SHIPPED"}'     # 409 PAID -> SHIPPED is not allowed
curl -X PATCH $B/orders/seller/$OID/status -H "authorization: Bearer $S1" -d '{"status":"PROCESSING"}'  # 200
curl -X POST  $B/orders/$OID/cancel -H "authorization: Bearer $C"                         # 403 TRANSITION_NOT_ALLOWED (PROCESSING -> CANCELLED is admin only)
curl -X PATCH $B/admin/orders/$OID/status -H "authorization: Bearer $AD" -d '{"status":"CANCELLED","reason":"seller out of stock"}'
# 200 status CANCELLED, payment REFUNDED, history order.created, order.paid, order.processing, order.cancelled, payment.refunded
```

Observed with a scripted run of **104 checks** against the real server, MongoDB replica set and Redis (all passed; run 3 times on a freshly reset database, identical result):

- **Cart:** 401 without token, admin `403`; `201` new line / `200` merge; client `priceCents` in the body `400`; quantity `0`/`101` `400`; merged quantity over 100 `409` and unchanged; draft product `404`; seller adding own product `403`; patch/remove incl. missing line `404`; **20 concurrent adds of one new product: all succeed, one line, quantity exactly 20** (an earlier version of `addItem` reported a spurious `409 limit` under this race and lost 2-7 adds; fixed by confirming the limit case separately and retrying).
- **Altered client prices:** `items`, `totalCents`, `priceCents`, `subtotalCents` in the checkout body all `400`, no order, cart still `ACTIVE`; a seller price change after add-to-cart makes the order use the _current_ server price (31000, not the cart-time 25000); invalid payment token `400`.
- **Idempotency / repeated requests:** replay returns same order id + `Idempotent-Replayed: true` and creates no order; same key different body `422`; 8 concurrent requests with one key: exactly 1 real checkout (rest replays or `409 IN_PROGRESS`), one order, stock decreased once; two different keys on one cart at the same time: one `201`, one `409`, failed one released its key.
- **Last-item race:** 10 rounds of two checkouts (customer and a second buyer) for the last unit of product B, each cart also holding product C: every round exactly one `201` and one `409`, B `onHand 0 reserved 0`, no reserved stock left, the loser's reservation of C rolled back.
- **Rollback (mutation):** with a temporary `throw` right after stock reservation, checkout returns `500` and afterwards stock of both products is unchanged, 0 orders, 0 payment attempts, 0 outbox rows, 0 audit rows, 0 idempotency records, cart still `ACTIVE`. The temporary line was removed afterwards.
- **Insufficient stock:** quantity above available `409 CHECKOUT_INVALID` with the line in `details`, nothing reserved; cart view shows `INSUFFICIENT_STOCK` and `checkoutReady: false`; after fixing the cart the same key succeeds; archived product in cart `409`; multi-seller cart splits into 2 orders with one `checkoutId`.
- **Payment states:** decline `402`, `PAYMENT_FAILED`, `failureCode card_declined`, stock back (50/0); provider error `202`, `PENDING_PAYMENT`, stock reserved (50/2); reconcile leaves a fresh pending order alone, expires it after its `statusChangedAt` is backdated one hour (stock 50/0, attempt `FAILED/EXPIRED`); customer cannot cancel `PAYMENT_FAILED`; non-admin cannot reconcile.
- **State machine:** other seller `404`; `PAID -> SHIPPED`, `SHIPPED -> PROCESSING`, `DELIVERED -> SHIPPED`, `REFUNDED -> *`, admin `DELIVERED -> CANCELLED` all `409 INVALID_ORDER_TRANSITION`; seller/admin trying to set `CANCELLED`/`PAID`/`REFUNDED` outside their enums `400`; two simultaneous `PAID -> PROCESSING`: one `200`, one `409`; two simultaneous customer cancels: one `200`, one `409`, restocked exactly once; refund after delivery does not restock.
- **Refund retry:** attempt reset to `SUCCEEDED` on a cancelled order shows `refundPending: true`; reconcile reports `refundsCompleted: 1` and clears it.
- **Reads and audit:** history newest first, `?status=` filter, unknown query key `400`; other user `404` on read and cancel; detail timeline `order.created, order.paid, order.cancelled`; seller list has only own post-payment orders with address and no `userId`/`payment`/`checkoutId`; customer on seller or admin endpoints `403`; admin audit list has the order events; no payment token in any audit row; outbox has order events; invariants (no negative stock, `reserved <= onHand`, no reserved stock left, unique order numbers).
- Server log: no level >= 50 lines. Existing suite: `npm test` 390/390, `npm run lint`, `npm run format:check`, `npm audit --omit=dev` clean.

Mutation checks (each applied, verified applied, then restored; the full run repeated clean afterwards):

| Mutation                                              | Result                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| idempotency `claim` rethrows the duplicate-key error  | 3 checks fail (replay gets `409 CONFLICT`); the unique index still prevents a second order, so the index is the real guard |
| `assertTransition` allows every edge                  | 8 checks fail (invalid transitions succeed)                                                                                |
| `status: from` guard removed from `orders.transition` | 3 checks fail: both simultaneous requests succeed, and a double cancel restocks twice (`onHand 49` instead of `48`)        |
| stock reservation removed from checkout               | first checkout fails (`Cannot commit stock`): the commit guard (`reserved >= qty`) catches the missing reservation         |

## Tradeoffs and limits

- Shipping and tax are `0` (fields and the totals validator exist); no coupons, no multi-currency conversion (a cart with two currencies yields two orders).
- The client cannot assert "I saw this price": checkout always charges the current price. A `expectedTotalCents` confirmation could be added later.
- Outcome-unknown payments are cancelled by reconcile after the timeout window. With a real provider that may have captured the money, webhooks (Phase 15) must confirm or refund; the mock cannot show that gap.
- A database failure right after the provider returns success leaves the order `PENDING_PAYMENT` with a `PENDING` attempt (money taken on the provider side). Phase 15 reconciliation by provider reference closes it.
- A request that crashes after the orders exist keeps its idempotency key `IN_PROGRESS` until the 24 h TTL (retries get `409`, never a duplicate).
- Order numbers come from one counter document inside the checkout transaction, so concurrent checkouts serialize briefly on it (write conflicts retried by the driver); gaps appear after rollbacks.
- Reconcile is admin-triggered and its refund scan aggregates `payment_attempts` by status; a scheduled job and a status index belong to Phase 14.
- Cart line cap (50 products) is a soft check; two simultaneous adds of the 51st product can both pass.
