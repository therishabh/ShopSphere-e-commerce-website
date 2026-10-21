// Database ke liye CLI: `node scripts/db.js <command>` (package.json ke db:* scripts isse chalate hain).
//   migrate  -> pending migrations apply
//   status   -> kaun si migration applied hai
//   seed     -> local sample data (idempotent)
//   reset    -> POORA database drop + migrate + seed (sirf local/dev)
//
// Config src/config/env.js se aata hai (MONGODB_URI zaruri). Production mein `seed` aur `reset` chalne se mana hai.

import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/logging/logger.js';
import { createDatabase } from '../src/db/database.js';
import { migrationStatus, runMigrations } from '../src/db/migrations.js';
import { seedDatabase } from '../src/db/seed.js';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations');
const command = process.argv[2];

async function main() {
  dotenv.config({ quiet: true });
  const config = loadConfig();
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set (copy .env.example to .env)');
  if (['seed', 'reset'].includes(command) && config.env === 'production') {
    throw new Error(`Refusing to run "${command}" with NODE_ENV=production`);
  }

  const logger = createLogger({ level: config.logLevel === 'silent' ? 'info' : config.logLevel });
  const database = createDatabase({ uri: config.mongodbUri, poolMax: 2, logger });
  // retry=false: scripts fail-fast (DB na mile to turant error).
  await database.connect({ retry: false });

  try {
    if (command === 'migrate') {
      const ran = await runMigrations({ database, directory: MIGRATIONS_DIR, logger });
      console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations');
    } else if (command === 'status') {
      for (const m of await migrationStatus({ database, directory: MIGRATIONS_DIR })) {
        console.log(`${m.applied ? 'applied ' : 'PENDING '} ${m.name}`);
      }
    } else if (command === 'seed') {
      console.log('Seed complete:', await seedDatabase(database));
    } else if (command === 'reset') {
      await database.connection.dropDatabase();
      await runMigrations({ database, directory: MIGRATIONS_DIR, logger });
      console.log('Reset complete:', await seedDatabase(database));
    } else {
      throw new Error('Usage: node scripts/db.js <migrate|status|seed|reset>');
    }
  } finally {
    await database.disconnect();
  }
}

main().catch((err) => {
  console.error(`db ${command ?? ''} failed:`, err.message);
  process.exitCode = 1;
});
