// Cart ka business logic. Cart actor ka apna hai (userId hamesha token/session se, URL/body se nahi), isliye "doosre ka cart" ka sawal
// hi nahi: har query `userId = actor.id` ke saath chalti hai.
//
// Rules:
//   - Sirf public (ACTIVE) product cart mein jaa sakta hai (warna 404); seller apna product nahi daal sakta (403).
//   - Line ki quantity 1..100. Add par quantity jud jaati hai, PATCH par set hoti hai.
//   - Cart mein price store nahi hota. GET /cart har baar current prices se naya hisaab deta hai (cart-pricing.js).
//   - Cart mein zyada se zyada 50 alag products (soft limit: do requests ek saath aakhri jagah maangein to 51 ho sakte hain; checkout
//     isse bigadta nahi, sirf cart bada hota hai).
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../../errors/app-errors.js';
import { LINE_PROBLEMS, priceCart } from './cart-pricing.js';

const MAX_CART_LINES = 50;

// Khareedne wale ka seller profile id (agar wo seller hai): "apna product khareedna" rokne ke liye.
export async function buyerSellerIdOf({ sellerProfiles }, actor) {
  if (actor.role !== 'SELLER') return undefined;
  return (await sellerProfiles.findByUserId(actor.id))?.id;
}

// Cart view ka response shape (allowlist: product ke internal fields nahi jaate).
function toCartView({ lines, totals, checkoutReady }) {
  return {
    items: lines.map((line) => ({
      productId: line.productId,
      name: line.product?.name ?? null,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents ?? null,
      currency: line.currency ?? null,
      lineTotalCents: line.lineTotalCents ?? null,
      available: line.available ?? 0,
      status: line.status,
      ...(line.status === 'OK' ? {} : { problem: LINE_PROBLEMS[line.status] }),
    })),
    totals,
    checkoutReady,
  };
}

export function createCartService({ database }) {
  const repos = database.repositories;

  async function view(actor) {
    const cart = await repos.carts.findActive(actor.id);
    const items = cart?.items ?? [];
    const productsById = await repos.products.findManyByIds(items.map((i) => String(i.productId)));
    const buyerSellerId = await buyerSellerIdOf(repos, actor);
    return toCartView(priceCart({ items, productsById, buyerSellerId }));
  }

  return {
    getCart: ({ actor }) => view(actor),

    /** @returns {{ created: boolean, cart: object }} created true = nayi line (201), false = quantity badhi (200) */
    async addItem({ actor, productId, quantity }) {
      const product = await repos.products.findById(productId, { publicOnly: true });
      if (!product) throw new NotFoundError('Product not found');
      const buyerSellerId = await buyerSellerIdOf(repos, actor);
      if (buyerSellerId && String(product.sellerId) === buyerSellerId) {
        throw new AuthorizationError('You cannot buy your own product', { code: 'OWN_PRODUCT' });
      }
      const existing = await repos.carts.findActive(actor.id);
      if (existing && existing.items.length >= MAX_CART_LINES) {
        const alreadyThere = existing.items.some((i) => String(i.productId) === productId);
        if (!alreadyThere) {
          throw new AppError(`A cart can hold at most ${MAX_CART_LINES} different products`, {
            statusCode: 409,
            code: 'CART_FULL',
          });
        }
      }
      const outcome = await repos.carts.addItem({ userId: actor.id, productId, quantity });
      if (outcome === 'LIMIT') {
        throw new ConflictError('At most 100 units of one product can be in a cart');
      }
      return { created: outcome === 'ADDED', cart: await view(actor) };
    },

    /** Quantity set karna (absolute). Line cart mein nahi to 404. */
    async setQuantity({ actor, productId, quantity }) {
      const updated = await repos.carts.setQuantity({ userId: actor.id, productId, quantity });
      if (!updated) throw new NotFoundError('Product is not in your cart');
      return view(actor);
    },

    async removeItem({ actor, productId }) {
      const removed = await repos.carts.removeItem({ userId: actor.id, productId });
      if (!removed) throw new NotFoundError('Product is not in your cart');
      return view(actor);
    },

    async clear({ actor }) {
      await repos.carts.clear(actor.id);
    },
  };
}
