// Logger factory: poore app ka structured (JSON) logger yahin se banta hai.
//
// Pino ek fast logging library hai. Har log ek JSON line hoti hai (level, time, message + extra fields),
// jise log tools (ELK, Datadog...) asaani se search/filter kar sakte hain. Plain console.log text se ye behtar hai.

import pino from 'pino';

// Un keys ke naam jinki value logs mein "[Redacted]" ho jaani chahiye.
// Ye "defense in depth" hai (extra safety net): hamara request logger waise bhi headers, cookies ya bodies
// log nahi karta, lekin agar kisi developer ne galti se aisa object log kar diya jisme ye keys hain, to
// unki value chhup jayegi. Ye safety net hai, sensitive data log karne ki chhoot nahi.
//
// Path syntax (pino ka): 'password' = top-level key; '*.password' = ek level andar ki kisi bhi key ke neeche;
// 'req.headers.authorization' = nested exact path; `res.headers["set-cookie"]` = bracket syntax (dash wali key ke liye).
export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.authorization',
  '*.cookie',
  '*.set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

/**
 * Logger banata hai.
 * @param {object} options
 * @param {string} options.level pino level ('trace'...'fatal') ya 'silent' (kuch bhi log nahi)
 * @param {import('node:stream').Writable | {write: Function}} [options.stream] log kahan likhna hai; default stdout.
 *        Tests yahan ek in-memory collector dete hain taaki logs inspect kar sakein.
 */
export function createLogger({ level, stream }) {
  return pino(
    {
      level,
      // Har log line mein ye fixed field judta hai, taaki multiple services ke logs mein pehchan ho sake.
      base: { service: 'shopsphere' },
      // Time ko readable ISO format mein (2026-10-21T08:37:40.806Z), default epoch number ki jagah.
      timestamp: pino.stdTimeFunctions.isoTime,
      // Upar wali paths ki value `censor` text se badal do.
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    },
    stream,
  );
}
