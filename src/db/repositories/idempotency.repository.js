// Idempotency records ka data access. Order create jaisi requests mein client ki "Idempotency-Key" ko database ke unique index
// (userId, scope, key) se arbitrate karte hain: ek hi key ke liye sirf ek insert jeet sakta hai, chahe requests kitni bhi saath aayein.

import { serialize } from '../serialize.js';

export function createIdempotencyRepository({ IdempotencyRecord }) {
  return {
    /**
     * Key "claim" karna: IN_PROGRESS record insert. Pehle se (same user + scope + key) record ho to unique index E11000 deta hai;
     * tab us record ko padhkar wapas dete hain taaki service replay / conflict tay kare.
     * Ye transaction ke BAHAR chalta hai (checkout ke lambe hisse se pehle, turant visible hona chahiye).
     * @returns {Promise<{ claimed: boolean, record: object }>}
     */
    async claim({ userId, scope, key, requestHash, expiresAt }) {
      try {
        const [record] = await IdempotencyRecord.create([
          { userId, scope, key, requestHash, expiresAt },
        ]);
        return { claimed: true, record: serialize(record) };
      } catch (err) {
        if (err?.code !== 11000) throw err;
        const record = await IdempotencyRecord.findOne({ userId, scope, key }).lean();
        // Record is beech expire/delete ho gaya (bahut rare race): caller dobara claim kare.
        if (!record) return { claimed: false, record: null };
        return { claimed: false, record: serialize(record) };
      }
    },

    /** Final response save: IN_PROGRESS -> COMPLETED. Replay mein yahi status + body wapas jaata hai. */
    async complete({ id, responseStatus, responseBody }) {
      return serialize(
        await IdempotencyRecord.findOneAndUpdate(
          { _id: id, status: 'IN_PROGRESS' },
          { $set: { status: 'COMPLETED', responseStatus, responseBody } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /** Kuch bhi nahi hua (checkout order banne se pehle fail) to key chhod dena, taaki client wahi key se dobara try kar sake. */
    async release(id) {
      await IdempotencyRecord.deleteOne({ _id: id, status: 'IN_PROGRESS' });
    },
  };
}
