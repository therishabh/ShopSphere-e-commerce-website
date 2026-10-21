// Attempt limiter: "is key ne itni der mein itni baar koshish ki" gin-ne wala chhota in-memory counter.
// Brute-force/login throttling aur email-spam rokne ka HOOK hai.
//
// "Hook" ka matlab: auth service sirf `check / record / reset` interface jaanta hai. Abhi implementation process ke memory mein
// hai (ek hi server instance ke liye theek). Kai instances ya restart ke baad bhi chalna ho to Phase 11/13 mein isi interface ko
// Redis se implement karke badal denge, service code nahi badlega.
//
// Limits: fixed window. Window pehli koshish se shuru hoti hai; `windowMs` baad counter apne aap reset.
// Memory: sirf `maxKeys` tak keys; zyada hone par sabse purani hata di jaati hain (attacker random keys bhejkar memory na bhar sake).

/**
 * @param {object} options
 * @param {number} options.maxAttempts  window mein kitni koshishon ke baad block
 * @param {number} options.windowMs
 * @param {number} [options.maxKeys]
 * @param {() => number} [options.now]  tests/verification ke liye clock inject
 */
export function createAttemptLimiter({ maxAttempts, windowMs, maxKeys = 10_000, now = Date.now }) {
  // key -> { count, windowStart }. Map insertion order purani keys pehle deta hai (eviction ke liye).
  const entries = new Map();

  function current(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now() - entry.windowStart >= windowMs) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    /** @returns {{ allowed: boolean, retryAfterSeconds: number }} block hone par kitni der baad dobara koshish kar sakte hain */
    check(key) {
      const entry = current(key);
      if (!entry || entry.count < maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + windowMs - now()) / 1000)),
      };
    },

    /** Ek koshish gino (login mein sirf FAIL hone par; mail endpoints mein har request par). */
    record(key) {
      const entry = current(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (entries.size >= maxKeys) entries.delete(entries.keys().next().value);
      entries.set(key, { count: 1, windowStart: now() });
    },

    /** Safal login par counter saaf. */
    reset(key) {
      entries.delete(key);
    },
  };
}
