// Dev-only "mailbox": test mailer ne jo emails memory mein rakhi hain unhe dekhne ka route (`/api/v1/examples/mailbox`).
//
// Kyun: abhi asli email provider nahi hai, to signup ke baad verification link ya forgot-password ka reset link dekhne ka koi
// tareeka chahiye (curl/Postman se auth flow test karne ke liye). Isme emails ke TOKEN wale links dikhte hain, isliye ye route
// sirf non-production mein mount hota hai (src/routes/api.routes.js); production mein ye hona hi nahi chahiye.

import { Router } from 'express';

/** @param {{ list: () => object[], clear: () => void }} mailer createTestMailer() ka result */
export function createMailboxExamplesRouter(mailer) {
  const router = Router();

  // Naye emails last mein. ?to=a@x.com se ek recipient ki emails filter ho sakti hain.
  router.get('/', (req, res) => {
    const to = typeof req.query.to === 'string' ? req.query.to.toLowerCase() : undefined;
    const items = mailer.list().filter((message) => to === undefined || message.to === to);
    res.json({ items });
  });

  router.delete('/', (_req, res) => {
    mailer.clear();
    res.status(204).end();
  });

  return router;
}
