# Routing and HTTP

## Purpose

URL space, router organisation, request parsing and the HTTP conventions (methods, status codes) that every feature module follows.

## Mount order (`src/app.js`)

Phase 3 added request ID, request logger and security headers before everything below; see [middleware.md](middleware.md) for the full order.

```
/health  ->  /static  ->  /api/v1 [ json -> urlencoded -> modules -> examples ]  ->  404  ->  client-error handler
```

| Step                          | Why here                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health` first               | No parsing, no dependencies on the API stack; probes stay cheap and cannot be broken by a bad body.                                                                                      |
| `/static` before the API      | Asset requests never reach body parsers. `index:false`, `dotfiles:'ignore'`, `maxAge:'1h'`; files come from `public/`. Traversal and dotfile requests end in the 404.                    |
| Parsers inside `/api/v1` only | Parsing cost and attack surface apply only where bodies are expected. Explicit `100kb` limit (`BODY_LIMIT`). `urlencoded` uses `extended:false` (flat keys, no nested-object expansion). |
| Modules, then examples        | Feature routers own their prefix; examples are mounted last and only when `NODE_ENV !== 'production'`.                                                                                   |
| 404 then error handler last   | Anything unmatched gets one safe JSON 404; errors raised above are rendered by the central `errorHandler` ([error-handling.md](error-handling.md)).                                      |

`notFound` and the error handler are part of the central error pipeline (Phase 4): `notFound` raises `NotFoundError`, and `errorHandler` renders every error (malformed JSON → 400, oversized → 413, undecodable URL param → 400, unexpected → generic 500). Details: [error-handling.md](error-handling.md).

## Route organisation

- One folder per module: `src/modules/<name>/<name>.routes.js` exporting `create<Name>Router()`.
- `src/routes/api.routes.js` is the only place that knows the prefixes: `/api/v1/{auth,users,sellers,products,cart,orders,admin}`.
- The seven module routers are **valid and mounted**. `auth`, `sellers`, `products` and `admin` have real endpoints once a database is configured (empty otherwise); `users`, `cart` and `orders` are still empty. A `/session` router (browser sessions) is also mounted when Redis is configured. They reserve the URL space and expose no endpoints, so `GET /api/v1/auth/login` is a 404 until Phase 7.
- Shared route middleware lives in `src/http/route-guards.js` (`requireJson`, `requireUrlEncoded`, `requireNumericParam`, `methodNotAllowed`).

## Endpoint naming

Plural nouns, lowercase, kebab-case for multi-word segments; the HTTP method carries the verb. Collections `/notes`, items `/notes/:id`, children `/notes/:noteId/comments`. Version in the prefix (`/api/v1`); breaking changes get a new prefix.

## Params, query, body

- **Path params**: identify a resource; URL-decoded by Express (`hi%20there` → `hi there`). IDs are validated by route middleware before the handler. Express 5 no longer supports inline regex in paths (`:id(\\d+)`), so validate in middleware.
- **Query**: filtering/paging only. Express 5 uses the "simple" parser: repeated keys become arrays, `a[b]=1` stays the literal key `a[b]`. Values are strings; `validate()` routes check and convert them with Zod ([validation-and-api-contracts.md](validation-and-api-contracts.md)).
- **Body**: JSON (`application/json`) and form (`application/x-www-form-urlencoded`). `req.body` is only populated when the content type matched, so write endpoints guard with `requireJson` (415 otherwise) and use `req.body ?? {}`.

## Status-code choices

| Code             | Used for                                                   |
| ---------------- | ---------------------------------------------------------- |
| 200              | Successful read/replace                                    |
| 201 + `Location` | Created a resource                                         |
| 204              | Delete success, empty body; also `OPTIONS`                 |
| 301              | Permanent redirect (fixed target, never user-supplied)     |
| 400              | Malformed body/URL, invalid path param, validation failure |
| 404              | Unknown route or missing resource (same shape for both)    |
| 405 + `Allow`    | Known path, unsupported method (`route().all()` fallback)  |
| 413              | Body over limit                                            |
| 415              | Wrong `Content-Type` for the endpoint                      |

Error body shape (see [error-handling.md](error-handling.md); validation details in [validation-and-api-contracts.md](validation-and-api-contracts.md)): `{ "error": { "code", "message", "details?" } }`. The 404 never echoes the requested path.

## The examples router (`/api/v1/examples`)

Teaching endpoints that really work against per-app in-memory data; not a business module and not mounted in production. Demonstrates: `res.send` (`/ping`), params + query (`/echo/:value`), JSON/form parsing (`/echo/json`, `/echo/form`), `res.redirect` (`/old-notes`), route ordering (`/notes/latest` before `/notes/:id`), `router.route()` chaining with `.all()` → 405, `PUT/DELETE/OPTIONS/HEAD`, route-specific middleware, and a nested router with `mergeParams` (`/notes/:noteId/comments`). The notes routes keep their simple inline Zod checks; validate()-based validation with pagination/sorting/filters is shown in `/examples/validation`.

## How to add a new route

1. Pick the module (`src/modules/<name>/`); add handlers in the module, not in `app.js`.
2. Register literal paths before parameterised ones (`/notes/latest` before `/notes/:id`).
3. Use `router.route(path)` to group methods, end with `.all(methodNotAllowed([...]))`.
4. Guard params/body with route middleware; return the status codes above.
5. Add Supertest cases: success, invalid input, missing resource, wrong method.
6. Mount a new module in `src/routes/api.routes.js` under its prefix; update this doc and the matrix.

## Tests

`npm test` → `tests/integration/routing.test.js`, `tests/integration/static.test.js`.

## Tradeoffs

- In-memory examples reset per app instance; fine for demos, intentionally not a persistence pattern.
- Route guards and examples raise `AppError`s instead of writing error JSON themselves; the one deliberate exception is the `guarded` demo.
