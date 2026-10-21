// List endpoints ke liye ek hi jagah se query schema banane wala builder: pagination + sorting + search + filters.
//
// Kyun: har list endpoint (products, orders, users...) mein ye cheezein baar-baar chahiye. Yahan ek baar
// strict, allowlist-based schema ban jaata hai; har module sirf apni allowlist/filters deta hai.
// Output "normalized query" hota hai jise seedha repository (Mongoose query) ko diya ja sakta hai:
//   { page, limit, offset, sort: [{ field, column, direction }], q?, filters: {...} }

import { z } from 'zod';
import { paginationFields, resolvePagination, DEFAULT_LIMIT } from './pagination.js';
import { parseSort, sortFieldSchema } from './sorting.js';
import { searchTerm } from './fields.js';

/**
 * @param {object} options
 * @param {Record<string, string>} options.sortable  sort allowlist: API naam -> database column
 * @param {string} options.defaultSort  e.g. '-createdAt' (sort diya na ho to)
 * @param {Record<string, import('zod').ZodType>} [options.filters]  filter naam -> schema. Sirf yahi filters allowed.
 * @param {boolean} [options.search]  true ho to `q` (search term) accept hota hai
 * @param {number} [options.defaultLimit]
 * @param {(filters: object, ctx: import('zod').RefinementCtx) => void} [options.checkFilters]
 *        filters ke beech ke rules (e.g. minPrice <= maxPrice)
 */
export function buildListQuerySchema({
  sortable,
  defaultSort,
  filters = {},
  search = false,
  defaultLimit = DEFAULT_LIMIT,
  checkFilters,
}) {
  // Default sort bhi allowlist ke against check hota hai (developer ki galti startup par hi pakdi jaye).
  const defaultSortParsed = parseSort(sortable, defaultSort);

  // strictObject: allowlist ke bahar ki koi bhi query key (e.g. ?role=admin, ?sortt=price) 400 deti hai.
  const base = z.strictObject({
    ...paginationFields(),
    sort: sortFieldSchema(sortable).optional(),
    ...(search ? { q: searchTerm().optional() } : {}),
    // Har filter optional hai (na bheje to filter nahi lagta).
    ...Object.fromEntries(
      Object.entries(filters).map(([name, schema]) => [name, schema.optional()]),
    ),
  });

  return base
    .superRefine((value, ctx) => {
      if (checkFilters) checkFilters(value, ctx);
    })
    .transform((value) => {
      const { page, limit, sort, q, ...rest } = value;
      const filterValues = Object.fromEntries(
        Object.keys(filters)
          .filter((name) => rest[name] !== undefined)
          .map((name) => [name, rest[name]]),
      );
      return {
        ...resolvePagination({ page, limit }, { defaultLimit }),
        sort: sort ?? defaultSortParsed,
        ...(q !== undefined ? { q } : {}),
        filters: filterValues,
      };
    });
}
