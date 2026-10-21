// Seller profiles ka data access.

import { serialize } from '../serialize.js';

// Admin list mein applicant ki basic info (email/naam) chahiye; password hash kabhi nahi (User model mein select:false hai).
const toListItem = (row) => {
  const { userId, ...rest } = row;
  return {
    ...serialize(rest),
    userId: String(userId._id ?? userId),
    applicant: userId.email ? { email: userId.email, name: userId.name } : undefined,
  };
};

export function createSellerProfileRepository({ SellerProfile }) {
  return {
    /** userId/storeName/slug mein se koi duplicate ho to E11000 -> 409. */
    async create({ userId, storeName, slug, description }) {
      const [profile] = await SellerProfile.create([{ userId, storeName, slug, description }]);
      return serialize(profile);
    },

    async findById(id) {
      return serialize(await SellerProfile.findById(id).lean());
    },

    /** Public store info (naam/slug) products ke saath dikhane ke liye: ek query mein kai sellers. userId/status bahar nahi jaate. */
    async findPublicByIds(ids) {
      const rows = await SellerProfile.find({ _id: { $in: ids } })
        .select('storeName slug')
        .lean();
      return new Map(rows.map((r) => [String(r._id), { storeName: r.storeName, slug: r.slug }]));
    },
    async findByUserId(userId) {
      return serialize(await SellerProfile.findOne({ userId }).lean());
    },

    /** Admin list: status filter, sort, pagination (Phase 5 ki normalized query). */
    async list(query) {
      const filter = query.filters.status ? { status: query.filters.status } : {};
      const sort = Object.fromEntries([
        ...query.sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]),
        ['_id', 1],
      ]);
      const [rows, total] = await Promise.all([
        SellerProfile.find(filter)
          .sort(sort)
          .skip(query.offset)
          .limit(query.limit)
          .populate('userId', 'email name')
          .lean(),
        SellerProfile.countDocuments(filter),
      ]);
      return { items: rows.map(toListItem), total };
    },

    /**
     * Status badalna, sirf agar abhi status `from` mein se ek ho (atomic conditional update). Do admins ek saath approve karein
     * to sirf ek jeetta hai. @returns updated profile ya null (nahi mila ya status galat tha)
     */
    async transition({ id, from, to, extra = {} }) {
      return serialize(
        await SellerProfile.findOneAndUpdate(
          { _id: id, status: { $in: from } },
          { $set: { status: to, ...extra } },
          { returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    },
  };
}
