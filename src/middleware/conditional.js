/** Run `middleware` only when predicate(req) is true; otherwise skip straight to next(). */
export function when(predicate, middleware) {
  return (req, res, next) => (predicate(req) ? middleware(req, res, next) : next());
}

/** Run `middleware` unless predicate(req) is true. */
export function unless(predicate, middleware) {
  return when((req) => !predicate(req), middleware);
}
