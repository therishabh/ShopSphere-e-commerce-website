// Inventory ke multi-product operations: checkout/order lifecycle (Phase 10) ke liye stock rokna, bechna, chhodna, wapas rakhna.
//
// Single product ka atomic update repository mein hai (products.repository.js: reserve/release/commitReservation/restock). Yahan wo
// kaam hai jisme KAI products ek saath badalte hain (cart mein 3 items): ya to teeno ka stock badalna chahiye ya koi nahi. Isliye
// transaction: beech mein ek bhi item fail ho (stock kam) to pehle ke badlav bhi rollback ho jaate hain.
//
// Do roop:
//   - `reserveItems(products, items)` jaise PLAIN functions: caller ke chalte hue transaction ke andar use karne ke liye (checkout
//     ek hi transaction mein stock + order + payment attempt + cart likhta hai). Nested transaction MongoDB mein nahi chalte, isliye
//     inventory ko apna transaction kholne wala wrapper checkout ke andar bulana galat hota.
//   - `createInventoryService({ database })`: standalone use ke liye wahi functions apne transaction mein.
// Stock ki life: reserve (onHand same, reserved +n) -> payment ok: commit (onHand -n, reserved -n) | payment fail: release (reserved -n)
//   | paid order cancel: restock (onHand +n).
import { ConflictError } from '../../errors/app-errors.js';

// Items ko productId se sort karte hain: do checkouts ek hi products ko ulte order mein lock karein to transaction conflict
// (deadlock jaisa) hota; ek fixed order se wo hamesha ek hi taraf se guzarte hain.
const ordered = (items) => [...items].sort((a, b) => a.productId.localeCompare(b.productId));

/** Har item ka stock rokta hai. Kisi ka bhi available kam ho to 409 (caller ka transaction rollback hota hai). */
export async function reserveItems(products, items) {
  for (const { productId, quantity } of ordered(items)) {
    const updated = await products.reserve({ id: productId, quantity });
    if (!updated) {
      throw new ConflictError(`Insufficient stock for product ${productId}`, {
        details: [
          { path: 'items', message: `product ${productId} is out of stock or unavailable` },
        ],
      });
    }
  }
}

/** Roka hua stock wapas. Reserved se zyada chhodna 409 (double release bug pakadne ke liye). */
export async function releaseItems(products, items) {
  for (const { productId, quantity } of ordered(items)) {
    const updated = await products.release({ id: productId, quantity });
    if (!updated) throw new ConflictError(`Cannot release stock for product ${productId}`);
  }
}

/** Payment ke baad roka hua stock "bik gaya": onHand aur reserved dono ghatte hain. */
export async function commitItems(products, items) {
  for (const { productId, quantity } of ordered(items)) {
    const updated = await products.commitReservation({ id: productId, quantity });
    if (!updated) throw new ConflictError(`Cannot commit stock for product ${productId}`);
  }
}

/** Paid par ship na hua order cancel: maal wapas shelf par (onHand +n). */
export async function restockItems(products, items) {
  for (const { productId, quantity } of ordered(items)) {
    const updated = await products.restock({ id: productId, quantity });
    if (!updated) throw new ConflictError(`Cannot restock product ${productId}`);
  }
}

export function createInventoryService({ database }) {
  const inTransaction = (fn) => (items) =>
    database.transaction(async ({ products }) => {
      await fn(products, items);
    });
  return {
    /** @throws ConflictError (409) agar kisi bhi item ka available stock kam hai ya product public nahi hai; tab kuch bhi nahi rukta */
    reserveMany: inTransaction(reserveItems),
    releaseMany: inTransaction(releaseItems),
    commitMany: inTransaction(commitItems),
    restockMany: inTransaction(restockItems),
  };
}
