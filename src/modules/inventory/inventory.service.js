// Inventory ke multi-product operations: checkout (Phase 10) ke liye stock rokna aur chhodna.
//
// Single product ka atomic update (`reserve`/`release`) repository mein hai (products.repository.js). Yahan wo kaam hai jisme
// KAI products ek saath badalne hain (cart mein 3 items): ya to teeno ka stock rukna chahiye ya koi nahi. Isliye transaction:
// beech mein ek bhi item fail ho (stock kam) to pehle rok chuke items ka `reserved` bhi rollback ho jaata hai.
//
// Abhi koi HTTP route ise call nahi karta (cart/checkout Phase 10 mein aayega); iska behaviour manual concurrency probe se
// verify hua hai (docs/modules/catalog-and-inventory.md).
import { ConflictError } from '../../errors/app-errors.js';

export function createInventoryService({ database }) {
  // Items ko productId se sort karte hain: do checkouts ek hi products ko ulte order mein lock karein to transaction conflict
  // (deadlock jaisa) hota; ek fixed order se wo hamesha ek hi taraf se guzarte hain.
  const ordered = (items) => [...items].sort((a, b) => a.productId.localeCompare(b.productId));

  return {
    /**
     * @param {{ productId: string, quantity: number }[]} items
     * @throws ConflictError (409) agar kisi bhi item ka available stock kam hai ya product public nahi hai; tab kuch bhi nahi rukta
     */
    reserveMany(items) {
      return database.transaction(async ({ products }) => {
        const reserved = [];
        for (const { productId, quantity } of ordered(items)) {
          const updated = await products.reserve({ id: productId, quantity });
          if (!updated) throw new ConflictError(`Insufficient stock for product ${productId}`);
          reserved.push({ productId, quantity });
        }
        return reserved;
      });
    },

    /** Roka hua stock wapas (all-or-nothing). Reserved se zyada chhodne ki koshish 409 hai (double release bug pakadne ke liye). */
    releaseMany(items) {
      return database.transaction(async ({ products }) => {
        for (const { productId, quantity } of ordered(items)) {
          const updated = await products.release({ id: productId, quantity });
          if (!updated) throw new ConflictError(`Cannot release stock for product ${productId}`);
        }
      });
    },
  };
}
