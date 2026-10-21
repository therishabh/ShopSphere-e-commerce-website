// Migration 0001: saare collections banata hai, server-side validators lagata hai, aur schemas ke indexes banata hai.
// Idempotent: dobara chalane par bhi theek (collection hai to sirf validator update, indexes sync).

import { COLLECTION_VALIDATORS } from '../src/db/models/validators.js';

export const name = '0001_collections_validators_and_indexes';

export async function up({ database }) {
  const { connection, models } = database;
  const existing = new Set(
    (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  for (const model of Object.values(models)) {
    const collectionName = model.collection.name;
    const validator = COLLECTION_VALIDATORS[collectionName];
    // validationLevel strict: sab inserts/updates par check. validationAction error: fail hone par write reject (warn nahi).
    const options = validator
      ? { validator, validationLevel: 'strict', validationAction: 'error' }
      : {};

    if (existing.has(collectionName)) {
      // Pehle se hai (partial ya purani run): validator `collMod` se update.
      if (validator) await connection.db.command({ collMod: collectionName, ...options });
    } else {
      await connection.db.createCollection(collectionName, options);
    }
    // Schema ke indexes banao; schema mein na hone wale purane indexes hata deta hai (is migration ke waqt ye sahi hai).
    await model.syncIndexes();
  }
}
