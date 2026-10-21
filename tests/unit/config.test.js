// Unit tests: src/config/env.js ka loadConfig(). Process ke asli environment par depend nahi karte;
// har test apna chhota env object pass karta hai (isiliye loadConfig argument leta hai).

import { loadConfig, ConfigError } from '../../src/config/env.js';

// describe = tests ka group. Har `test(...)` ek behaviour check karta hai.
describe('loadConfig', () => {
  test('applies defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      dbPoolMax: 10,
      auth: {
        appBaseUrl: 'http://localhost:3000',
        accessTokenTtlSeconds: 900,
        refreshTokenTtlDays: 30,
      },
    });
  });

  test('coerces PORT from a string', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  test('log level defaults by environment and can be overridden', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
    expect(
      loadConfig({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost:27017/test',
        AUTH_JWT_SECRET: 'x'.repeat(32),
        APP_BASE_URL: 'https://shop.example.com',
      }).logLevel,
    ).toBe('info');
    expect(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  test('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });

  // test.each = ek hi test kai inputs par chalao (har row ek alag test). `%j` = row ko JSON mein dikhana.
  test.each([
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ PORT: '1.5' }, 'PORT'],
    [{ HOST: '' }, 'HOST'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
  ])('rejects invalid input %j', (env, field) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (err) {
      expect(err.issues.some((i) => i.startsWith(field))).toBe(true);
    }
  });

  // Saari galtiyan ek saath dikhni chahiye (user ko ek-ek karke fix na karna pade).
  test('reports every invalid field at once', () => {
    try {
      loadConfig({ NODE_ENV: 'x', PORT: 'y' });
      throw new Error('expected loadConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.issues).toHaveLength(2);
    }
  });
});
