// Readiness tracker: batata hai ki app abhi traffic lene layak hai ya nahi.
//
// Liveness aur readiness alag cheezein hain:
//   liveness  -> "process zinda hai?" (restart ka decision, dependency check nahi)
//   readiness -> "traffic bhej sakte hain?" (DB/Redis jaisi dependencies up hain aur shutdown nahi chal raha)
// Ye file sirf readiness ka logic rakhti hai; HTTP endpoint health.routes.js mein hai.

// Ek check ko maximum itna time milta hai; usse zyada atka to usse "down" maana jata hai.
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Readiness tracker banata hai.
 *
 * Dependencies (database, Redis, ...) ek naam ke saath async check function register karti hain
 * (`checks` object: { db: async () => {...} }). Check ko tab resolve hona chahiye jab dependency theek ho,
 * aur reject/throw karna chahiye jab theek na ho. Jab tak koi check register nahi hota (abhi koi dependency
 * nahi hai), readiness sirf lifecycle par depend karti hai: starting/running = ready, shutting down = not ready.
 *
 * `timeoutMs` configurable isliye hai ki tests chhota timeout de sakein.
 */
export function createReadiness({ checks = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // false hone par (shutdown shuru) report() turant "not ready" deta hai.
  let accepting = true;

  // Ek check chalata hai aur sirf 'up' ya 'down' return karta hai (kabhi throw nahi karta).
  async function runCheck(check) {
    let timer;
    // Timeout wala Promise: `timeoutMs` baad reject ho jata hai.
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    try {
      // Promise.race = jo pehle khatam ho uska result. Check pehle khatam hua = theek;
      // timeout pehle reject hua (check atka hua hai) = catch mein jaayega.
      await Promise.race([check(), timeout]);
      return 'up';
    } catch {
      // Check ne reject kiya ya timeout hua: dono ka matlab dependency theek nahi.
      return 'down';
    } finally {
      // Timer saaf karo, warna Node process timer ke wajah se khula reh sakta hai (aur tests atak sakte hain).
      clearTimeout(timer);
    }
  }

  return {
    /** Shutdown shuru hote hi call karo, taaki load balancer yahan traffic bhejna band kare. */
    markShuttingDown() {
      accepting = false;
    },

    // Poori readiness ka haal return karta hai: { ready, status, checks }.
    async report() {
      // Shutdown chal raha hai to dependencies check karne ki zarurat hi nahi; seedha "not ready".
      if (!accepting) return { ready: false, status: 'shutting_down', checks: {} };

      const names = Object.keys(checks);
      // Saare checks parallel chalte hain (ek dheema check baaki ko slow nahi karta).
      const states = await Promise.all(names.map((name) => runCheck(checks[name])));
      // ['db','redis'] + ['up','down'] -> { db: 'up', redis: 'down' }
      const results = Object.fromEntries(names.map((name, i) => [name, states[i]]));
      // Ready tabhi jab har check 'up' ho (khaali list par `every` true deta hai = ready).
      const ready = states.every((s) => s === 'up');
      return { ready, status: ready ? 'ready' : 'not_ready', checks: results };
    },
  };
}
