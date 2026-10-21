// Unit tests: conditional helpers (when/unless), request logger, aur logger redaction.
// Request logger ko fake req/res (EventEmitter) se test karte hain, taaki 'client ne beech mein connection tod diya'
// jaisa case bhi bina real network ke dikha sakein.

import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { when, unless } from '../../src/middleware/conditional.js';
import { createRequestLogger } from '../../src/middleware/request-logger.js';
import { createLogger, REDACT_PATHS } from '../../src/logging/logger.js';
import { createLogCapture } from '../helpers/log-capture.js';

// when/unless: predicate ke hisaab se middleware chalta hai ya seedha next() par jaata hai.
describe('when / unless', () => {
  const run = (wrapper, predicateResult) => {
    const inner = jest.fn((_req, _res, next) => next());
    const next = jest.fn();
    wrapper(() => predicateResult, inner)({}, {}, next);
    return { inner, next };
  };

  test('when: runs the middleware only if the predicate is true', () => {
    const yes = run(when, true);
    expect(yes.inner).toHaveBeenCalledTimes(1);
    expect(yes.next).toHaveBeenCalledTimes(1); // inner called next

    const no = run(when, false);
    expect(no.inner).not.toHaveBeenCalled();
    expect(no.next).toHaveBeenCalledTimes(1); // skipped straight to next
  });

  test('unless: inverse of when', () => {
    expect(run(unless, true).inner).not.toHaveBeenCalled();
    expect(run(unless, false).inner).toHaveBeenCalledTimes(1);
  });
});

// `res` ko EventEmitter banaya: test `res.emit('close')` karke response band hone ka event simulate karta hai.
describe('request logger (unit, fake req/res)', () => {
  // Fake req/res banata hai. `finished: false` = response poora likha jaane se pehle connection tootne ka case.
  function fakes({ finished }) {
    const req = { method: 'GET', originalUrl: '/x?token=abc', route: undefined };
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      locals: { requestId: 'id-12345678' },
      writableFinished: finished,
    });
    return { req, res };
  }

  test('logs "request aborted" when the connection closes before the response finishes', () => {
    const { logger, entries } = createLogCapture();
    const { req, res } = fakes({ finished: false });
    createRequestLogger(logger)(req, res, () => {});
    res.emit('close');
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      level: 40,
      msg: 'request aborted',
      aborted: true,
      requestId: 'id-12345678',
      path: '/x',
    });
  });

  test('exposes a request-scoped child logger on res.locals.log and calls next', () => {
    const { logger, entries } = createLogCapture();
    const { req, res } = fakes({ finished: true });
    const next = jest.fn();
    createRequestLogger(logger)(req, res, next);
    expect(next).toHaveBeenCalledWith();

    res.locals.log.info({ step: 'x' }, 'inside handler');
    expect(entries()[0]).toMatchObject({ msg: 'inside handler', requestId: 'id-12345678' });
  });

  test.each([
    [200, 30],
    [302, 30],
    [404, 40],
    [499, 40],
    [500, 50],
    [503, 50],
  ])('status %i is logged at pino level %i', (status, level) => {
    const { logger, entries } = createLogCapture();
    const { req, res } = fakes({ finished: true });
    res.statusCode = status;
    createRequestLogger(logger)(req, res, () => {});
    res.emit('close');
    expect(entries()[0]).toMatchObject({ status, level, msg: 'request completed' });
  });
});

// Safety net: agar koi galti se password/token/cookie wala object log kare to wo '[Redacted]' ban jaana chahiye.
describe('logger redaction', () => {
  test('censors sensitive keys if someone logs them', () => {
    const { logger, text } = createLogCapture();
    logger.info(
      {
        password: 'hunter2',
        user: { token: 'tok-123', cookie: 'sid=abc' },
        req: { headers: { authorization: 'Bearer xyz', cookie: 'sid=abc' } },
        safe: 'visible',
      },
      'test',
    );
    const out = text();
    for (const secret of ['hunter2', 'tok-123', 'sid=abc', 'Bearer xyz']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[Redacted]');
    expect(out).toContain('visible');
  });

  test('redact list covers the headline secrets', () => {
    for (const key of ['password', 'token', 'authorization', 'cookie']) {
      expect(REDACT_PATHS).toContain(key);
    }
  });

  test('a silent logger writes nothing', () => {
    const stream = { write: jest.fn() };
    createLogger({ level: 'silent', stream }).info('nope');
    expect(stream.write).not.toHaveBeenCalled();
  });
});
