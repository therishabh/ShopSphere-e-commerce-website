# Authorization and Browser Sessions

## Purpose

Two separate things, both built on top of authentication ([authentication.md](authentication.md)):

1. **Authorization**: roles, explicit permissions, resource ownership, admin-only seller approval and product moderation, and an audit trail. Authentication answers "who are you"; authorization answers "may you do this to this resource".
2. **Browser session path**: HttpOnly cookie sessions in Redis with CSRF protection, kept apart from the bearer-token path.

Both need the database; sessions also need Redis (`REDIS_URL`). Without a database the seller/admin/product routers are empty (404). Without Redis, `/api/v1/session/*` is not mounted and only bearer auth exists.

## Roles and permissions (`src/modules/authz/permissions.js`)

Code never writes `if (role === 'ADMIN')`; routes ask for a permission and the role table decides. Default deny: anything not listed is refused.

| Role     | Permissions                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CUSTOMER | `seller:apply`, `seller:read:own`, `review:create`, `review:update:own`, `review:delete:own`, `wishlist:manage:own`                                                                                          |
| SELLER   | `seller:read:own`, `product:create`, `product:update:own`, `product:submit:own`, `product:read:own`, `product:archive:own`, `inventory:update:own`, `review:create/update/delete:own`, `wishlist:manage:own` |
| ADMIN    | `admin:seller:review`, `admin:product:moderate`, `admin:audit:read`, `admin:category:manage`, `admin:review:moderate`                                                                                        |

A customer becomes a SELLER only when an admin approves the application (same transaction as the status change). ADMIN deliberately has no seller or customer permissions. A permission ending in `:own` only says the role may do this kind of action; ownership is checked separately.

## Request pipeline

```
authenticate (bearer OR session)  ->  requirePermission(p)  ->  validate()  ->  controller  ->  service (ownership)  ->  repository
          401                                  403                  400                              403 / 404 / 409
```

`requirePermission` ignores the role inside the token: it loads the user from the database on every request (one `_id` lookup), requires status `ACTIVE`, and checks the **database role**. So demoting an admin or disabling a user takes effect on the next request instead of after the 15-minute access-token life. It sets `res.locals.actor = { id, role }`, which services use. Denials are logged (user id, role, permission; never tokens or bodies) and are intentionally **not** written to the audit collection, since anyone could spam it.

## Ownership (`src/modules/authz/ownership.js`)

The owner of a product is decided by the server: the actor's id gives their seller profile, and that profile must be `APPROVED`. A client-supplied `sellerId` is never read (strict schemas reject the field).

| Situation                                                                                                 | Response                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------- |
| no token / bad token                                                                                      | `401`                     |
| role lacks the permission (customer on a seller route, seller on an admin route, admin on a seller route) | `403 FORBIDDEN`           |
| SELLER role but profile pending, rejected or suspended                                                    | `403 SELLER_NOT_APPROVED` |
| product id unknown                                                                                        | `404`                     |
| product belongs to another seller (id swapped in the URL)                                                 | `403`                     |
| product in the wrong status for the action                                                                | `409`                     |

Two independent layers stop a wrong-owner write: the service check above, and the update query itself, whose filter contains `{ _id, sellerId: <actor's profile>, status: <allowed> }`. Verified by removing each layer in turn: with the service check removed the wrong-owner request got `409` and the product was unchanged; only with both removed did the hijack succeed.

Trade-off: `403` for someone else's product confirms that the id exists. Product ids are unguessable ObjectIds and ACTIVE products are public anyway; returning `404` for everything would hide existence completely at the cost of less helpful errors.

## Seller and product lifecycle

```
CUSTOMER --apply--> SellerProfile PENDING --approve--> APPROVED (user becomes SELLER) --suspend--> SUSPENDED --reinstate--> APPROVED
                                          \--reject--> REJECTED

Product: DRAFT --submit--> PENDING_REVIEW --admin approve--> ACTIVE
                                           \-admin reject (reason)--> REJECTED --owner edit--> DRAFT
```

- Transitions come from an explicit table and are conditional updates (`status in from`): approving a non-pending seller is `409`, and two admins acting at once cannot both win.
- Owners edit only DRAFT or REJECTED products (editing an approved product would bypass moderation; the active-product edit flow arrives in Phase 9). An admin cannot approve a product whose seller is not APPROVED.
- Stock (`PUT /products/:id/stock`) is set by the owner, never below the reserved quantity (filter plus the collection validator).

