// Categories ka business logic: public list (har category mein kitne products live hain).
// Category banana admin ka kaam hai: src/modules/admin/admin.service.js `createCategory`.

export function createCategoryService({ database }) {
  const repos = database.repositories;
  return {
    /**
     * Saari categories + har ek ke ACTIVE (public) products ki ginti. Ginti ek hi aggregation se aati hai (har category ke liye
     * alag query nahi). Jis category mein koi product nahi uska count 0.
     */
    async list() {
      const [categories, counts] = await Promise.all([
        repos.categories.list(),
        repos.products.countActiveByCategory(),
      ]);
      return {
        items: categories.map((c) => ({
          slug: c.slug,
          name: c.name,
          productCount: counts[c.slug] ?? 0,
        })),
      };
    },
  };
}
