// Sellers endpoints ke request schemas (strict: extra field reject).

import { z } from 'zod';
import { slug } from '../../http/query/fields.js';

// Seller banne ki arzi. `status`, `userId`, `approvedBy` jaise fields client nahi bhej sakta (strict): wo server tay karta hai.
export const applyBody = z.strictObject({
  storeName: z.string().trim().min(2).max(100),
  slug: slug().min(3),
  description: z.string().trim().max(2000).optional(),
});
