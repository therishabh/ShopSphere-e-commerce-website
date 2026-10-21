// Products module ke DTO (Data Transfer Object) schemas: API ke through jo data aata/jaata hai uska shape.
//
// DTO strategy: request schemas (query/params/body) aur response schema yahin define hote hain, database model
// (Mongoose models, src/db/models) se alag. Isse API contract database ke badlav se bandha nahi rehta: field rename ho to
// bhi API same rehti hai, bas mapping badalti hai. Abhi inka use sirf validation demo (src/examples/) mein hai;
// asli products endpoints Phase 9 mein inhi schemas se bante hain.

import { z } from 'zod';
import { buildListQuerySchema } from '../../http/query/list-query.js';
import { booleanString, intString, objectId, slug } from '../../http/query/fields.js';
import { listResponseSchema } from '../../http/schemas.js';

// Money hamesha integer "minor units" (paise/cents) mein: 49900 = 499.00 INR. Float se paisa kabhi nahi
// (0.1 + 0.2 != 0.3 jaisi rounding galtiyan hoti hain).
const MAX_PRICE_CENTS = 100_000_000;
export const CURRENCIES = ['INR', 'USD', 'EUR'];

// Sort allowlist: API naam -> database column. User sirf left side ke naam bhej sakta hai.
export const PRODUCT_SORTABLE = {
  price: 'priceCents',
  createdAt: 'createdAt',
  name: 'name',
};

// GET /products ka query: page, limit, sort, q (search) aur filters (category, minPrice, maxPrice, inStock).
export const productListQuerySchema = buildListQuerySchema({
  sortable: PRODUCT_SORTABLE,
  defaultSort: '-createdAt',
  search: true,
  filters: {
    category: slug(),
    minPrice: intString({
      min: 0,
      max: MAX_PRICE_CENTS,
      description: 'Minimum price in minor units (e.g. paise)',
    }),
    maxPrice: intString({
      min: 0,
      max: MAX_PRICE_CENTS,
      description: 'Maximum price in minor units (e.g. paise)',
    }),
    inStock: booleanString(),
  },
  // Do filters ke beech ka rule: minPrice <= maxPrice (field-level schema ye nahi dekh sakta).
  checkFilters: (value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minPrice'],
        message: 'minPrice must not exceed maxPrice',
      });
    }
  },
});

// /products/:productId ka param: MongoDB ObjectId (24 hex chars). Format yahin check ho jaata hai, isliye galat id database
// tak jaati hi nahi.
export const productIdParamsSchema = z.strictObject({
  productId: objectId(),
});

// POST /products ki body. strictObject = koi extra field (e.g. `id`, `status`, `sellerId`, `role`) allowed nahi:
// client wo fields set hi nahi kar sakta jo server decide karta hai (mass assignment protection).
export const createProductBodySchema = z.strictObject({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, 'must be 3-40 chars: uppercase letters, digits, hyphens')
    .meta({ description: 'Unique stock keeping unit', example: 'SHOE-BLK-42' }),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: slug(),
  priceCents: z
    .number()
    .int()
    .min(0)
    .max(MAX_PRICE_CENTS)
    .meta({ description: 'Price in minor units' }),
  currency: z.enum(CURRENCIES),
  stock: z.number().int().min(0).max(1_000_000),
});

// Response DTO: client ko product kaisa dikhta hai.
export const productSchema = z.object({
  id: objectId(),
  sku: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  priceCents: z.number().int(),
  currency: z.enum(CURRENCIES),
  stock: z.number().int(),
  // Dates hamesha ISO-8601 UTC string (e.g. 2026-10-21T08:00:00.000Z).
  createdAt: z.string().meta({ format: 'date-time' }),
});

export const productListResponseSchema = listResponseSchema(productSchema);

// --- Seller ke product mutations (Phase 8)

// PATCH /products/:productId: sirf ye teen fields badal sakte hain (strict: sku, status, sellerId, stock yahan se nahi badalte).
// Kam se kam ek field zaruri. Status/stock ke liye alag, explicit endpoints hain.
export const updateProductBodySchema = z
  .strictObject({
    name: createProductBodySchema.shape.name.optional(),
    description: createProductBodySchema.shape.description,
    priceCents: createProductBodySchema.shape.priceCents.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

// PUT /products/:productId/stock: physical stock (onHand) ki nayi value.
export const stockBodySchema = z.strictObject({
  onHand: z.number().int().min(0).max(1_000_000),
});
