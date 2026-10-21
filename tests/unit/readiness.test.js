import { jest } from '@jest/globals';
import { createReadiness } from '../../src/health/readiness.js';

describe('createReadiness', () => {
  test('is ready when no dependencies are registered', async () => {
    expect(await createReadiness().report()).toEqual({
      ready: true,
      status: 'ready',
      checks: {},
    });
  });

  test('is ready when all checks pass', async () => {
    const r = createReadiness({ checks: { db: async () => {} } });
    expect((await r.report()).checks).toEqual({ db: 'up' });
  });

  test('is not ready when a check rejects, and still reports the others', async () => {
    const r = createReadiness({
      checks: {
        db: async () => {
          throw new Error('connection refused');
        },
        redis: async () => {},
      },
    });
    expect(await r.report()).toEqual({
      ready: false,
      status: 'not_ready',
      checks: { db: 'down', redis: 'up' },
    });
  });

  test('treats a hung check as down after the timeout', async () => {
    const r = createReadiness({ checks: { db: () => new Promise(() => {}) }, timeoutMs: 20 });
    expect((await r.report()).checks).toEqual({ db: 'down' });
  });

  test('is not ready once shutdown begins, without running checks', async () => {
    const check = jest.fn();
    const r = createReadiness({ checks: { db: check } });
    r.markShuttingDown();
    expect(await r.report()).toEqual({ ready: false, status: 'shutting_down', checks: {} });
    expect(check).not.toHaveBeenCalled();
  });
});
