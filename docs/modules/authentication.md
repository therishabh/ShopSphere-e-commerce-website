# Authentication

## Purpose

Account identity for ShopSphere: signup, email verification, login, access-token verification, refresh-token rotation and revocation, logout, and password reset. This module answers "who are you". "What may you do" (roles, permissions, ownership) is covered in [authorization-and-sessions.md](authorization-and-sessions.md).

The auth endpoints need the database (users and tokens are stored there). Without `MONGODB_URI` the auth router stays empty and every `/api/v1/auth/*` request is a `404` (no fake endpoints).

## Endpoints

All bodies are validated by `z.strictObject` schemas (`auth.schemas.js`), so unknown fields (for example `role`) are rejected with `400`. Auth responses carry `Cache-Control: no-store`.

| Endpoint                                           | Auth   | Success                                                       | Notes                                                                       |
| -------------------------------------------------- | ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /auth/signup`                                | none   | `202` generic message                                         | same response for new and already-registered email                          |
| `POST /auth/verify-email` `{token}`                | none   | `200`                                                         | single use, 24 h                                                            |
| `POST /auth/resend-verification` `{email}`         | none   | `202` generic                                                 | throttled                                                                   |
| `POST /auth/login` `{email, password}`             | none   | `200 {user, accessToken, refreshToken, tokenType, expiresIn}` | `401` bad credentials, `403 EMAIL_NOT_VERIFIED` / `ACCOUNT_DISABLED`, `429` |
| `POST /auth/refresh` `{refreshToken}`              | none   | `200` new access + refresh token                              | rotation, reuse detection                                                   |
| `POST /auth/logout` `{refreshToken}`               | none   | `204`                                                         | revokes that session; always `204`                                          |
| `POST /auth/logout-all`                            | Bearer | `204`                                                         | revokes every session of the user                                           |
| `GET /auth/me`                                     | Bearer | `200 {user}`                                                  | also checks the user is still ACTIVE in the database                        |
| `POST /auth/forgot-password` `{email}`             | none   | `202` generic                                                 | throttled                                                                   |
| `POST /auth/reset-password` `{token, newPassword}` | none   | `200`                                                         | single use, 1 h, revokes all sessions                                       |

Errors use the standard `{ "error": { "code", "message", "details?" } }` shape. Auth-specific codes: `UNAUTHENTICATED` (401), `INVALID_TOKEN` (400, verification/reset), `EMAIL_NOT_VERIFIED` and `ACCOUNT_DISABLED` (403), `RATE_LIMITED` (429). A `401` from a protected route includes `WWW-Authenticate: Bearer`.

## Flows

```
signup ──> user PENDING_VERIFICATION + verification token ──email──> verify-email ──> ACTIVE
login (ACTIVE only) ──> access token (JWT, 15 min) + refresh token (opaque, 30 days, new session family)
refresh ──> claim old token (atomic) ──> new refresh token in the same family ──> new access token
            old token presented again   ──> REUSE: whole family revoked + audit event
