// Categories controller (sirf HTTP).
export function createCategoriesController({ categoryService }) {
  return {
    async list(_req, res) {
      res.json(await categoryService.list());
    },
  };
}
