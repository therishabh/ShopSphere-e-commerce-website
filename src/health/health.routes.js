import { Router } from 'express';

export function createHealthRouter(readiness) {
  const router = Router();

  // Liveness: the process is running and the event loop responds. No dependency checks.
  router.get('/live', (_req, res) => {
    res.json({ status: 'live' });
  });

  // Readiness: 200 only if every required dependency is up and we are not shutting down.
  router.get('/ready', async (_req, res) => {
    const { ready, status, checks } = await readiness.report();
    res.status(ready ? 200 : 503).json({ status, checks });
  });

  return router;
}
