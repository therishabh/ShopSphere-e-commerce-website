import { pathToFileURL } from 'node:url';
import { loadConfig, ConfigError } from './config/env.js';
import { createApp } from './app.js';
import { createReadiness } from './health/readiness.js';

/**
 * Wire dependencies, listen, and resolve once the port is bound.
 * Rejects if the port cannot be bound. Returns a handle for orderly shutdown.
 */
export async function startServer(config, { readiness = createReadiness() } = {}) {
  const app = createApp({ config, readiness });

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

  return { server, close, port: server.address().port };
}

async function main() {
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

  const { port, close } = await startServer(config);
  console.log(`ShopSphere listening on http://${config.host}:${port} (${config.env})`);

  // Minimal stop-on-signal. Full drain/ordered shutdown is a later phase (observability & reliability).
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      close().then(
        () => process.exit(0),
        (err) => {
          console.error('Error during shutdown:', err);
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
