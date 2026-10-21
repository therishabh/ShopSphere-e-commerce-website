// Health endpoints: /health/live aur /health/ready.
// Ye Kubernetes/Docker/load balancer jaise tools ke liye hain, users ke liye nahi.
// app.js inhe '/health' prefix par mount karta hai, isliye yahan paths sirf '/live' aur '/ready' hain.

import { Router } from 'express';

/**
 * @param {object} readiness createReadiness() ka result (isse hum "ready hai ya nahi" poochte hain)
 */
export function createHealthRouter(readiness) {
  const router = Router();

  // Liveness: process chal raha hai aur event loop jawab de raha hai. Dependencies check nahi karte,
  // taaki DB down hone par orchestrator process ko bekaar mein restart na kare (restart se DB theek nahi hota).
  router.get('/live', (_req, res) => {
    res.json({ status: 'live' });
  });

  // Readiness: 200 tabhi jab har required dependency up ho aur shutdown na chal raha ho.
  // Warna 503 (Service Unavailable): load balancer is instance ko traffic bhejna band kar deta hai.
  // Handler `async` hai kyunki report() dependencies check karta hai (Express 5 rejected Promise khud pakad leta hai).
  router.get('/ready', async (_req, res) => {
    const { ready, status, checks } = await readiness.report();
    res.status(ready ? 200 : 503).json({ status, checks });
  });

  return router;
}