## Endpoints

| Endpoint                                                     | Permission               | Notes                                                     |
| ------------------------------------------------------------ | ------------------------ | --------------------------------------------------------- |
| `POST /sellers/apply`                                        | `seller:apply`           | `201` PENDING profile                                     |
| `GET /sellers/me`                                            | `seller:read:own`        | own profile and status                                    |
| `POST /products`                                             | `product:create`         | DRAFT; category by slug; owner = actor's approved profile |
| `PATCH /products/:productId`                                 | `product:update:own`     | name, description, priceCents only                        |
| `PUT /products/:productId/stock`                             | `inventory:update:own`   | `{ onHand }`                                              |
| `POST /products/:productId/submit`                           | `product:submit:own`     | DRAFT or REJECTED -> PENDING_REVIEW                       |
| `GET /admin/sellers`                                         | `admin:seller:review`    | `?status=`, page/limit, applicant email and name          |
| `POST /admin/sellers/:id/{approve,reject,suspend,reinstate}` | `admin:seller:review`    | reject and suspend need `reason`                          |
| `GET /admin/products`                                        | `admin:product:moderate` | moderation queue (`?status=PENDING_REVIEW`)               |
| `POST /admin/products/:id/{approve,reject}`                  | `admin:product:moderate` | reject needs `reason`                                     |
| `GET /admin/audit-events`                                    | `admin:audit:read`       | filters: `entityType`, `entityId`, `actorId`, `action`    |

Bodies must be JSON, so action endpoints with an optional body still need `{}` (a missing `Content-Type: application/json` is `415`). List endpoints reuse the Phase 5 toolkit (strict query, allowlisted sort/filters).

## Audit trail

Every seller and product action, and every admin decision, is written to `audit_events` in the same transaction as the change: `seller.applied|approved|rejected|suspended|reinstated`, `product.created|updated|stock_updated|submitted|approved|rejected`. An event holds the actor id, entity type and id, and metadata such as `{ from, to, reason, sellerId }` or the list of changed field names (not values). The audit repository rejects metadata keys that look like secrets (`password`, `token`, ...), and tokens, cookies and CSRF tokens never reach it (checked).

## Browser sessions (`src/modules/session`)

|            | Bearer (`/auth/*`)                                 | Session (`/session/*`)           |
| ---------- | -------------------------------------------------- | -------------------------------- |
| Credential | `Authorization: Bearer <JWT>`                      | `sid` cookie (signed session id) |
| State      | stateless access token + refresh tokens in MongoDB | server-side session in **Redis** |
| Client     | mobile apps, scripts, SPAs that manage tokens      | browsers                         |
| CSRF       | not applicable (header is not sent automatically)  | required on unsafe methods       |

`POST /session/login` verifies credentials with the same code path as bearer login (`authService.verifyCredentials`: same throttling, anti-enumeration and account-status rules), then **regenerates the session id** (fixation defense) and stores `{ userId, createdAt, csrfToken }`. It returns the user and the CSRF token. `POST /session/logout`, `POST /session/logout-all`, `GET /session/me`, `GET /session/csrf` complete the set.

### Cookie settings

| Attribute     | Value                                                                                      | Why                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `HttpOnly`    | always                                                                                     | JavaScript cannot read the cookie, so XSS cannot steal the session                                       |
| `Secure`      | production                                                                                 | HTTPS only. In development (plain http) it is off, otherwise the browser would drop the cookie           |
| `SameSite`    | `Lax`                                                                                      | cross-site POST/fetch requests do not carry the cookie (first CSRF wall)                                 |
| `Path` / name | `/`; `__Host-sid` in production, `sid` in development                                      | the `__Host-` prefix forces Secure, no Domain, Path=/ so a sibling subdomain cannot overwrite the cookie |
| Expiry        | idle 30 min (`SESSION_IDLE_MINUTES`, rolling) and absolute 12 h (`SESSION_ABSOLUTE_HOURS`) | a stolen session cannot live forever                                                                     |

The cookie value is a signed session id (`SESSION_SECRET`); a forged or unsigned cookie is treated as anonymous. Anonymous visitors never get a session cookie. Behind a TLS-terminating proxy set `TRUST_PROXY_HOPS` (number of proxies) and make the proxy send `X-Forwarded-Proto`; otherwise Express thinks the request is plain http, the Secure cookie is silently not set, and login would look successful without creating a session. The login handler detects this and fails loudly with a `500` and an explanatory log line instead.

