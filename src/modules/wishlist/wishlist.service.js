// Wishlist ka business logic. Sab kuch actor ka apna: userId hamesha token/session se aati hai, kisi ka wishlist ID se nahi
// khulta (isliye "ownership" yahan structural hai: har query `userId = actor.id` ke saath chalti hai).
//
// Rules:
//   - Sirf public (ACTIVE) product wishlist mein jaa sakta hai; warna 404.
//   - Add idempotent hai: dobara add karne par duplicate row nahi banti (unique index (userId, productId)) aur error bhi nahi:
//     naya = 201, pehle se tha = 200.
//   - Remove: item wishlist mein nahi to 404.
//   - List mein wo products dikhte nahi jo ab public nahi (archived/hold/rejected), par row rehti hai: product wapas ACTIVE ho
//     to wishlist mein wapas dikh jata hai.
import { NotFoundError } from '../../errors/app-errors.js';
import { buildPagination } from '../../http/query/pagination.js';
import { toPublicProducts } from '../products/products.public.js';

export function createWishlistService({ database }) {
  const repos = database.repositories;
  return {
    async list({ actor, query }) {
      const { items, total } = await repos.wishlist.listForUser(actor.id, query);
      const products = await toPublicProducts(
        items.map((i) => i.product),
        repos.sellerProfiles,
      );
      return {
        items: items.map((item, index) => ({ addedAt: item.addedAt, product: products[index] })),
        pagination: buildPagination({ page: query.page, limit: query.limit, total }),
      };
    },

    /** @returns {{ created: boolean }} created true = nayi row (201), false = pehle se thi (200) */
    async add({ actor, productId }) {
      const product = await repos.products.findById(productId, { publicOnly: true });
      if (!product) throw new NotFoundError('Product not found');
      const created = await repos.wishlist.add({ userId: actor.id, productId });
      return { created };
    },

    async remove({ actor, productId }) {
      const removed = await repos.wishlist.remove({ userId: actor.id, productId });
      if (!removed) throw new NotFoundError('Product is not in your wishlist');
    },
  };
}
