// Password hashing: Argon2id (`argon2` library, maintained; OWASP ka recommended algorithm).
//
// Kyun slow hash: password database leak hone par bhi attacker ko har guess ke liye ~20ms+ aur 19 MiB memory lagti hai, jisse
// brute force mehenga ho jaata hai. SHA-256 jaisa fast hash passwords ke liye galat hai (seconds mein arabon guesses).
// Parameters OWASP ke minimum (m=19 MiB, t=2, p=1) hain; hardware tez ho to badhao: `needsRehash` purane hashes ko login
// par apne aap naye parameters par le aata hai.
//
// Salt: argon2 har hash ke liye khud random salt banata hai aur hash string mein hi rakhta hai ($argon2id$v=19$m=...$salt$hash).

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function createPasswordHasher() {
  // "Dummy hash": jab email database mein hai hi nahi, tab bhi login ko ek asli argon2 verify jitna time lagana chahiye,
  // warna response ki speed se pata chal jata ki email registered hai ya nahi (timing side-channel). Pehli zarurat par ek baar banta hai.
  let dummyHashPromise;
  const getDummyHash = () =>
    (dummyHashPromise ??= argon2.hash(randomBytes(16).toString('hex'), OPTIONS));

  return {
    /** Password ko hash karta hai. Plain password kabhi store/log nahi hota. */
    hash(password) {
      return argon2.hash(password, OPTIONS);
    },

    /**
     * Sahi password hai ya nahi. Kharab/corrupt hash par throw nahi karta, false deta hai (login 401 ban jaye, 500 nahi).
     */
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    },

    /** Unknown email ke liye: asli verify jitna kaam karta hai aur hamesha false deta hai (timing barabar rakhne ke liye). */
    async verifyDummy(password) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      return false;
    },

    /** Hash purane/kamzor parameters se bana ho to true (login par dobara hash karke update karte hain). */
    needsRehash(hash) {
      try {
        return argon2.needsRehash(hash, OPTIONS);
      } catch {
        return false;
      }
    },
  };
}
