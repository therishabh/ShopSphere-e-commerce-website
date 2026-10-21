// Unit tests: error hierarchy (src/errors/), thrown value ki classification (toAppError), aur error handler
// (src/http/error-handler.js) fake req/res ke saath. Server ya network ki zarurat nahi.

import { jest } from '@jest/globals';
import { z } from 'zod';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ConflictError,
  InternalError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../src/errors/app-errors.js';
import { toAppError } from '../../src/errors/to-app-error.js';
import { createErrorHandler } from '../../src/http/error-handler.js';
import { createLogCapture } from '../helpers/log-capture.js';

// Har error class ka fixed HTTP status, stable code aur 'operational' flag.
describe('error hierarchy', () => {
  test.each([
    [ValidationError, 400, 'VALIDATION_ERROR'],
    [BadRequestError, 400, 'BAD_REQUEST'],
    [AuthenticationError, 401, 'UNAUTHENTICATED'],
    [AuthorizationError, 403, 'FORBIDDEN'],
    [NotFoundError, 404, 'NOT_FOUND'],
    [MethodNotAllowedError, 405, 'METHOD_NOT_ALLOWED'],
    [ConflictError, 409, 'CONFLICT'],
    [PayloadTooLargeError, 413, 'PAYLOAD_TOO_LARGE'],
    [UnsupportedMediaTypeError, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [RateLimitError, 429, 'RATE_LIMITED'],
  ])('%p -> %i %s, operational', (Cls, statusCode, code) => {
    const err = new Cls();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ statusCode, code, isOperational: true, name: Cls.name });
    expect(typeof err.message).toBe('string');
  });

  test('InternalError is 500, not operational, with a generic message, keeping the cause', () => {
    const cause = new Error('db down at 10.0.0.5');
    const err = new InternalError({ cause });
    expect(err).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      isOperational: false,
      message: 'Internal Server Error',
    });
    expect(err.cause).toBe(cause);
  });

  test('custom message, details and cause are kept', () => {
    const cause = new Error('x');
    const err = new ValidationError('Bad input', {
      details: [{ path: 'a', message: 'required' }],
      cause,
      code: 'INVALID_PARAMETER',
    });
    expect(err).toMatchObject({
      message: 'Bad input',
      code: 'INVALID_PARAMETER',
      details: [{ path: 'a', message: 'required' }],
      statusCode: 400,
    });
    expect(err.cause).toBe(cause);
  });

  test('RateLimitError and MethodNotAllowedError carry response headers', () => {
    expect(new RateLimitError({ retryAfterSeconds: 30 }).headers).toEqual({ 'Retry-After': '30' });
    expect(new MethodNotAllowedError({ allow: 'GET, POST' }).headers).toEqual({
      Allow: 'GET, POST',
    });
    expect(new RateLimitError().headers).toBeUndefined();
  });
});

// Koi bhi thrown value (AppError, ZodError, library error, string, null...) kis AppError mein badalti hai.
describe('toAppError (classification)', () => {
  test('AppError passes through unchanged', () => {
    const err = new ConflictError();
    expect(toAppError(err)).toBe(err);
  });

  test('ZodError -> ValidationError with field details', () => {
    const result = z.strictObject({ email: z.string().email() }).safeParse({ email: 'nope' });
    const app = toAppError(result.error);
    expect(app).toBeInstanceOf(ValidationError);
    expect(app.statusCode).toBe(400);
    expect(app.details).toEqual([{ path: 'email', message: expect.any(String) }]);
    expect(app.cause).toBe(result.error);
  });

  test.each([
    [{ status: 400, type: 'entity.parse.failed' }, BadRequestError, 'Malformed request body'],
    [{ status: 400 }, BadRequestError, 'Bad Request'],
    [{ status: 403 }, AuthorizationError, 'Forbidden'],
    [{ statusCode: 404 }, NotFoundError, 'Resource not found'],
    [{ status: 413 }, PayloadTooLargeError, 'Payload Too Large'],
    [{ status: 415 }, UnsupportedMediaTypeError, 'Unsupported Media Type'],
  ])('library 4xx error %j -> %p', (shape, Cls, message) => {
    const original = Object.assign(new Error('raw library message with {"secret":1}'), shape);
    const app = toAppError(original);
    expect(app).toBeInstanceOf(Cls);
    expect(app.message).toBe(message); // raw message never copied
    expect(app.cause).toBe(original);
  });

  test('other 4xx statuses become a generic CLIENT_ERROR with the status text', () => {
    const app = toAppError(Object.assign(new Error('x'), { status: 418 }));
    expect(app).toMatchObject({ statusCode: 418, code: 'CLIENT_ERROR', message: "I'm a Teapot" });
  });

  test.each([
    ['plain Error', new Error('boom')],
    ['library 5xx', Object.assign(new Error('bad gateway'), { status: 502 })],
    ['string', 'oops'],
    ['null', null],
    ['undefined', undefined],
    ['object', { weird: true }],
  ])('%s -> InternalError (unexpected)', (_name, thrown) => {
    const app = toAppError(thrown);
    expect(app).toBeInstanceOf(InternalError);
    expect(app.isOperational).toBe(false);
    expect(app.message).toBe('Internal Server Error');
    expect(app.cause).toBe(thrown);
  });
});

