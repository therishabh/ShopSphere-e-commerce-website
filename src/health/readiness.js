const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Tracks whether the process can take traffic.
 * Dependencies (database, Redis, ...) register a named async check; each check
 * must resolve when healthy and reject/throw when not. With no registered
 * checks the app has no required dependencies, so readiness depends only on
 * lifecycle state (starting / shutting down).
 */
export function createReadiness({ checks = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let accepting = true;

  async function runCheck(check) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    try {
      await Promise.race([check(), timeout]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Call when shutdown begins so load balancers stop routing here. */
    markShuttingDown() {
      accepting = false;
    },
    async report() {
      if (!accepting) return { ready: false, status: 'shutting_down', checks: {} };
      const names = Object.keys(checks);
      const states = await Promise.all(names.map((name) => runCheck(checks[name])));
      const results = Object.fromEntries(names.map((name, i) => [name, states[i]]));
      const ready = states.every((s) => s === 'up');
      return { ready, status: ready ? 'ready' : 'not_ready', checks: results };
    },
  };
}