### Redis store and the session index

Sessions live in Redis under `sess:<id>` with a TTL equal to the idle timeout, refreshed on activity. A per-user set `sess_user:<userId>` lists the user's session ids so all of them can be deleted at once. Sessions are removed for: logout (one), logout-all (all, plus bearer refresh tokens), and **password reset** (all). Disabling a user takes effect at once because authorization reads the user from the database on every request.

### CSRF protection (`csrf.js`)

For cookie-authenticated unsafe requests (POST, PUT, PATCH, DELETE) three layers apply:

1. `SameSite=Lax` cookie.
2. **Synchronizer token**: the token is created at login, bound to the session, and must come back in the `X-CSRF-Token` header (constant-time comparison). A page on another site cannot read it.
3. **Origin check**: `Origin` must be the configured frontend origin (`APP_BASE_URL`) or the request's own origin; `Sec-Fetch-Site: cross-site` is rejected. Requests without `Origin` (curl, servers) fall through to the token check.

Failures are `403 CSRF_TOKEN_INVALID` or `CSRF_ORIGIN_INVALID`. The login request has no token yet, so it gets the origin check only (blocks login-CSRF). Safe methods (GET/HEAD/OPTIONS) need no token.

### Keeping the two paths separate

`authenticateEither` (used by sellers, products, admin routers): if an `Authorization` header is present only the bearer is checked and the cookie is never looked at; otherwise the session cookie is used with CSRF. Consequences (verified): an invalid bearer plus a valid cookie is `401` (no fallback); a bearer request needs no CSRF token even if a cookie is also sent; `/auth/*` rejects cookies; `/session/*` rejects bearers. After authentication both paths produce `res.locals.auth` and the same authorization code runs.

### Failure handling

| Situation                                                     | Behaviour                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis down                                                    | requests that carry a session cookie and `/session/login` get `503` + `Retry-After`; bearer requests, public routes and the rest of the API keep working; `/health/ready` is `503` (`redis: down`), liveness stays `200`; node-redis reconnects by itself |
| Redis restarted without persistence                           | sessions are gone (`401`), users log in again                                                                                                                                                                                                             |
| `REDIS_URL` not set                                           | session routes are not mounted (`404`); startup logs an info line                                                                                                                                                                                         |
| Production without `SESSION_SECRET` (when `REDIS_URL` is set) | startup exits `1`                                                                                                                                                                                                                                         |
| Secure cookie but request not seen as HTTPS                   | login returns a generic `500` and logs the fix (`TRUST_PROXY_HOPS`)                                                                                                                                                                                       |

## Files

`src/modules/authz/{permissions,authorize,ownership,authenticate-either,index}.js`, `src/modules/session/{session.middleware,session.controller,session.routes,session-registry,csrf,index}.js`, `src/modules/sellers/*`, `src/modules/admin/*`, `src/modules/products/{products.service,products.controller,products.routes}.js` (+ new schemas), `src/db/repositories/seller-profiles.repository.js` (and new methods on products, users, audit repositories), `src/redis/redis.js`, `compose.yaml` (Redis service).

