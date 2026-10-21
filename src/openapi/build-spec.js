// OpenAPI 3.0 spec builder: contracts ki list se spec (JSON object) banata hai.
//
// Zod 4 mein JSON Schema generation built-in hai (`z.toJSONSchema`), isliye alag library nahi chahiye.
// Do modes:
//   io: 'input'  -> client JO BHEJTA hai (request side). Query values strings hain; transforms/defaults input side par
//                   nahi dikhte. Yahi sahi hai kyunki wire par wahi jaata hai.
//   io: 'output' -> server JO LAUTATA hai (response side).

import { z } from 'zod';
import { errorResponseSchema } from '../http/schemas.js';

const OPENAPI_VERSION = '3.0.3';

function toJsonSchema(schema, io) {
  const json = z.toJSONSchema(schema, { io, target: 'openapi-3.0', unrepresentable: 'any' });
  // `$schema` key OpenAPI mein valid nahi (wo plain JSON Schema ka hai), isliye hata dete hain.
  delete json.$schema;
  return json;
}

// Express ke `:id` ko OpenAPI ke `{id}` mein badalta hai.
const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

// Ek object schema ke har property ko ek OpenAPI "parameter" (path ya query) banata hai.
function toParameters(schema, location) {
  const json = toJsonSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, propSchema]) => ({
    name,
    in: location,
    // Path params hamesha required hote hain (OpenAPI rule).
    required: location === 'path' || required.has(name),
    ...(propSchema.description ? { description: propSchema.description } : {}),
    schema: propSchema,
  }));
}

function toOperation(contract) {
  const parameters = [
    ...(contract.request.params ? toParameters(contract.request.params, 'path') : []),
    ...(contract.request.query ? toParameters(contract.request.query, 'query') : []),
  ];

  const responses = Object.fromEntries(
    Object.entries(contract.responses).map(([status, response]) => {
      // Error responses ek shared component se refer karte hain (spec chhota aur saaf rehta hai).
      const isErrorSchema = response.schema === errorResponseSchema;
      const content = response.schema
        ? {
            'application/json': {
              schema: isErrorSchema
                ? { $ref: '#/components/schemas/ErrorResponse' }
                : toJsonSchema(response.schema, 'output'),
            },
          }
        : undefined;
      return [status, { description: response.description, ...(content ? { content } : {}) }];
    }),
  );

  return {
    operationId: contract.operationId,
    summary: contract.summary,
    tags: contract.tags,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(contract.request.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: toJsonSchema(contract.request.body, 'input') },
            },
          },
        }
      : {}),
    responses,
  };
}

/**
 * @param {object} options
 * @param {Array} options.contracts  createContractRegistry().contracts
 * @param {string} [options.title]
 * @param {string} [options.version]  API ka version (URL prefix /api/v1 ke saath match), package version nahi
 */
export function buildOpenApiSpec({ contracts, title = 'ShopSphere API', version = '1.0.0' }) {
  const paths = {};
  for (const contract of contracts) {
    const key = toOpenApiPath(contract.fullPath);
    paths[key] = { ...paths[key], [contract.method]: toOperation(contract) };
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title,
      version,
      description:
        'Contract-first API: this spec is generated from the same Zod schemas that validate requests.',
    },
    // Saare paths /api/v1 ke relative hain.
    servers: [{ url: '/api/v1' }],
    paths,
    components: { schemas: { ErrorResponse: toJsonSchema(errorResponseSchema, 'output') } },
  };
}
