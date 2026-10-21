import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { loadConfig, ConfigError } from './config/env.js';
import { createApp } from './app.js';
import { createReadiness } from './health/readiness.js';
import { createLogger } from './logging/logger.js';

/**
 * Wire dependencies, listen, and resolve once the port is bound.
 * Rejects if the port cannot be bound. Returns a handle for orderly shutdown.
 */
export async function startServer(
  config,
  { readiness = createReadiness(), logger = createLogger({ level: config.logLevel }) } = {},
) {
  const app = createApp({ config, readiness, logger });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(config.port, config.host);
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  });

  async function close() {
    readiness.markShuttingDown();
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
      server.closeIdleConnections();
    });
  }

  return { server, close, port: server.address().port, logger };
}

async function main() {
  // Local convenience: .env se values load karta hai. Existing environment variables ko override nahi karta.
  dotenv.config({ quiet: true });

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const { port, close, logger } = await startServer(config);
  logger.info({ host: config.host, port, env: config.env }, 'server listening');

  // Minimal stop-on-signal. Full drain/ordered shutdown is a later phase (observability & reliability).
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      close().then(
        () => process.exit(0),
        (err) => {
          logger.error({ err }, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }
}

// Run only when executed directly (node src/server.js), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}
