// Orders ka data access. Status badalna HAMESHA conditional atomic update hai (`status: from` filter mein), isliye do requests ek
// saath ek hi order ko badlein to sirf ek jeetta hai (state machine ke rules services/order-state.js mein hain; yahan unka database-
// level guard hai).

import { serialize } from '../serialize.js';

const sortSpec = (sort) =>
  Object.fromEntries([
    ...sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]),
    ['_id', sort.at(-1).direction === 'asc' ? 1 : -1],
  ]);

export function createOrderRepository({ Order }) {
  // list helper: filter + sort + pagination + total (parallel; ek transaction nahi, list pages ke liye theek).
  async function list(filter, query) {
    const [rows, total] = await Promise.all([
      Order.find(filter).sort(sortSpec(query.sort)).skip(query.offset).limit(query.limit).lean(),
      Order.countDocuments(filter),
    ]);
    return { items: rows.map((row) => serialize(row)), total };
  }

  return {
    /** Checkout transaction ke andar call karo. Order number `sequences` se, totals pehle se server ne nikaale. */
    async create(data) {
      const [order] = await Order.create([data]);
      return serialize(order);
    },

    async findById(id) {
      return serialize(await Order.findById(id).lean());
    },

    async findByCheckoutId(checkoutId) {
      const rows = await Order.find({ checkoutId }).sort({ number: 1 }).lean();
      return rows.map((row) => serialize(row));
    },

    /** Customer ke liye: order sirf tab milta hai jab `userId` actor ki ho (doosre ka order id jaanne se kuch nahi milta). */
    async findForUser(id, userId) {
      return serialize(await Order.findOne({ _id: id, userId }).lean());
    },

    /** Seller ke liye: sirf us seller ka order, aur sirf wo statuses jo seller ko dikhne chahiye (paid ke baad). */
    async findForSeller(id, sellerId, visibleStatuses) {
      return serialize(
        await Order.findOne({ _id: id, sellerId, status: { $in: visibleStatuses } }).lean(),
      );
    },

    listForUser(userId, query) {
      const filter = { userId };
      if (query.filters.status !== undefined) filter.status = query.filters.status;
      return list(filter, query);
    },

    /** Seller ki list: status filter diya ho to bhi `visibleStatuses` ke andar hi (intersection), us se bahar nahi. */
    listForSeller(sellerId, query, visibleStatuses) {
      const wanted = query.filters.status;
      const status =
        wanted === undefined
          ? { $in: visibleStatuses }
          : { $in: visibleStatuses.filter((s) => s === wanted) };
      return list({ sellerId, status }, query);
    },

    listForAdmin(query) {
      const filter = {};
      if (query.filters.status !== undefined) filter.status = query.filters.status;
      return list(filter, query);
    },

    /**
     * Status `from` se `to`: sirf agar order abhi `from` mein hai (aur `scope` ke andar: userId / sellerId, ownership defense in
     * depth). @returns updated order ya null (order nahi mila, kisi aur ka tha, ya status pehle hi badal chuka)
     */
    async transition({ id, from, to, scope = {} }) {
      return serialize(
        await Order.findOneAndUpdate(
          { _id: id, status: from, ...scope },
          { $set: { status: to, statusChangedAt: new Date() } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /** `olderThan` se pehle se PENDING_PAYMENT mein atke orders (payment ka natija kabhi nahi aaya). */
    async findStalePending({ olderThan, limit = 50 }) {
      const rows = await Order.find({
        status: 'PENDING_PAYMENT',
        statusChangedAt: { $lt: olderThan },
      })
        .sort({ statusChangedAt: 1 })
        .limit(limit)
        .lean();
      return rows.map((row) => serialize(row));
    },
  };
}
