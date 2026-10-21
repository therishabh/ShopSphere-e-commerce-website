# Validation and API Contracts

## Purpose

Every request is validated by a Zod schema before any handler runs, list endpoints share one strict pagination/sorting/filtering toolkit, and responses follow a small fixed convention.

> **OpenAPI + Swagger UI are not on `main`.** They live on the branch `feature/openapi-swagger` and will be merged near the end of the project (see that branch's version of this document). Everything below works without them.

## Request validation

`validate({ params, query, body })` (`src/http/validate.js`) is route middleware.

- Runs before the handler; invalid requests never reach it.
- All problems from all three sources are collected into one `ValidationError` → `400` with `details: [{ source, path, message }]` (`source` is `params|query|body`, `path` is dotted, empty for object-level issues such as an unrecognized key).
- Validated, normalized values are in `res.locals.valid.{params,query,body}`. Use those, never raw `req.query`/`req.body` (Express 5 makes `req.query` read-only, so it cannot be overwritten).
- A body schema requires `Content-Type: application/json` (`415` otherwise). Top-level non-object JSON (`"x"`, `42`, `null`) is rejected by the JSON parser as `400 BAD_REQUEST`.
- Use `z.strictObject` for every request schema: unknown keys are rejected. This is the mass-assignment defence (a client cannot set `role`, `id`, `createdAt`...) and catches misspelt query keys.

### Query strings are strings

`src/http/query/fields.js` provides strict string-first helpers. They do not use `z.coerce`, which silently accepts `""`, `" 5 "`, `"1e3"`, and turns `"false"` into `true`.

| Helper                 | Accepts                                      | Output  |
| ---------------------- | -------------------------------------------- | ------- |
| `intString({min,max})` | `^\d{1,15}$` within range                    | number  |
| `booleanString()`      | exactly `true` / `false`                     | boolean |
| `searchTerm({max})`    | trimmed, 1..max chars, no control characters | string  |
| `slug()`               | lowercase letters/digits/single hyphens      | string  |

Repeated keys (`?page=1&page=2`) become arrays in Express 5 and fail string schemas.

## DTO / schema strategy

- Schemas live next to the module (`src/modules/<name>/<name>.schemas.js`): query, params, body and response DTOs. DTOs are not the database model: a column rename must not change the API.
- Money is an integer in minor units (`priceCents`), never a float. Dates are ISO-8601 UTC strings. IDs in URLs are UUIDs. Field names are camelCase.
- `src/modules/products/products.schemas.js` is the representative set (list query, id params, create body, response DTOs). Phase 9 wires it to real endpoints; today only the validation examples use it.

## Pagination, sorting, filtering, search

`buildListQuerySchema({ sortable, defaultSort, filters, search, checkFilters })` (`src/http/query/list-query.js`) returns a schema whose output is a normalized query that can go straight to a repository:

```js
{ page, limit, offset, sort: [{ field, column, direction }], q?, filters: { ... } }
```

| Concern      | Rule                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy     | Offset pagination: `page` (1..10000, default 1), `limit` (1..100, default 20). A page past the end is `200` with `items: []`. Deep or infinite lists should get a cursor (keyset) strategy per endpoint; offset gets slow and unstable with depth                      |
| Sorting      | `sort=-price,name`: max 3 fields, no duplicates. The **allowlist is a map** `{ apiName: dbColumn }`; the validated output contains only the mapped column, so user text never becomes a column name. The regex built from the allowlist is also what OpenAPI documents |
| Filters      | Only filters declared in `filters` exist; each is a Zod schema. Cross-field rules go in `checkFilters` (e.g. `minPrice <= maxPrice`)                                                                                                                                   |
| Search       | `q`: trimmed, 1..100 chars, no control characters. An empty `q` is an error, not "no search"                                                                                                                                                                           |
| Unknown keys | Rejected (`400`)                                                                                                                                                                                                                                                       |

`buildPagination({ page, limit, total })` produces the response block: `{ page, limit, total, totalPages, hasNext, hasPrev }`.

## Response convention

No blanket envelope.

| Case            | Shape                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Single resource | The bare object (`200`, or `201` + `Location` on create)                                      |
| Collection      | `{ "items": [...], "pagination": {...} }`                                                     |
| No content      | `204`, empty body                                                                             |
| Error           | `{ "error": { "code", "message", "details?" } }` (see [error-handling.md](error-handling.md)) |

## API compatibility rules (v1)

- Version lives in the URL prefix (`/api/v1`). Breaking changes require `/api/v2`; v1 keeps working during a documented deprecation window (`Deprecation` and `Sunset` headers).
- **Non-breaking (allowed in v1):** new endpoints; new optional request fields/query params; new response fields; new error codes for new situations; loosening validation.
- **Breaking (needs v2):** removing or renaming a field/endpoint; changing a type, format or unit; making an optional input required; tightening validation of existing input; changing a status code or an error `code`; changing a default (sort order, page size).
- Clients must ignore unknown response fields and treat enum values as open. The server rejects unknown _request_ fields, so adding an accepted field is additive.
- Response and request schemas live in code (`*.schemas.js`); a schema change is the contract change, so review it as one.

## How to add a validated route

1. Define schemas in `<module>.schemas.js` (`z.strictObject`; list queries via `buildListQuerySchema`).
2. `router.post('/path', validate({ params, query, body }), handler)`.
3. In the handler read `res.locals.valid`, never raw `req.*`.
4. Throw `AppError`s for domain failures (`NotFoundError`, `ConflictError`).
5. Verify manually (see below) and update this doc and the matrix.

## Manual verification (repeatable)

```bash
npm run dev
B=localhost:3000/api/v1/examples/validation/demo-products
curl "$B?category=shoes&sort=-price&limit=2"                      # 200, items + pagination
curl "$B?limit=0&role=admin&sort=password"                        # 400, 3 details (limit, unknown key, sort)
curl -X POST $B -H 'content-type: application/json' -d '{"sku":"X1","role":"admin"}'   # 400, details per field
curl $B/not-a-uuid                                                # 400, source params
```

## Files

`src/http/validate.js`, `src/http/schemas.js`, `src/http/query/{fields,pagination,sorting,list-query}.js`, `src/errors/zod-details.js`, `src/modules/products/products.schemas.js`, `src/examples/validation-examples.routes.js`.

## Tests (existing, no new tests are being written)

`npm test` → `tests/unit/{query-helpers,validate-middleware}.test.js`, `tests/integration/validation.test.js`.

## Tradeoffs

- The demo list uses in-memory data; its normalized query is exactly what Phase 9 passes to the Mongoose repository.
- No generated API documentation on `main` yet: request/response shapes are documented here and in the schemas. The OpenAPI/Swagger layer exists on `feature/openapi-swagger`.
