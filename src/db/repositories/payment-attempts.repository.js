// Payment attempts ka data access. Card/CVV jaisa kuch yahan kabhi nahi aata: sirf provider ka reference aur status.

import { serialize } from '../serialize.js';

export function createPaymentAttemptRepository({ PaymentAttempt }) {
  return {
    /** Checkout transaction ke andar order ke saath hi PENDING attempt (order aur attempt saath bante ya saath rollback). */
    async create({ orderId, provider, amountCents, currency }) {
      const [attempt] = await PaymentAttempt.create([
        { orderId, provider, amountCents, currency, status: 'PENDING' },
      ]);
      return serialize(attempt);
    },

    /** Kai orders ki attempts ek query mein: orderId (string) -> attempt (latest). */
    async findByOrderIds(orderIds) {
      if (orderIds.length === 0) return new Map();
      const rows = await PaymentAttempt.find({ orderId: { $in: orderIds } })
        .sort({ createdAt: 1 })
        .lean();
      // Sort ascending hai, isliye Map mein baad wali (latest) pehle wali ko overwrite karti hai.
      return new Map(rows.map((row) => [String(row.orderId), serialize(row)]));
    },

    /**
     * Attempt ka status badalna sirf agar abhi `from` mein ho (atomic): payment webhook/retry/reconcile dono ek saath chalein to
     * ek hi apply hota hai. @returns updated attempt ya null
     */
    async settle({ orderId, from, to, set = {} }) {
      return serialize(
        await PaymentAttempt.findOneAndUpdate(
          { orderId, status: from },
          { $set: { status: to, ...set } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /**
     * "Refund baaki hai" wali attempts: attempt abhi SUCCEEDED hai par order CANCELLED/REFUNDED ho chuka hai (status badal gaya, paisa
     * wapas nahi hua). Aggregation payment_attempts se orders ko $lookup karti hai. Bade data par `status` index/flag chahiye hoga
     * (Phase 14 ka background job isse sahi se schedule karega); abhi reconcile admin ke haath se chalta hai.
     */
    async findRefundsOwed(limit = 50) {
      const rows = await PaymentAttempt.aggregate([
        { $match: { status: 'SUCCEEDED' } },
        { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
        { $unwind: '$order' },
        { $match: { 'order.status': { $in: ['CANCELLED', 'REFUNDED'] } } },
        { $limit: limit },
        { $project: { order: 0 } },
      ]);
      return rows.map((row) => serialize(row));
    },
  };
}
