// Zod ke issues ko client-friendly `details` list mein badalne ka ek shared helper.
// Do jagah use hota hai: validate middleware (jahan source pata hota hai: body/query/params) aur
// to-app-error.js (jab kisi handler ne seedha schema.parse() kiya aur ZodError throw hua).

/**
 * @param {import('zod').ZodIssue[]} issues zod ke error.issues
 * @param {string} [source] 'body' | 'query' | 'params' (pata ho to detail mein judta hai)
 * @returns {Array<{source?: string, path: string, message: string}>}
 */
export function zodIssuesToDetails(issues, source) {
  return issues.map((issue) => ({
    // source sirf tab daalte hain jab diya gaya ho, taaki purane format wale outputs na tootein.
    ...(source ? { source } : {}),
    // `path` array hai (e.g. ['address', 'city']); client ke liye 'address.city' string behtar hai.
    // Root-level issue (e.g. unrecognized key) par path khaali string hota hai.
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
