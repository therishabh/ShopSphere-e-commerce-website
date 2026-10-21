// Categories ka data access (chhoti, almost read-only collection).

import { serialize } from '../serialize.js';

export function createCategoryRepository({ Category }) {
  return {
    async list() {
      return (await Category.find().sort({ name: 1 }).lean()).map((c) => serialize(c));
    },

    /** Naam/slug duplicate ho to unique index E11000 deta hai -> 409. */
    async create({ slug, name }) {
      const [category] = await Category.create([{ slug, name }]);
      return serialize(category);
    },
    async findBySlug(slug) {
      return serialize(await Category.findOne({ slug }).lean());
    },
  };
}
