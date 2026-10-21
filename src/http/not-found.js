/**
 * Final fallback for requests no route handled. Responds with a fixed JSON body
 * and does not echo the requested path. Phase 4 replaces this with the central
 * error-handling pipeline.
 */
export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}
