// Route "contract": ek route ka poora description, ek hi jagah likha hua.
//
// PROBLEM jo ye solve karta hai:
//   Ek API route ke baare mein normally 3 alag jagah likhna padta hai:
//     1. route ka code            router.post('/products', handler)
//     2. validation rules         "body mein sku, name, price chahiye"
//     3. API documentation        frontend/QA ke liye "ye route kya leta hai, kya lautata hai"
//   Teeno alag likhoge to ek din validation badal jayegi aur docs purani reh jayegi (docs jhooth bolne lagte hain).
//
// SOLUTION: route ka description ek hi object (contract) mein likho:
//
//   const createProduct = defineRoute({
//     method: 'post', basePath: '/examples/validation', path: '/demo-products',
//     request:   { body: createProductBodySchema },            // validation rules (Zod)
//     responses: { 201: {...}, 409: { description: 'SKU already exists' } },
//   });
//   registry.mount(router, createProduct, handler);
//
// `registry.mount` ek saath 3 kaam karta hai:
//   a) Express route register karta hai,  b) handler se pehle validation laga deta hai,
//   c) is contract ko ek list (`registry.contracts`) mein jama kar leta hai.
// Baad mein build-spec.js us list se OpenAPI document (/openapi.json) aur Swagger UI page (/docs) banata hai.
// Matlab validation aur docs ek hi source se aate hain, isliye alag ho hi nahi sakte.
// (Jaise restaurant ka menu seedha kitchen ke order system se print ho, haath se alag likha hua nahi.)
//
// OpenAPI kya hai: API ko describe karne ka standard JSON format (kaunse URLs, methods, inputs, outputs, errors).
// Swagger UI us JSON ko ek webpage mein dikhata hai jahan frontend developer bina code padhe API dekh/try kar sakta hai.

import { errorResponseSchema } from '../http/schemas.js';
import { validate } from '../http/validate.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Express path ke `:name` placeholders ki list, e.g. '/items/:id' -> ['id'].
function pathParamNames(path) {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]);
}

/**
 * Contract object banata hai aur uski consistency check karta hai (galti ho to startup par hi throw).
 *
 * @param {object} def
 * @param {string} def.method  'get' | 'post' | ...
 * @param {string} def.basePath  router jis prefix par mount hota hai (/api/v1 ke andar), e.g. '/examples/validation'
 * @param {string} def.path  router ke andar ka path, e.g. '/demo-products/:productId'
 * @param {string} def.operationId  unique naam (spec mein operationId)
 * @param {string} def.summary
 * @param {string[]} def.tags
 * @param {{params?: object, query?: object, body?: object}} [def.request]  Zod schemas (strictObject)
 * @param {Record<number, {description: string, schema?: object}>} def.responses  success + domain errors (404, 409...)
 */
export function defineRoute({
  method,
  basePath,
  path,
  operationId,
  summary,
  tags,
  request = {},
  responses,
}) {
  if (!METHODS.includes(method)) throw new Error(`Unsupported method: ${method}`);

  // Path ke har :placeholder ka params schema mein hona zaruri hai (aur ulta), warna docs aur validation alag ho jayenge.
  const placeholders = pathParamNames(path).sort();
  const declared = request.params ? Object.keys(request.params.shape).sort() : [];
  if (JSON.stringify(placeholders) !== JSON.stringify(declared)) {
    throw new Error(
      `${operationId}: path params ${placeholders} do not match params schema ${declared}`,
    );
  }

  // Auto-documented errors: validation (400) tab jab koi request schema ho, 415 tab jab body ho, 500 hamesha.
  const hasRequestSchema = Boolean(request.params || request.query || request.body);
  const standardErrors = {
    ...(hasRequestSchema ? { 400: { description: 'Validation failed' } } : {}),
    ...(request.body ? { 415: { description: 'Content-Type must be application/json' } } : {}),
    500: { description: 'Unexpected server error' },
  };
  const merged = { ...standardErrors, ...responses };
  // Jin responses mein schema nahi diya (errors), unko common ErrorResponse schema milta hai.
  const normalized = Object.fromEntries(
    Object.entries(merged).map(([status, response]) => {
      const isError = Number(status) >= 400;
      return [
        status,
        { ...response, schema: response.schema ?? (isError ? errorResponseSchema : undefined) },
      ];
    }),
  );

  return Object.freeze({
    method,
    basePath,
    path,
    // Full path (api root se), jo OpenAPI mein jaata hai.
    fullPath: `${basePath}${path}`,
    operationId,
    summary,
    tags,
    request,
    responses: normalized,
  });
}

/**
 * Contracts ka collector. Router par route lagane ka sirf yehi (supported) tareeka hai:
 * `registry.mount(router, contract, handler)`. Isse har mounted route automatically spec ki list mein aa jaata hai.
 */
export function createContractRegistry() {
  // Registry = jama karne ki list. Har mount hua contract yahan append hota hai; app.js is list se spec banata hai.
  const contracts = [];

  function mount(router, contract, ...handlers) {
    // validate() pehle, phir handler(s): invalid request handler tak pahunchti hi nahi.
    router[contract.method](contract.path, validate(contract.request), ...handlers);
    contracts.push(contract);
  }

  return { contracts, mount };
}
