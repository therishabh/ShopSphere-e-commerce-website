// Admin endpoints ke request schemas (strict). List queries Phase 5 ke shared builder se (page/limit/sort allowlist/filters).

import { z } from 'zod';
import { buildListQuerySchema } from '../../http/query/list-query.js';
import { objectId } from '../../http/query/fields.js';
import { PRODUCT_STATUSES, SELLER_STATUSES } from '../../db/models/enums.js';

export const sellerIdParams = z.strictObject({ sellerId: objectId() });
export const productIdParams = z.strictObject({ productId: objectId() });

// reject/suspend ke liye kaaran zaruri: audit trail mein jaata hai aur (product ke case mein) seller ko dikhta hai.
export const reasonBody = z.strictObject({ reason: z.string().trim().min(3).max(500) });
// approve/reinstate par kaaran optional.
export const optionalNoteBody = z.strictObject({
  reason: z.string().trim().min(3).max(500).optional(),
});

export const sellerListQuery = buildListQuerySchema({
  sortable: { createdAt: 'createdAt' },
  defaultSort: '-createdAt',
  filters: { status: z.enum(SELLER_STATUSES) },
});

export const productModerationListQuery = buildListQuerySchema({
  sortable: { createdAt: 'createdAt', price: 'priceCents' },
  defaultSort: '-createdAt',
  filters: { status: z.enum(PRODUCT_STATUSES) },
});

export const auditListQuery = buildListQuerySchema({
  sortable: { createdAt: 'createdAt' },
  defaultSort: '-createdAt',
  filters: {
    entityType: z.string().regex(/^[A-Za-z]{1,50}$/, 'must be letters only'),
    entityId: objectId(),
    actorId: objectId(),
    action: z
      .string()
      .max(100)
      .regex(/^[a-z_]+\.[a-z_]+$/, 'must look like "seller.approved"'),
  },
});
