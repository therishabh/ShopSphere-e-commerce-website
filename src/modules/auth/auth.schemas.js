// Auth endpoints ke request schemas (Zod). `validate()` middleware inhe handler se pehle chalata hai.
// Sab `z.strictObject`: extra field (e.g. `role: 'ADMIN'` signup mein) reject hota hai: mass-assignment se bachav.

import { z } from 'zod';

// Email: trim + lowercase karke validate. Lowercase isliye ki database mein hamesha lowercase store/search hoti hai
// ("A@x.com" aur "a@x.com" ek hi account). Max 254 = email standard ki limit.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// Naya password (signup/reset): 12 se 128 characters. Max isliye ki bahut lamba password hashing ko dheema karke DoS bana sakta hai.
// Trim NAHI karte: password ko jaisa hai waisa rakhna hota hai (spaces password ka hissa ho sakte hain).
const newPassword = z
  .string()
  .min(12, 'must be at least 12 characters')
  .max(128, 'must be at most 128 characters');

// Login par password policy lagana galat hai (purane/alag policy wale accounts login nahi kar paate); sirf size bound.
const loginPassword = z.string().min(1).max(128);

// Opaque tokens (refresh/verify/reset): lambai ki bound taaki bahut bade input par kaam hi na ho.
const token = z.string().min(20).max(200);

export const signupBody = z.strictObject({
  email,
  name: z.string().trim().min(1).max(100),
  password: newPassword,
});

export const loginBody = z.strictObject({ email, password: loginPassword });

export const refreshBody = z.strictObject({ refreshToken: token });

export const logoutBody = z.strictObject({ refreshToken: token });

export const verifyEmailBody = z.strictObject({ token });

export const emailOnlyBody = z.strictObject({ email });

export const resetPasswordBody = z.strictObject({ token, newPassword });
