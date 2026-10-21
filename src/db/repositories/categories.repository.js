// Categories ka data access (chhoti, almost read-only collection).

import { serialize } from '../serialize.js';

export function createCategoryRepository({ Category }) {
  return {
    async list() {
      return (await Category.find().sort({ name: 1 }).lean()).map((c) => serialize(c));
    },

    async findBySlug(slug) {
      return serialize(await Category.findOne({ slug }).lean());
    },
  };
}
