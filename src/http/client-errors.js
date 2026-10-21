import { STATUS_CODES } from 'node:http';

const CODES = {
  400: 'BAD_REQUEST',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Interim handler for 4xx errors raised by Express itself and body-parser
 * (malformed JSON, oversized body, undecodable URL params, blocked static paths).
 * Messages are fixed, never the raw error text. Anything that is not a 4xx is
 * passed on untouched; Phase 4 replaces this with the centralized error handler.
 */
export function clientErrorHandler(err, _req, res, next) {
  const status = err.status ?? err.statusCode;
  if (res.headersSent || !Number.isInteger(status) || status < 400 || status > 499) {
    return next(err);
  }
  const message =
    err.type === 'entity.parse.failed' ? 'Malformed request body' : STATUS_CODES[status];
  res.status(status).json({ error: { code: CODES[status] ?? 'CLIENT_ERROR', message } });
}
