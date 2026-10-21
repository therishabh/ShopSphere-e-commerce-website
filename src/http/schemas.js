// Poori API mein shared Zod schemas: error response aur pagination ka shape.
// Ye do kaam karte hain: (1) tests/clients ke liye "response contract" ka ek source, aur
// (2) OpenAPI spec mein components ban kar documentation mein jaate hain.

import { z } from 'zod';

// Har error response ka shape (src/http/error-handler.js yahi banata hai).
export const errorResponseSchema = z.object({
  error: z.object({
    code: z
      .string()
      .meta({ description: 'Stable machine-readable error code', example: 'VALIDATION_ERROR' }),
    message: z.string().meta({ description: 'Client-safe message' }),
    details: z
      .array(
        z.object({
          source: z.enum(['params', 'query', 'body']).optional(),
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional()
      .meta({ description: 'Field-level problems (validation errors only)' }),
  }),
});

// List responses ka pagination block (src/http/query/pagination.js ka buildPagination yahi banata hai).
export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

/** Collection response ka convention: `{ items: [...], pagination: {...} }`. */
export function listResponseSchema(itemSchema) {
  return z.object({ items: z.array(itemSchema), pagination: paginationSchema });
}
