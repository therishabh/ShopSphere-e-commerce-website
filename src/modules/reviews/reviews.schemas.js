// Reviews ke request schemas. Sab `z.strictObject`: unknown field (e.g. `userId`, `productId` body mein) 400 hai, isliye client
// kisi aur ke naam se review nahi likh sakta (mass assignment band). userId actor se aati hai, productId URL se.
import { z } from 'zod';
import { buildListQuerySchema } from '../../http/query/list-query.js';
import { objectId } from '../../http/query/fields.js';

const rating = z.number().int().min(1).max(5);
const title = z.string().trim().min(1).max(120);
const body = z.string().trim().min(1).max(4000);

export const productReviewsParams = z.strictObject({ productId: objectId() });
export const reviewIdParams = z.strictObject({ reviewId: objectId() });

export const createReviewBody = z.strictObject({
  rating,
  title: title.optional(),
  body: body.optional(),
});

// Update mein koi bhi field optional, par kam se kam ek zaruri (khaali body se kuch nahi badalta).
export const updateReviewBody = z
  .strictObject({ rating: rating.optional(), title: title.optional(), body: body.optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

// Sort allowlist: sirf createdAt aur rating.
export const reviewListQuery = buildListQuerySchema({
  sortable: { createdAt: 'createdAt', rating: 'rating' },
  defaultSort: '-createdAt',
});