Configuration: `REDIS_URL`, `SESSION_SECRET` (>= 32 chars), `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `TRUST_PROXY_HOPS`.

## Manual verification (repeatable)

No automated tests were written for this phase (owner's decision). Evidence comes from the real server (MongoDB 8.3.13, Redis 8) driven by HTTP requests, using the seed users (`SEED_PASSWORD=... npm run db:seed`). Quick commands:

```bash
B=localhost:3000/api/v1
T=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"seller2@shopsphere.test","password":"<SEED_PASSWORD>"}' | jq -r .accessToken)
curl -X PATCH $B/products/<seller1-product-id> -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"name":"x"}'   # 403 (wrong owner)
curl -s -D- -X POST $B/session/login -H 'content-type: application/json' -d '{"email":"seller1@shopsphere.test","password":"<SEED_PASSWORD>"}'   # Set-Cookie + csrfToken
curl -X POST $B/products -H 'cookie: sid=<cookie>' -H 'content-type: application/json' -d '{...}'                                     # 403 CSRF_TOKEN_INVALID
curl -X POST $B/products -H 'cookie: sid=<cookie>' -H 'x-csrf-token: <csrfToken>' -H 'content-type: application/json' -d '{...}'      # 201
```

Observed (121 checks plus mutation checks, all as expected):

- **Unauthenticated**: seven seller/admin/product endpoints without a token all `401` with `WWW-Authenticate: Bearer`.
- **Authenticated but forbidden**: customer on product-create and four admin endpoints, seller on admin routes and on `seller/apply`, admin on product-create and product-edit: all `403 FORBIDDEN`; a SELLER with a PENDING profile gets `403 SELLER_NOT_APPROVED`.
- **Correct owner**: create (DRAFT, `sellerId` from the server), patch, stock, submit all succeed; a client-supplied `sellerId`, `status`, or `sku` in a body is `400`; duplicate SKU `409`; stock below reserved `409`.
- **Wrong owner**: seller2 on seller1's product (patch, stock, submit, and an ACTIVE seed product by changing only the id): all `403` and the stored document is byte-for-byte unchanged; unknown id `404`, malformed id `400`.
- **Admin**: lists pending sellers with applicant info, approves (role becomes SELLER in the same transaction), rejects, suspends (suspended seller then gets `403 SELLER_NOT_APPROVED`), reinstates; invalid transitions `409`; product moderation approve/reject with reason; the audit list shows actor, entity, from/to and reason for all 12 action types, filters work, unknown filter keys are `400`.
- **Staleness**: demoting a seller or disabling an admin in the database refuses the _same_ access token on the next request.
- **Sessions**: login cookie is `HttpOnly; SameSite=Lax; Path=/` with expiry (production over a trusted proxy: `__Host-sid; Secure; HttpOnly; SameSite=Lax`); foreign `Origin` and `Sec-Fetch-Site: cross-site` on login `403`; presenting an old cookie at login gives a new session id and kills the old one; forged cookie `401`; anonymous requests get no cookie.
- **CSRF**: cookie POST without a token, with a wrong token, with a prefix of the token, with another session's token, with the right token but a foreign Origin or `cross-site`: all `403` and nothing created; the right token (with and without an allowed Origin) works; ownership and permissions still apply on the cookie path.
- **Separation**: bearer alone works; bearer plus a foreign cookie works; invalid bearer plus a valid cookie `401`; bearer POST needs no CSRF token; `/auth/me` rejects a cookie; `/session/me` rejects a bearer.
- **Logout and revocation**: logout without the token `403` and the session survives; with the token `204`, cookie cleared with the same attributes, Redis key and index entry gone; logout-all kills all sessions and the bearer refresh tokens; password reset kills sessions; disabling a user ends the session at once.
- **Timeouts**: a session older than 12 h is `401` even though active; Redis TTL equals the idle timeout and is refreshed by activity; after the TTL lapses the session is gone.
- **Limits and hygiene**: 5 failed session logins then `429` (same limiter as bearer login); no password, token, CSRF token, cookie or secret in audit events or server logs.
- **Failure modes**: Redis stopped gives `503` + `Retry-After` for cookie requests and session login while bearer and public routes stay `200`, readiness `503` and recovery after restart (a bug was found and fixed here: node-redis errors have `name: 'Error'`, so the 503 mapping now also checks the constructor name). Without `REDIS_URL` session routes are `404`; production without `SESSION_SECRET` exits `1`; Secure cookie without a trusted proxy header fails loudly.
- **Mutation checks** (each safeguard broken on purpose): ownership comparison removed -> still safe via the query filter (`409`); both layers removed -> product hijacked; CSRF token check removed -> cookie POST without a token succeeds (`201`); `can()` always true -> a seller reads admin audit events (`200`). Everything was restored afterwards.

## Tradeoffs and open items

- A database read on every protected request buys immediate revocation; it can later be cached briefly if it shows up in profiles.
- Sessions are lost if Redis loses data; use persistence or a managed Redis in production. The local container has no auth and no persistence.
- The in-memory login limiter is per process and `req.ip` depends on a correct `TRUST_PROXY_HOPS` (full proxy and CORS hardening: Phase 11).
- CORS is not configured, so browsers on another origin cannot read API responses; set an explicit allowlist in Phase 11 before serving a separate-origin SPA.
- Public catalog, reviews, wishlist and active-product editing are Phase 9; admins cannot edit sellers' products by design.
