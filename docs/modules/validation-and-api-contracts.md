# Validation and API Contracts

## Purpose

Every request is validated by a Zod schema before any handler runs, list endpoints share one strict pagination/sorting/filtering toolkit, responses follow a small fixed convention, and the OpenAPI spec is generated from the same schemas that validate requests, so docs and behaviour cannot drift.

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

## Contracts and OpenAPI

A **contract** (`defineRoute` in `src/openapi/contract.js`) describes one route: method, path, request schemas, responses. `registry.mount(router, contract, handler)` is the only way contract routes are registered; it adds `validate(contract.request)` before the handler and records the contract. `buildOpenApiSpec` turns the recorded contracts into an OpenAPI 3.0.3 document using Zod 4's built-in `z.toJSONSchema` (no extra library):

- Requests use `io: 'input'` (what the client sends: query values are strings with a pattern). Responses use `io: 'output'`.
- Standard errors are added automatically: `400` (any request schema), `415` (body), `500`; authors list domain errors (`404`, `409`...). Errors reference one `ErrorResponse` component.
- `defineRoute` fails at startup if the path's `:placeholders` and the params schema disagree.

Served by `src/docs/docs.routes.js`:

| URL             | What                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/openapi.json` | the spec (built once at startup)                                                                                                                     |
| `/docs`         | Swagger UI from `swagger-ui-dist`, same-origin files only; the initializer is an external file so Helmet's CSP (`script-src 'self'`) works unchanged |

Docs are on in development/test and **off in production** by default; `API_DOCS_ENABLED=true|false` overrides either way. Contract routes in this phase are the non-production validation examples (`/api/v1/examples/validation/demo-products`), so a production spec is empty even when docs are enabled. Phase 2–4 teaching routes (`echo`, `notes`, `middleware`, `errors`) are intentionally not contract-based and not in the spec.

## API compatibility rules (v1)

- Version lives in the URL prefix (`/api/v1`). Breaking changes require `/api/v2`; v1 keeps working during a documented deprecation window (`Deprecation` and `Sunset` headers).
- **Non-breaking (allowed in v1):** new endpoints; new optional request fields/query params; new response fields; new error codes for new situations; loosening validation.
- **Breaking (needs v2):** removing or renaming a field/endpoint; changing a type, format or unit; making an optional input required; tightening validation of existing input; changing a status code or an error `code`; changing a default (sort order, page size).
- Clients must ignore unknown response fields and treat enum values as open. The server rejects unknown _request_ fields, so adding an accepted field is additive.
- A spec change ships in the same change as the schema change (they are one source), and the contract tests must pass unchanged for non-breaking changes.

## How to add a validated, documented route

1. Define schemas in `<module>.schemas.js` (`z.strictObject`).
2. `const contract = defineRoute({ method, basePath, path, operationId, summary, tags, request, responses })`.
3. `registry.mount(router, contract, handler)`; read `res.locals.valid`.
4. Throw `AppError`s for domain failures (`NotFoundError`, `ConflictError`).
5. Tests: valid, each invalid class, unknown field, bounds, and `assertMatchesContract(contract, res)` for every response.

## Files

`src/http/validate.js`, `src/http/schemas.js`, `src/http/query/{fields,pagination,sorting,list-query}.js`, `src/errors/zod-details.js`, `src/openapi/{contract,build-spec}.js`, `src/docs/docs.routes.js`, `src/modules/products/products.schemas.js`, `src/examples/validation-examples.routes.js`.

## Tests

`npm test` → `tests/unit/{query-helpers,validate-middleware,openapi}.test.js`, `tests/integration/{validation,api-docs}.test.js`; `tests/helpers/contract.js` checks every real response against its documented status and schema.

## Tradeoffs

- The demo list uses in-memory data; its normalized query is exactly what Phase 9 passes to Prisma.
- The spec describes request input as strings with patterns (what is on the wire) rather than integers, so generated clients treat numbers in the query as strings.
- Only contract routes appear in the spec; adding a feature module means adding its contracts, otherwise it is undocumented.
- Swagger UI is verified in a real browser (loads under the Helmet CSP, lists the three operations); there is no automated browser test.
