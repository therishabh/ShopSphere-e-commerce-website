// Conditional middleware helpers: koi middleware sirf kisi shart par chalao.
//
// Kyun: kabhi kabhi middleware har request par nahi chalana (jaise health probes ka logging band karna,
// ya sirf ?debug=1 par extra step). Middleware ke andar if-else likhne ke bajay ye wrapper use karo:
// original middleware ko saaf rakhta hai aur "kab chalega" ki shart alag dikhti hai.

/** `predicate(req)` true ho tabhi `middleware` chalao; warna seedha next() par jao. */
export function when(predicate, middleware) {
  // Ek naya middleware return hota hai jo shart dekhta hai aur original ko call karta hai ya skip karta hai.
  // Skip karte waqt `next()` zaruri hai, warna request yahin atak jaayegi.
  return (req, res, next) => (predicate(req) ? middleware(req, res, next) : next());
}

/** `when` ka ulta: `predicate(req)` true ho to middleware SKIP karo. */
export function unless(predicate, middleware) {
  return when((req) => !predicate(req), middleware);
}
