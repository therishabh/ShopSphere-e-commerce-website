import { loadConfig, ConfigError } from '../../src/config/env.js';

describe('loadConfig', () => {
  test('applies defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({ env: 'development', host: '127.0.0.1', port: 3000 });
  });

  test('coerces PORT from a string', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  test('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });

  test.each([
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ PORT: '1.5' }, 'PORT'],
    [{ HOST: '' }, 'HOST'],
  ])('rejects invalid input %j', (env, field) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (err) {
      expect(err.issues.some((i) => i.startsWith(field))).toBe(true);
    }
  });

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
