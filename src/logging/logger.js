import pino from 'pino';

// Defense in depth: request logging never logs headers, cookies or bodies, but if a
// developer logs an object that contains these keys, they are censored.
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
 * @param {object} options
 * @param {string} options.level pino level or 'silent'
 * @param {import('node:stream').Writable | {write: Function}} [options.stream] destination; defaults to stdout. Tests pass a collector.
 */
export function createLogger({ level, stream }) {
  return pino(
    {
      level,
      base: { service: 'shopsphere' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    },
    stream,
  );
}
