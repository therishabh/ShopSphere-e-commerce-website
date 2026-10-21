// Versioned migrations ka chhota runner (MongoDB mein SQL jaisi built-in migrations nahi hoti).
//
// Kaise kaam karta hai:
//   - `migrations/` folder mein files: 0001_naam.js, 0002_naam.js ... (naam ke order mein chalti hain).
//   - Har file `export const name` aur `export async function up({ database })` deti hai.
//   - Jo migration chal chuki hai uska naam `_migrations` collection mein save hota hai; dobara nahi chalti.
//
// Kya yahan jaata hai: collections/indexes/validators banana-badalna aur existing data ka transformation.
// Dhyaan: migrations ek hi jagah se (deploy step) chalao, har app instance start par nahi: do instances ek saath chalayein
// to ek hi migration do baar chal sakti hai (naam ka unique index record ko to duplicate hone se rokta hai, kaam ko nahi).

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATIONS_COLLECTION = '_migrations';

async function loadMigrations(directory) {
  const files = (await readdir(directory)).filter((f) => /^\d{4}_.+\.js$/.test(f)).sort();
  const migrations = [];
  for (const file of files) {
    const module = await import(pathToFileURL(path.join(directory, file)).href);
    if (module.name !== file.replace(/\.js$/, '') || typeof module.up !== 'function') {
      throw new Error(
        `Migration ${file} must export name === "${file.replace(/\.js$/, '')}" and an up() function`,
      );
    }
    migrations.push({ name: module.name, up: module.up });
  }
  return migrations;
}

async function appliedNames(connection) {
  const rows = await connection.db
    .collection(MIGRATIONS_COLLECTION)
    .find({}, { projection: { name: 1 } })
    .toArray();
  return new Set(rows.map((row) => row.name));
}

/** @returns {Promise<{ name: string, applied: boolean }[]>} */
export async function migrationStatus({ database, directory }) {
  const applied = await appliedNames(database.connection);
  return (await loadMigrations(directory)).map(({ name }) => ({
    name,
    applied: applied.has(name),
  }));
}

/** Pending migrations chalata hai. @returns {Promise<string[]>} abhi apply hui migrations ke naam */
export async function runMigrations({ database, directory, logger }) {
  const { connection } = database;
  await connection.db.collection(MIGRATIONS_COLLECTION).createIndex({ name: 1 }, { unique: true });
  const applied = await appliedNames(connection);
  const ran = [];
  for (const migration of await loadMigrations(directory)) {
    if (applied.has(migration.name)) continue;
    logger.info({ migration: migration.name }, 'applying migration');
    await migration.up({ database });
    // Record migration ke SAFAL hone ke baad likhte hain: beech mein fail hui to agli baar dobara chalegi (isliye `up`
    // idempotent likho: dobara chalane par bhi theek).
    await connection.db
      .collection(MIGRATIONS_COLLECTION)
      .insertOne({ name: migration.name, appliedAt: new Date() });
    ran.push(migration.name);
  }
  return ran;
}
