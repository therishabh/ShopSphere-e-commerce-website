// Offset pagination (page + limit): query parsing aur response metadata.
//
// Strategy: page/limit (offset) pagination. Simple hai, "page 3 par jao" aur total count dikhane ke liye
// accha hai. Kamzori: bahut deep pages par database ko offset tak rows skip karni padti hain (slow) aur beech
// mein data badle to rows skip/duplicate ho sakti hain. Isliye page ki upper limit rakhi hai; agar kisi list ko
// deep/infinite scroll chahiye to us endpoint ke liye cursor (keyset) pagination alag se add karni chahiye.

import { intString } from './fields.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
// Itne se zyada deep page maangna reject (offset = (page - 1) * limit database par bhaari padta hai).
export const MAX_PAGE = 10000;

/**
 * Pagination ke query fields ka schema "shape" (strictObject ke andar spread karne ke liye).
 * Output abhi strings se numbers mein badla hua milta hai; defaults normalize step mein lagte hain.
 */
export function paginationFields({ maxLimit = MAX_LIMIT, maxPage = MAX_PAGE } = {}) {
  return {
    page: intString({
      min: 1,
      max: maxPage,
      description: `Page number, starting at 1 (max ${maxPage})`,
    }).optional(),
    limit: intString({
      min: 1,
      max: maxLimit,
      description: `Items per page (1 to ${maxLimit})`,
    }).optional(),
  };
}

/** Validated page/limit se database ke liye offset nikalta hai (defaults ke saath). */
export function resolvePagination({ page, limit }, { defaultLimit = DEFAULT_LIMIT } = {}) {
  const resolvedPage = page ?? 1;
  const resolvedLimit = limit ?? defaultLimit;
  return { page: resolvedPage, limit: resolvedLimit, offset: (resolvedPage - 1) * resolvedLimit };
}

/**
 * Response ke liye pagination metadata. `total` = filters ke baad kul matching rows (page ke bahar bhi).
 * Page total se aage ho to items khaali aate hain; ye error nahi hai (200 + khaali list).
 */
export function buildPagination({ page, limit, total }) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}