logout  ──> family revoked          logout-all ──> every family of the user revoked
forgot-password ──> reset token ──email──> reset-password ──> new hash, ALL sessions revoked, notification email
```

## Token lifecycle

| Token              | Format                                                                   | Stored                                                                           | Lifetime                                                 | Use                                      |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Access             | JWT HS256 via `jsonwebtoken` (`sub`, `role`, `iss`, `aud`, `exp`, `jti`) | nowhere (stateless)                                                              | 15 min (`ACCESS_TOKEN_TTL_SECONDS`)                      | `Authorization: Bearer` on every request |
| Refresh            | 256-bit random, base64url                                                | **SHA-256 hash** in `refresh_tokens` (+ `familyId`, `replacedById`, `revokedAt`) | 30 days (`REFRESH_TOKEN_TTL_DAYS`), rotated on every use | exchange for a new pair                  |
| Email verification | 256-bit random                                                           | hash in `one_time_tokens`                                                        | 24 h, single use                                         | `verify-email`                           |
| Password reset     | 256-bit random                                                           | hash in `one_time_tokens`                                                        | 1 h, single use                                          | `reset-password`                         |

Why hashes: a database leak must not hand out working tokens. Random 256-bit tokens do not need a slow hash; SHA-256 is enough. Passwords are different (low entropy), so they use Argon2id.

- **Access token verification** (`token-service.js`, `jsonwebtoken`): signature, `exp`, `iss`, `aud`, and the algorithm is pinned to HS256 (`alg: none`, HS384 and HS512 tokens are rejected). `jsonwebtoken` accepts a token that has no `exp` claim (verified), so the service additionally requires `exp`, `sub` and `role`. The secret is `AUTH_JWT_SECRET` (>= 32 chars, required in production).
- **Single use** is enforced by one atomic database update (`consume`): the token is found, checked for purpose, expiry and `usedAt: null`, and marked used in the same operation. Two parallel requests cannot both succeed.
- **Rotation and reuse detection**: refresh claims the old token atomically (`revokedAt: null` -> now), creates the next token in the same family, and links `replacedById`. Presenting a token that was already rotated (revoked and linked) is treated as theft: the family is revoked and `auth.refresh_reuse_detected` is audited. A token revoked by logout has no link, so replaying it is just `401`.
- **Expiry**: expired refresh tokens are rejected, and a TTL index deletes them (and old one-time tokens) from the database.
- **Account changes**: password reset revokes all sessions. A disabled user cannot log in or refresh (the family is revoked), and `/auth/me` re-checks the database.

## Cookie vs header (decision)

Access token: `Authorization: Bearer` header. Refresh token: JSON body (request and response).

| Option                                      | Trade-off                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bearer header + body refresh token (chosen) | no cookies means no CSRF on these endpoints; works for mobile apps, SPAs and scripts. Cost: a script-readable refresh token in browser storage is exposed to XSS |
| HttpOnly cookie for refresh                 | not readable by JS (better against XSS) but cookie-authenticated endpoints need CSRF protection (SameSite, CSRF token)                                           |

The browser-oriented path (HttpOnly Secure SameSite cookie session in Redis plus CSRF protection) exists separately (`/api/v1/session/*`, see [authorization-and-sessions.md](authorization-and-sessions.md)), kept apart from bearer auth. Clients that store tokens in a browser should prefer that path.

## Account policy

| State                | Correct password         | Wrong password         |
| -------------------- | ------------------------ | ---------------------- |
| ACTIVE               | `200`                    | `401`                  |
| PENDING_VERIFICATION | `403 EMAIL_NOT_VERIFIED` | `401`                  |
| DISABLED             | `403 ACCOUNT_DISABLED`   | `401`                  |
| unknown email        | n/a                      | `401` (identical body) |

Status is revealed only after the password is proven, so it cannot be used to probe accounts.

## Anti-enumeration

- `signup`, `forgot-password`, `resend-verification` return one fixed `202` message whether or not the email exists. Existing owners receive an "already registered" email instead of an error.
- `login` returns the same `401` body for unknown email and wrong password, and verifies against a dummy Argon2 hash for unknown emails (measured: 23.3 ms known vs 22.2 ms unknown).
- Verification/reset token failures are one generic `400 INVALID_TOKEN` (wrong, expired or used).
- Signup hashes the password before checking for an existing account so both paths take similar time.
- Residual leaks: creating a user plus token touches the database a little more than the "already registered" path; the existing-account path sends a different email. Both are small timing/side-channel differences, not response differences.

## Brute-force and abuse limits (hook)

`attempt-limiter.js` is an in-memory fixed-window counter behind a `check / record / reset` interface; the service depends only on the interface, so a Redis implementation (Phase 11/13) can replace it.

| Limiter                   | Limit       | Counts                             |
| ------------------------- | ----------- | ---------------------------------- |
| login per (email, ip)     | 5 / 15 min  | failed logins; reset on success    |
| login per ip              | 30 / 15 min | failed logins                      |
| login per email (all ips) | 20 / 15 min | failed logins                      |
| mail per email            | 3 / hour    | every signup/forgot/resend request |
| mail per ip               | 20 / hour   | every signup/forgot/resend request |

Exceeded: `429 RATE_LIMITED` with `Retry-After`. The per-pair key means a stranger cannot lock someone out just by typing their email from another address; the email-wide limit caps distributed guessing. Limits are per process and reset on restart. `req.ip` is the socket address unless `TRUST_PROXY_HOPS` is set for the reverse proxy in front (full hardening: Phase 11).

## Passwords

Argon2id via the maintained `argon2` package, OWASP minimum parameters (m=19 MiB, t=2, p=1), per-hash random salt inside the hash string. Policy: 12 to 128 characters (the maximum prevents hashing-DoS), not trimmed. There is no breach-list or complexity check (length first); add a breached-password check later if required. `needsRehash` upgrades old hashes on login. The hash is `select: false` in the model and never returned or logged.

## Email delivery

`src/email/test-mailer.js` keeps messages in memory (last 100) and logs only the template name. A non-production route `GET /api/v1/examples/mailbox` shows them so the flows can be tested end to end (tokens included, so it is never mounted in production). A real provider adapter replaces the mailer later behind the same `send(message)` interface. **In production no email is delivered today**; the server logs a warning at startup. Emails are sent after the database transaction commits; a send failure is logged and the user can request a new email.

## Threats and trade-offs

| Threat                                                    | Mitigation                                                   | Residual                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Database leak                                             | Argon2id hashes; token hashes only                           | hash cracking of weak passwords                                                                                                                |
| Stolen access token                                       | 15-minute life, signed, audience/issuer pinned               | cannot be revoked early (stateless); disabled users still pass stateless checks until expiry, but `/auth/me` and refresh re-check the database |
| Stolen refresh token                                      | rotation, reuse detection revokes the family                 | the thief who refreshes first wins until the real client retries and trips reuse detection                                                     |
| Concurrent refresh by a legitimate client (double submit) | atomic claim                                                 | the loser looks like reuse and revokes the family; clients must not refresh concurrently with one token                                        |
| Credential stuffing / brute force                         | per pair, ip, email limits; Argon2 cost                      | in-memory, per instance                                                                                                                        |
| Account enumeration                                       | generic responses, dummy hash                                | tiny timing differences                                                                                                                        |
| Email bombing                                             | mail limits                                                  | per instance                                                                                                                                   |
| Algorithm confusion / forged JWT / token without expiry   | pinned HS256, `iss`/`aud` check, `exp`/`sub`/`role` required | secret must stay secret and be rotated if leaked (rotation invalidates all access tokens)                                                      |
| XSS stealing tokens from storage                          | n/a for header design                                        | see cookie vs header                                                                                                                           |

## Files

`src/modules/auth/{auth.routes,auth.controller,auth.service,auth.middleware,auth.schemas,token-service,password-hasher,attempt-limiter,index}.js`, `src/db/repositories/{refresh-tokens,one-time-tokens,users}.repository.js`, `src/email/{test-mailer,templates}.js`, `src/examples/mailbox-examples.routes.js`.

Layering: route -> `validate()` -> controller (HTTP only) -> service (rules, transactions) -> repositories.

## Configuration

`AUTH_JWT_SECRET` (>= 32 chars; random per run in development when unset; required in production), `APP_BASE_URL` (email links; `https://` required in production), `ACCESS_TOKEN_TTL_SECONDS` (60..3600, default 900), `REFRESH_TOKEN_TTL_DAYS` (1..90, default 30). `SEED_PASSWORD` (optional) gives the seeded `@shopsphere.test` users a password for local login.

## Manual verification (repeatable)

No automated tests were written for this phase (owner's decision). The evidence below comes from running the real server against MongoDB 8.3.13 and driving it with HTTP requests (`NODE_ENV=development AUTH_JWT_SECRET=<random> node src/server.js`; mail tokens from `GET /api/v1/examples/mailbox?to=<email>`).

```bash
B=localhost:3000/api/v1
curl -X POST $B/auth/signup -H 'content-type: application/json' -d '{"email":"a@x.test","name":"A","password":"correct horse battery"}'   # 202 generic
curl "$B/examples/mailbox?to=a@x.test"                                                  # find the verification token
curl -X POST $B/auth/verify-email -H 'content-type: application/json' -d '{"token":"<token>"}'                                  # 200
curl -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"a@x.test","password":"correct horse battery"}'     # tokens
curl $B/auth/me -H "authorization: Bearer <accessToken>"                               # 200; without header 401 + WWW-Authenticate
curl -X POST $B/auth/refresh -H 'content-type: application/json' -d '{"refreshToken":"<refreshToken>"}'                         # 200 new pair; repeat with the OLD token -> 401 and family revoked
```

Observed (60 checks, all as expected):

- Signup: `202`; a duplicate signup returned a byte-identical response and created no second user; the owner got an "already registered" email; `role` in the body, short/129-char password, bad email, empty name all `400` and created nothing; stored hash is `$argon2id$...` and never contains the password.
- Login policy: unverified + correct password `403 EMAIL_NOT_VERIFIED`; unverified/disabled + wrong password `401`; unknown email gives the same `401` body as a wrong password; disabled + correct password `403 ACCOUNT_DISABLED`.
- Verification: bogus, reused and expired tokens all give the identical `400 INVALID_TOKEN`; the raw token is not in the database; a resent link invalidates the older one.
- Access token: `/me` rejects garbage, expired, forged-secret, wrong-audience, wrong-issuer, `alg=none` and non-Bearer headers with the same `401`; login responses have `Cache-Control: no-store` and no `passwordHash`.
- Refresh: rotation returns a new pair; the old token replayed gives `401` and also kills the new token (family revoked) and writes `auth.refresh_reuse_detected`; two parallel refreshes with one token: exactly one `200`; expired refresh `401`; logout then refresh `401` and is not recorded as reuse; logout with an unknown token `204`; logout-all kills every session while the access token keeps working until expiry.
- Reset: generic `202` identical for existing and unknown emails and mail only to the real account; weak password `400` without burning the token; success revokes all sessions, old password stops working, token reuse and expired token give `400 INVALID_TOKEN`; "password changed" email sent; a disabled user gets no reset email.
- Limits: 4 failures then a good login resets the counter; after 5 failures even the correct password gives `429` with `Retry-After: 900`; another email from the same ip is unaffected; the 4th forgot-password for one email in an hour gives `429`.
- Re-verified after switching the JWT library from `jose` to `jsonwebtoken` (22 checks, all pass): 13 forged or invalid access tokens (garbage, expired, forged secret with role ADMIN, wrong audience/issuer, HS384, HS512, `alg=none`, tampered payload, future `nbf`, no `exp`, no `role`, no `sub`) all `401`; valid token claims are `sub`, `role`, `iss`, `aud`, `exp` (900 s), `jti` only; refresh rotation, reuse detection, logout-all and the disabled-user `/me` check unchanged.
- Hygiene: DB token/audit collections and the server logs contained no raw password, token, JWT or `$argon2` string.
- Startup: development without `AUTH_JWT_SECRET` warns and uses a random one; production without it, with a non-https `APP_BASE_URL`, or with a short secret exits `1`; without a database `/auth/*` is `404`; the mailbox route is `404` in production.

## Tradeoffs and open items

- In-memory limiter and per-process state; Redis-backed limiter in a later phase.
- No MFA, no breached-password check, no "change password while logged in" and no OAuth login yet (OIDC is Phase 16).
- Refresh token in the response body suits API clients; a browser-safe cookie session exists as `/api/v1/session/*` ([authorization-and-sessions.md](authorization-and-sessions.md)).
- Emails are test-only until a provider adapter exists.
