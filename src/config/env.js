import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  // Default depends on NODE_ENV (silent in tests), so it is resolved after parsing.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
});

export class ConfigError extends Error {
  constructor(issues) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Parse and validate configuration from an env-like object.
 * Takes the source as an argument so tests never touch process.env.
 */
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const { NODE_ENV, HOST, PORT, LOG_LEVEL } = result.data;
  const logLevel = LOG_LEVEL ?? (NODE_ENV === 'test' ? 'silent' : 'info');
  return Object.freeze({ env: NODE_ENV, host: HOST, port: PORT, logLevel });
}
