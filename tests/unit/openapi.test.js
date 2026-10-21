import { Router } from 'express';
import { z } from 'zod';
import { Validator } from '@seriousme/openapi-schema-validator';
import { createContractRegistry, defineRoute } from '../../src/openapi/contract.js';
import { buildOpenApiSpec } from '../../src/openapi/build-spec.js';
import { errorResponseSchema } from '../../src/http/schemas.js';
import {
  createDemoProduct,
  getDemoProduct,
  listDemoProducts,
} from '../../src/examples/validation-examples.routes.js';

const base = {
  method: 'get',
  basePath: '/things',
  path: '/:thingId',
  operationId: 'getThing',
  summary: 'Get a thing',
  tags: ['Things'],
  request: { params: z.strictObject({ thingId: z.uuid() }) },
  responses: { 200: { description: 'ok', schema: z.object({ id: z.string() }) } },
};

describe('defineRoute', () => {
  test('builds a frozen contract with the full path', () => {
    const contract = defineRoute(base);
    expect(contract.fullPath).toBe('/things/:thingId');
    expect(Object.isFrozen(contract)).toBe(true);
  });

  test('adds standard error responses automatically', () => {
    const { responses } = defineRoute(base);
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '500']);
    expect(responses[400].schema).toBe(errorResponseSchema);
    expect(responses[200].schema).toBeDefined();
  });

  test('bodies add 415; routes without request schemas get no 400', () => {
    const withBody = defineRoute({
      ...base,
      method: 'post',
      path: '/',
      request: { body: z.strictObject({ a: z.string() }) },
    });
    expect(Object.keys(withBody.responses).sort()).toEqual(['200', '400', '415', '500']);

    const bare = defineRoute({ ...base, path: '/', request: {} });
    expect(Object.keys(bare.responses).sort()).toEqual(['200', '500']);
  });

  test('author-supplied responses override the defaults and gain the error schema', () => {
    const { responses } = defineRoute({
      ...base,
      responses: { 200: base.responses[200], 404: { description: 'nope' } },
    });
    expect(responses[404].schema).toBe(errorResponseSchema);
    const custom = defineRoute({
      ...base,
      responses: { ...base.responses, 400: { description: 'custom' } },
    });
    expect(custom.responses[400].description).toBe('custom');
  });

  test('a response without schema and below 400 stays body-less', () => {
    const { responses } = defineRoute({ ...base, responses: { 204: { description: 'gone' } } });
    expect(responses[204].schema).toBeUndefined();
  });

  test.each([
    ['unsupported method', { method: 'trace' }],
    ['path placeholder missing from the params schema', { request: {} }],
    ['params schema key missing from the path', { path: '/' }],
    ['different placeholder name', { path: '/:id' }],
  ])('rejects %s', (_name, patch) => {
    expect(() => defineRoute({ ...base, ...patch })).toThrow();
  });
});

describe('createContractRegistry', () => {
  test('mount registers the Express route and records the contract', () => {
    const registry = createContractRegistry();
    const router = Router();
    const contract = defineRoute({ ...base, path: '/', request: {}, operationId: 'listThings' });
    registry.mount(router, contract, (_req, res) => res.json({ ok: true }));

    expect(registry.contracts).toEqual([contract]);
    expect(router.stack).toHaveLength(1);
    expect(router.stack[0].route.path).toBe('/');
    expect(router.stack[0].route.methods).toEqual({ get: true });
  });
});

describe('buildOpenApiSpec', () => {
  const contracts = [listDemoProducts, getDemoProduct, createDemoProduct];
  const spec = buildOpenApiSpec({ contracts });

  test('is a valid OpenAPI 3.0 document', async () => {
    const result = await new Validator().validate(structuredClone(spec));
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.servers).toEqual([{ url: '/api/v1' }]);
  });

  test('express :params become {params} and methods are grouped under one path', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/examples/validation/demo-products',
      '/examples/validation/demo-products/{productId}',
    ]);
    expect(Object.keys(spec.paths['/examples/validation/demo-products']).sort()).toEqual([
      'get',
      'post',
    ]);
  });

  test('operation ids are unique', () => {
    const ids = Object.values(spec.paths).flatMap((methods) =>
      Object.values(methods).map((op) => op.operationId),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['createDemoProduct', 'getDemoProduct', 'listDemoProducts']);
  });

  test('query parameters are documented from the real schema and are optional', () => {
    const params = spec.paths['/examples/validation/demo-products'].get.parameters;
    expect(params.map((p) => p.name).sort()).toEqual(
      ['category', 'inStock', 'limit', 'maxPrice', 'minPrice', 'page', 'q', 'sort'].sort(),
    );
    expect(params.every((p) => p.in === 'query' && p.required === false)).toBe(true);
    const sort = params.find((p) => p.name === 'sort');
    expect(sort.schema.pattern).toContain('price|createdAt|name');
  });

  test('path parameters are required and typed', () => {
    const [param] = spec.paths['/examples/validation/demo-products/{productId}'].get.parameters;
    expect(param).toMatchObject({ name: 'productId', in: 'path', required: true });
    expect(param.schema.format).toBe('uuid');
  });

  test('request body mirrors the strict schema', () => {
    const { requestBody } = spec.paths['/examples/validation/demo-products'].post;
    const schema = requestBody.content['application/json'].schema;
    expect(requestBody.required).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual([
      'category',
      'currency',
      'name',
      'priceCents',
      'sku',
      'stock',
    ]);
    expect(schema.properties.currency.enum).toEqual(['INR', 'USD', 'EUR']);
    expect(schema.properties.priceCents.maximum).toBe(100000000);
  });

  test('responses list success and error statuses; errors reference one shared component', () => {
    const post = spec.paths['/examples/validation/demo-products'].post.responses;
    expect(Object.keys(post).sort()).toEqual(['201', '400', '409', '415', '500']);
    expect(post[409].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ErrorResponse',
    });
    expect(spec.components.schemas.ErrorResponse.properties.error.required).toEqual([
      'code',
      'message',
    ]);
  });

  test('no JSON-Schema-only keys leak into the document', () => {
    const text = JSON.stringify(spec);
    expect(text).not.toContain('"$schema"');
    expect(text).not.toContain('definitions');
  });

  test('an empty contract list gives a valid empty document', async () => {
    const empty = buildOpenApiSpec({ contracts: [] });
    expect(empty.paths).toEqual({});
    expect((await new Validator().validate(empty)).valid).toBe(true);
  });
});
