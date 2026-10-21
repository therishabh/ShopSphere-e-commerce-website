import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Accept a caller-supplied ID (so one ID can follow a call across services) only if it is
// short and made of safe characters; anything else would let a client inject junk into logs.
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Assigns every request an ID: reuses a valid incoming X-Request-Id, otherwise
 * generates a UUID. Exposes it on the response header and res.locals.requestId.
 */
export function requestId(req, res, next) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.set(REQUEST_ID_HEADER, id);
  next();
}
