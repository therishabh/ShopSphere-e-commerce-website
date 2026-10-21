// Wishlist ke request schemas. Body koi nahi: product URL se aata hai aur user token/session se (client user ID nahi bhej sakta).
import { z } from 'zod';
import { buildListQuerySchema } from '../../http/query/list-query.js';
import { objectId } from '../../http/query/fields.js';

export const wishlistProductParams = z.strictObject({ productId: objectId() });

// Sort allowlist: kab add kiya (newest first default).
export const wishlistListQuery = buildListQuerySchema({
  sortable: { addedAt: 'createdAt' },
  defaultSort: '-addedAt',
});
