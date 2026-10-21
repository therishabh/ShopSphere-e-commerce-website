// Sequence numbers (order number jaise) ka data access.
//
// `findOneAndUpdate` + `$inc` + `upsert` ek hi atomic operation hai: do requests ek saath aayein to bhi alag-alag number
// milte hain (duplicate nahi). Transaction ke andar call karo to rollback par number "kha jaata" hai (gap), jo theek hai:
// order numbers unique hone chahiye, gap-free nahi.

export function createSequenceRepository({ Counter }) {
  return {
    /** @returns {Promise<number>} agla number (1 se shuru) */
    async next(name) {
      const counter = await Counter.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).lean();
      return counter.seq;
    },
  };
}
