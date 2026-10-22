// Carts ka data access. Cart ke saare writes ATOMIC conditional updates hain (padho-badlo-likho nahi), taaki do tabs/requests ek saath
// chalein to bhi kuch kho na jaye aur ek product do baar na dikhe.

import { serialize } from '../serialize.js';

// Ek cart-line ki quantity ki upper limit (cart schema aur collection validator ke 1..100 jaisi).
export const MAX_LINE_QUANTITY = 100;

export function createCartRepository({ Cart }) {
  return {
    /** User ka ACTIVE cart (nahi hai to null). Partial unique index ki wajah se ek user ka ek hi ACTIVE cart ho sakta hai. */
    async findActive(userId) {
      return serialize(await Cart.findOne({ userId, status: 'ACTIVE' }).lean());
    },

    /**
     * Product cart mein daalna (ya quantity badhana). Teen possible outcomes, aur race-safe tareeke se:
     *   1. Product pehle se line mein hai -> `$inc` (filter mein `quantity <= 100 - n`, isliye 100 se upar nahi jaata).
     *   2. Line hai par 100 se upar jaati -> 'LIMIT' (kuch nahi badla).
     *   3. Line nahi hai -> `$push` (filter: `items.productId != id`) with `upsert`: cart bhi na ho to ban jaata hai.
     * Do requests ek saath pehli baar cart banayein to partial unique index (userId, ACTIVE) ek ko E11000 deta hai; wo
     * dobara try karta hai aur ab cart mil jaata hai. 5 koshishon ke baad bhi na ho to 409 ("Concurrent update, please retry").
     * @returns {Promise<'UPDATED'|'ADDED'|'LIMIT'>}
     */
    async addItem({ userId, productId, quantity }) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const increased = await Cart.updateOne(
          {
            userId,
            status: 'ACTIVE',
            items: {
              $elemMatch: { productId, quantity: { $lte: MAX_LINE_QUANTITY - quantity } },
            },
          },
          { $inc: { 'items.$.quantity': quantity } },
        );
        if (increased.modifiedCount === 1) return 'UPDATED';

        // Inc nahi hua: ya line 100 se upar jaati (LIMIT), ya line abhi hai hi nahi, ya (race) line in DONO queries ke beech mein kisi ne
        // daal di. Pehla case alag se confirm karte hain, warna race ko galti se LIMIT bata dete (verify karte waqt aisa hua tha).
        const overLimit = await Cart.exists({
          userId,
          status: 'ACTIVE',
          items: { $elemMatch: { productId, quantity: { $gt: MAX_LINE_QUANTITY - quantity } } },
        });
        if (overLimit) return 'LIMIT';
        const present = await Cart.exists({
          userId,
          status: 'ACTIVE',
          'items.productId': productId,
        });
        if (present) continue; // line ab ban chuki hai: loop dobara `$inc` try karega

        try {
          await Cart.updateOne(
            { userId, status: 'ACTIVE', 'items.productId': { $ne: productId } },
            { $push: { items: { productId, quantity } } },
            { upsert: true },
          );
          return 'ADDED';
        } catch (err) {
          // E11000 = doosri request ne cart abhi banaya (ya line abhi daali): loop dobara chalta hai.
          if (err?.code !== 11000) throw err;
        }
      }
      throw Object.assign(new Error('cart update kept conflicting'), { code: 112 });
    },

    /** Line ki quantity set karna (absolute). @returns true agar line thi aur badli */
    async setQuantity({ userId, productId, quantity }) {
      const result = await Cart.updateOne(
        { userId, status: 'ACTIVE', 'items.productId': productId },
        { $set: { 'items.$.quantity': quantity } },
      );
      return result.matchedCount === 1;
    },

    /** Line hatana. @returns true agar line thi */
    async removeItem({ userId, productId }) {
      const result = await Cart.updateOne(
        { userId, status: 'ACTIVE', 'items.productId': productId },
        { $pull: { items: { productId } } },
      );
      return result.modifiedCount === 1;
    },

    /** Saari lines hatana (cart document rehta hai). */
    async clear(userId) {
      await Cart.updateOne({ userId, status: 'ACTIVE' }, { $set: { items: [] } });
    },

    /**
     * Checkout transaction ke andar: cart ACTIVE se CHECKED_OUT. Conditional hai (`status: ACTIVE`), isliye wahi user do checkouts
     * ek saath chalaye to sirf ek jeetta hai; doosra transaction write conflict par retry hota hai aur tab cart khaali/band milta hai.
     * @returns true agar is call ne cart band kiya
     */
    async markCheckedOut({ id, userId }) {
      const result = await Cart.updateOne(
        { _id: id, userId, status: 'ACTIVE' },
        { $set: { status: 'CHECKED_OUT' } },
      );
      return result.modifiedCount === 1;
    },
  };
}