// Handler ko seedha call karte hain; `res` ek fake object hai jiske methods jest.fn() spies hain, isliye hum dekh
// sakte hain ki handler ne kya call kiya (status, json, set) aur kya nahi.
describe('errorHandler (unit, fake req/res)', () => {
  // Har test ke liye fresh logger capture, fake res aur handler. `status` ko `function` (arrow nahi) rakha
  // taaki `this` use karke chaining (`res.status(...).json(...)`) kaam kare.
  function setup({ headersSent = false } = {}) {
    const capture = createLogCapture('debug');
    const res = {
      locals: { requestId: 'req-12345678' },
      headersSent,
      status: jest.fn(function status() {
        return this;
      }),
      set: jest.fn(),
      json: jest.fn(),
    };
    const next = jest.fn();
    const handler = createErrorHandler({ logger: capture.logger });
    return { capture, res, next, handler };
  }

  test('writes the safe JSON body, sets headers and records the error code', () => {
    const { res, next, handler } = setup();
    handler(new RateLimitError({ retryAfterSeconds: 7 }), {}, res, next);
    expect(res.set).toHaveBeenCalledWith({ 'Retry-After': '7' });
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(res.locals.errorCode).toBe('RATE_LIMITED');
    expect(next).not.toHaveBeenCalled();
  });

  test('unexpected error: generic body, full error (with stack) logged at error level', () => {
    const { capture, res, next, handler } = setup();
    handler(new Error('db password is hunter2'), {}, res, next);
    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|stack|Error:/);
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } });

    const [entry] = capture.entries();
    expect(entry).toMatchObject({ level: 50, msg: 'unexpected error', requestId: 'req-12345678' });
    expect(entry.err.message).toBe('db password is hunter2'); // diagnostics kept server-side
    expect(entry.err.stack).toContain('errors.test.js'); // original stack, not a wrapper's
  });

  test('operational error: no error-level log, no stack', () => {
    const { capture, res, next, handler } = setup();
    handler(new NotFoundError('Product not found'), {}, res, next);
    expect(capture.entries().filter((e) => e.level >= 40)).toEqual([]);
    expect(capture.text()).not.toContain('stack');
  });

  test('operational error with a cause logs the cause at debug only', () => {
    const { capture, res, next, handler } = setup();
    handler(new ConflictError('dup', { cause: new Error('unique violation') }), {}, res, next);
    const [entry] = capture.entries();
    expect(entry).toMatchObject({ level: 20, msg: 'operational error cause' });
  });

  // `throw 'secret'` jaisi value ka content logs mein nahi jaana chahiye, sirf type.
  test('non-Error thrown values are logged by type only, never by content', () => {
    const { capture, res, next, handler } = setup();
    handler('secret-token-abc', {}, res, next);
    expect(capture.text()).not.toContain('secret-token-abc');
    expect(capture.entries()[0].err.message).toBe('Non-Error value thrown (string)');
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // res.headersSent=true: response shuru ho chuka. Handler ko kuch likhna nahi chahiye, sirf next(err) se Express ke
  // default handler ko dena chahiye (wo connection band karta hai).
  test('response already started: delegates to next(err), writes nothing', () => {
    const { capture, res, next, handler } = setup({ headersSent: true });
    const err = new Error('late failure');
    handler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err); // original error goes to Express default handler
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.set).not.toHaveBeenCalled();
    expect(capture.entries()[0]).toMatchObject({ level: 50, headersSent: true });
  });

  test('operational error after headers were sent is still delegated and warned', () => {
    const { capture, res, next, handler } = setup({ headersSent: true });
    const err = new NotFoundError();
    handler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
    expect(capture.entries().at(-1)).toMatchObject({ level: 40, errorCode: 'NOT_FOUND' });
  });

  test('works without a request-scoped logger (e.g. /health)', () => {
    const { capture, res, next, handler } = setup();
    delete res.locals.log;
    handler(new Error('x'), {}, res, next);
    expect(capture.entries()[0].requestId).toBe('req-12345678');
  });
});
