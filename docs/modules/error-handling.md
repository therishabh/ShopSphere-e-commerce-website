# Error Handling

## Purpose

One place turns every failure into one safe response shape, and one place logs it. Handlers, services and middleware just throw (or `next(err)`); they never format error responses themselves.

## Propagation (Express 5)

| How the error is raised                                           | What happens                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `throw` in a sync handler/middleware                              | Express catches it and calls the error middleware                                                         |
| Rejected Promise / `throw` in an `async` handler                  | Express 5 catches it automatically. **No `try/catch` or async wrapper is needed** (the examples use none) |
| `next(err)`                                                       | Skips all normal middleware/handlers, goes to the error middleware                                        |
| Library error (body-parser, undecodable URL, blocked static path) | Same path; classified by status (see below)                                                               |
| Nothing matched the request                                       | `notFound` calls `next(new NotFoundError())`                                                              |

All of these end at `src/http/error-handler.js`, mounted last in `src/app.js` (after `notFound`). An error middleware has four arguments; Express identifies it by that.

## Classification (`src/errors/to-app-error.js`)

| Input                                                        | Becomes                                                                                                           | Client sees                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AppError` (any subclass)                                    | itself                                                                                                            | its `statusCode`, `code`, `message`, `details`                                           |
| `ZodError`                                                   | `ValidationError` 400                                                                                             | `VALIDATION_ERROR` + `details: [{path, message}]`                                        |
| library error with status 400/403/404/413/415                | `BadRequestError` / `AuthorizationError` / `NotFoundError` / `PayloadTooLargeError` / `UnsupportedMediaTypeError` | fixed message (the library's raw message is never copied: it can contain body fragments) |
| other 4xx status                                             | `AppError` `CLIENT_ERROR`                                                                                         | HTTP status text                                                                         |
| anything else (plain `Error`, 5xx, `throw 'string'`, `null`) | `InternalError` 500                                                                                               | `INTERNAL_ERROR` / "Internal Server Error"                                               |

**Operational vs unexpected.** `isOperational = true`: expected failure caused by the caller or normal state (validation, 404, conflict, rate limit). `false`: bug or infrastructure failure (`InternalError`); someone must investigate.

| Class                       | Status               | `code`                                                     |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `ValidationError`           | 400                  | `VALIDATION_ERROR` (overridable, e.g. `INVALID_PARAMETER`) |
| `BadRequestError`           | 400                  | `BAD_REQUEST`                                              |
| `AuthenticationError`       | 401                  | `UNAUTHENTICATED`                                          |
| `AuthorizationError`        | 403                  | `FORBIDDEN`                                                |
| `NotFoundError`             | 404                  | `NOT_FOUND`                                                |
| `MethodNotAllowedError`     | 405 (+`Allow`)       | `METHOD_NOT_ALLOWED`                                       |
| `ConflictError`             | 409                  | `CONFLICT`                                                 |
| `PayloadTooLargeError`      | 413                  | `PAYLOAD_TOO_LARGE`                                        |
| `UnsupportedMediaTypeError` | 415                  | `UNSUPPORTED_MEDIA_TYPE`                                   |
| `RateLimitError`            | 429 (+`Retry-After`) | `RATE_LIMITED`                                             |
| `InternalError`             | 500                  | `INTERNAL_ERROR`                                           |

## Response contract

```json
{ "error": { "code": "CONFLICT", "message": "SKU already exists", "details": [] } }
```

`details` only when present. No stack, no `cause`, no raw error text, ever. The handler has **no `NODE_ENV` branch**: production and development bodies are identical, so safety does not depend on correct environment configuration. Dev diagnostics come from logs. The request ID is in the `X-Request-Id` header (not the body) so support can look up the matching log.

**`message` contract:** an `AppError` message goes to the client verbatim. Never put internal detail, SQL, paths or raw user input in it; put those in `cause` (logged, never sent).

## Logging

| Kind                     | What is logged                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational              | No extra line and no stack. The single request line gets `errorCode` (e.g. `NOT_FOUND`) at `warn` (4xx). If a `cause` exists it is logged at `debug`                                                       |
| Unexpected               | One `error`-level line `"unexpected error"` with the **original** error (message + stack, via pino's `err` serializer) and `requestId`; plus the request line (`status: 500`, `errorCode: INTERNAL_ERROR`) |
| Non-`Error` thrown value | Logged as "Non-Error value thrown (string)": type only, never content                                                                                                                                      |

Operational errors on a response that already started are logged at `warn`, unexpected ones at `error`, with `headersSent: true`.

Caveat: unexpected-error logs contain the real error message. Pino redaction covers known keys (`password`, `token`, ...) but not secrets embedded in message text, so do not build error messages from secrets.

## `res.headersSent`

If headers were already sent (e.g. streaming failed midway) the handler cannot change status or append a JSON body. It logs, then calls `next(err)` so Express's default handler closes the connection; the client sees a truncated response instead of a "successful" one. Tested with a real server (`/api/v1/examples/errors/after-headers`: status 200, body `partial`, `complete === false`) and with a unit test using a fake `res`.

## Async services and database adapters

Services and repositories just `throw`. Domain failures throw the matching `AppError` (`ConflictError`, `NotFoundError`); everything else (driver errors, network failures) is not an `AppError`, so it becomes a generic 500 with the original error logged. Phase 6 adds a mapping layer for known DB errors (e.g. unique violation → `ConflictError`) at the repository boundary; add new mappings there, not in controllers.

## How to add an error type

1. Add a class in `src/errors/app-errors.js`: extend `AppError`, pick `statusCode` and a stable UPPER_SNAKE `code`, default a client-safe message, keep it operational.
2. If a library throws it, add a case to `fromClientStatus` / `toAppError` in `src/errors/to-app-error.js`.
3. Throw it from services/handlers. No other change: the handler renders it.
4. Add a row to the tables above, cases to `tests/unit/errors.test.js`, and an integration test for the route.

## Files

`src/errors/app-errors.js`, `src/errors/to-app-error.js`, `src/http/error-handler.js`, `src/http/not-found.js`, `src/http/route-guards.js` (guards now `next(new ...Error)`), `src/examples/error-examples.routes.js` (non-production teaching routes).

## Tests

`npm test` → `tests/unit/errors.test.js`, `tests/integration/error-handling.test.js`; earlier suites (`routing`, `middleware`) also exercise the shared pipeline.

## Tradeoffs

- Examples that previously sent inline error JSON (route guards, notes routes) now throw; response bodies are unchanged.
- `/api/v1/examples/middleware/guarded` still sends its 403 inline on purpose: it demonstrates stopping the pipeline by responding.
- Validation errors are 400 (not 422) to stay consistent with Phase 2; revisit in Phase 5 if the API contract needs 422.
- `details` is a plain array of `{path, message}`; Phase 5 may add the source (`body|query|params`).
