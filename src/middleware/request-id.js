// Request ID middleware: har request ko ek unique ID deta hai.
//
// Kyun: jab logs mein hazaaron lines hon, to ek request ki saari lines ek ID se dhundh sakte hain
// (request log, error log, handler ka log). Client bhi response header se ID dekhkar support ko bata sakta hai.
// Isko "correlation ID" bhi kehte hain jab ek hi ID multiple services ke beech chalti hai.

import { randomUUID } from 'node:crypto';

// Header ka naam, request aur response dono mein yahi use hota hai.
export const REQUEST_ID_HEADER = 'X-Request-Id';

// Caller ki bheji hui ID tabhi accept karte hain jab wo chhoti ho aur sirf safe characters ho
// (letters, digits, `.`, `_`, `-`; 8 se 128 length). Warna koi client lambi ya ajeeb string bhejkar
// hamare logs mein junk (log injection) daal sakta hai.
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Har request ko ID deta hai: valid incoming `X-Request-Id` reuse karta hai, warna naya UUID banata hai.
 * ID response header mein bhi jaati hai aur `res.locals.requestId` mein bhi, taaki aage ka code (logger,
 * error handler, handlers) use kar sake.
 */
export function requestId(req, res, next) {
  // `req.get(name)` header padhta hai (case-insensitive).
  const incoming = req.get(REQUEST_ID_HEADER);
  // Valid hai to wahi, nahi to naya random UUID (e.g. 'f89d41ce-f360-4d5f-a1d5-813d7dc832b3').
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  // res.locals = sirf is ek request/response ka scratchpad; doosri requests ke saath share nahi hota.
  res.locals.requestId = id;
  res.set(REQUEST_ID_HEADER, id);
  // next() zaruri: ye middleware response nahi bhejta, sirf request ko "tag" karta hai.
  next();
}
