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
      docsEnabled: true,
    });
  });

  test('coerces PORT from a string', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  test('log level defaults by environment and can be overridden', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
    expect(loadConfig({ NODE_ENV: 'production' }).logLevel).toBe('info');
    expect(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  test('docs default to on outside production and can be overridden either way', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).docsEnabled).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test' }).docsEnabled).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production' }).docsEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).docsEnabled).toBe(true);
    expect(loadConfig({ NODE_ENV: 'development', API_DOCS_ENABLED: 'false' }).docsEnabled).toBe(
      false,
    );
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
    [{ API_DOCS_ENABLED: 'yes' }, 'API_DOCS_ENABLED'],
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
