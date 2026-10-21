import { jest } from '@jest/globals';
import { z } from 'zod';
import { validate } from '../../src/http/validate.js';
import { UnsupportedMediaTypeError, ValidationError } from '../../src/errors/app-errors.js';

function run(schemas, { params = {}, query = {}, body, json = true } = {}) {
  const req = { params, query, body, is: jest.fn(() => (json ? 'json' : false)) };
  const res = { locals: {} };
  const next = jest.fn();
  validate(schemas)(req, res, next);
  return { req, res, next };
}

describe('validate()', () => {
  test('valid input: validated values land in res.locals.valid and next() has no error', () => {
    const { res, next } = run(
      {
        params: z.strictObject({ id: z.string() }),
        query: z.strictObject({ page: z.string().transform(Number) }),
        body: z.strictObject({ name: z.string().trim() }),
      },
      { params: { id: 'a' }, query: { page: '3' }, body: { name: '  x  ' } },
    );
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.valid).toEqual({
      params: { id: 'a' },
      query: { page: 3 },
      body: { name: 'x' },
    });
  });

  test('raw request objects are left untouched', () => {
    const { req } = run(
      { query: z.strictObject({ page: z.string().transform(Number) }) },
      { query: { page: '3' } },
    );
    expect(req.query).toEqual({ page: '3' });
  });

  test('only the declared sources are validated', () => {
    const { res, next } = run({ query: z.strictObject({}) }, { params: { anything: 'goes' } });
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.valid).toEqual({ query: {} });
  });

  test('no schemas at all just continues', () => {
    const { res, next } = run({});
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.valid).toEqual({});
  });

  test('collects problems from every source in one ValidationError', () => {
    const { next } = run(
      {
        params: z.strictObject({ id: z.uuid() }),
        query: z.strictObject({ page: z.string() }),
        body: z.strictObject({ name: z.string() }),
      },
      { params: { id: 'nope' }, query: { page: '1', extra: 'x' }, body: {} },
    );
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.map((d) => d.source)).toEqual(['params', 'query', 'body']);
    expect(
      err.details.every((d) => typeof d.path === 'string' && typeof d.message === 'string'),
    ).toBe(true);
  });

  test('details carry dotted paths for nested fields', () => {
    const { next } = run(
      { body: z.strictObject({ address: z.strictObject({ city: z.string() }) }) },
      { body: { address: { city: 5 } } },
    );
    expect(next.mock.calls[0][0].details).toEqual([
      { source: 'body', path: 'address.city', message: expect.any(String) },
    ]);
  });

  test('unrecognized keys are rejected (mass assignment protection)', () => {
    const { next } = run(
      { body: z.strictObject({ name: z.string() }) },
      { body: { name: 'x', role: 'admin' } },
    );
    expect(next.mock.calls[0][0].details[0].message).toMatch(/Unrecognized key/);
  });

  test('a missing body is treated as an empty object, so required fields are reported', () => {
    const { next } = run({ body: z.strictObject({ name: z.string() }) }, { body: undefined });
    expect(next.mock.calls[0][0].details).toEqual([
      { source: 'body', path: 'name', message: expect.any(String) },
    ]);
  });

  test('non-JSON content type with a body schema -> 415, before any validation', () => {
    const { next, res } = run({ body: z.strictObject({}) }, { json: false, body: {} });
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnsupportedMediaTypeError);
    expect(res.locals.valid).toBeUndefined();
  });

  test('content type is not checked when there is no body schema', () => {
    const { next } = run({ query: z.strictObject({}) }, { json: false });
    expect(next).toHaveBeenCalledWith();
  });

  test('repeated query keys (arrays) fail string schemas', () => {
    const { next } = run(
      { query: z.strictObject({ page: z.string() }) },
      { query: { page: ['1', '2'] } },
    );
    expect(next.mock.calls[0][0]).toBeInstanceOf(ValidationError);
  });
});
