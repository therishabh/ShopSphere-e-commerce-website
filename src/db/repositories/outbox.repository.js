// Transactional outbox ka data access.
//
// Idea: business data badalne wale transaction ke andar hi yahan ek document likho (`enqueue`). Transaction commit hua
// to event pakka likha gaya, rollback hua to event bhi nahi. Baad mein worker (Phase 14) documents uthakar actual kaam
// (email, notification, realtime event) karta hai. Isse "DB commit ho gaya par message kho gaya" ya ulta nahi hota.

import { serialize } from '../serialize.js';

export function createOutboxRepository({ OutboxEvent }) {
  return {
    /** Hamesha `database.transaction()` ke andar call karo (usi transaction mein business change ke saath), tabhi atomicity milti hai. */
    async enqueue({ type, aggregateType, aggregateId, payload, availableAt }) {
      const [event] = await OutboxEvent.create([
        { type, aggregateType, aggregateId, payload, ...(availableAt ? { availableAt } : {}) },
      ]);
      return serialize(event);
    },

    /** Abhi process karne layak documents (PENDING/FAILED jinka time aa gaya). Claim/lock logic worker phase mein. */
    async findDue(limit = 50) {
      const rows = await OutboxEvent.find({
        status: { $in: ['PENDING', 'FAILED'] },
        availableAt: { $lte: new Date() },
      })
        .sort({ availableAt: 1 })
        .limit(limit)
        .lean();
      return rows.map((row) => serialize(row));
    },
  };
}
