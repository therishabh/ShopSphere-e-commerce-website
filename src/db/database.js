// Database module: MongoDB (Mongoose) ka ek hi jagah se setup.
//
// Is object ko app start par ek baar banate hain aur use sab jagah pass karte hain (dependency injection):
//   database.repositories       -> normal queries
//   database.transaction(fn)    -> fn(repositories) transaction ke andar (replica set zaruri)
//   database.checkReady()       -> /health/ready ke liye
//   database.connect()          -> background mein connect (retry ke saath)
//   database.disconnect()       -> shutdown par
//
// Connection `mongoose.createConnection()` se banta hai (global default connection nahi), aur models usi connection par
// register hote hain.

import mongoose from 'mongoose';
import { registerModels } from './models/index.js';
import { createRepositories } from './repositories/index.js';

// Mongoose ke global settings (process mein ek baar).
function applyGlobalSettings() {
  // Transaction ke andar ki saari Mongoose operations ko session apne aap mil jaata hai. Iske bina har query par
  // `{ session }` pass karna padta hai aur ek bhi bhool gaye to wo query transaction ke BAHAR chal jaati hai (chupchaap bug).
  mongoose.set('transactionAsyncLocalStorage', true);
  // `updateOne`/`findOneAndUpdate` par bhi schema validators chalao (default mein nahi chalte; verify kiya: negative qty
  // update ho gaya tha). Note: `$inc` par update validators phir bhi nahi chalte, uske liye server-side collection validators
  // (src/db/models/validators.js) aur conditional filters hain.
  mongoose.set('runValidators', true);
  // Filter mein schema ke bahar ki keys ignore (typo se "sab documents match" nahi hota).
  mongoose.set('strictQuery', true);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Transaction ke default options. Snapshot read + majority write = commit hone ke baad data replica set mein durable hai.
// maxCommitTimeMS: commit ko itne ms se zyada nahi chalna.
const TRANSACTION_DEFAULTS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
  maxCommitTimeMS: 10000,
};

/**
 * @param {object} options
 * @param {string} options.uri  MONGODB_URI (credentials ho sakte hain: kabhi log mat karo)
 * @param {number} [options.poolMax]  max connections
 * @param {import('pino').Logger} options.logger
 */
export function createDatabase({ uri, poolMax = 10, logger }) {
  applyGlobalSettings();

  const connection = mongoose.createConnection();
  const models = registerModels(connection);
  const repositories = createRepositories(models);
  let closed = false;

  // Connection ke events: bina 'error' listener ke Node EventEmitter process ko crash kar deta hai.
  connection.on('error', (err) =>
    logger.error({ errName: err.name, errMessage: err.message }, 'mongodb connection error'),
  );
  // `closed` true ho (hamne khud disconnect() bulaya) to warning nahi: sirf achanak connection tootne par.
  connection.on('disconnected', () => {
    if (!closed) logger.warn('mongodb disconnected');
  });
  connection.on('reconnected', () => logger.info('mongodb reconnected'));

  const connectOptions = {
    // Ek app instance ke max connections. instances x poolMax <= server ki connection limit.
    maxPoolSize: poolMax,
    minPoolSize: 0,
    // Server na mile (down/network) to itne ms baad error; request atakti nahi.
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    // Query bhejne ke baad socket par itne ms koi jawab na aaye to connection band.
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 30000,
    // Connection nahi bana ho tab queries Mongoose ke buffer mein itni der rukti hain, phir error (-> 503).
    bufferTimeoutMS: 5000,
    appName: 'shopsphere-api',
    // Index/collection app start par apne aap NAHI bante: production mein bade collection par index build startup
    // atka sakta hai. Ye migrations (`npm run db:migrate`) ka kaam hai.
    autoIndex: false,
    autoCreate: false,
  };

  return {
    connection,
    models,
    repositories,

    /**
     * Connect karta hai.
     *  - retry=true (server ke liye): fail hone par background mein backoff ke saath dobara koshish, jab tak connect na ho
     *    ya disconnect() na ho. Server DB ke bina bhi start hota hai; readiness 503 deti hai, connect hote hi 200.
     *  - retry=false (scripts ke liye): ek hi koshish, fail hone par throw (fail-fast).
     */
    async connect({ retry = true } = {}) {
      let delayMs = 500;
      while (!closed) {
        try {
          await connection.openUri(uri, connectOptions);
          logger.info('mongodb connected');
          return;
        } catch (err) {
          if (!retry) throw err;
          // Stack nahi, sirf naam + message (connection errors mein URI/credentials nahi hote, phir bhi minimal log).
          logger.error(
            { errName: err.name, errMessage: err.message, retryInMs: delayMs },
            'mongodb connect failed, retrying',
          );
          await sleep(delayMs);
          delayMs = Math.min(delayMs * 2, 15000);
        }
      }
    },

    /**
     * Transaction chalata hai; `fn` ko repositories milti hain (transaction ke andar wahi session use hota hai).
     *   await database.transaction(async ({ users, outbox }) => { ... })
     * Throw = ROLLBACK, return = COMMIT. Transient conflicts par driver apne aap retry karta hai (isliye `fn` dobara chal
     * sakta hai: usme DB ke bahar side effects mat karo). Replica set zaruri.
     */
    transaction(fn, options) {
      return connection.transaction(() => fn(repositories), {
        ...TRANSACTION_DEFAULTS,
        ...options,
      });
    },

    /** Database zinda hai? (readiness check). Fail hone par throw karta hai; readiness use 'down' maanti hai. */
    async checkReady() {
      if (connection.readyState !== 1) throw new Error('mongodb is not connected');
      await connection.db.admin().ping();
    },

    /** Shutdown: retry loop band aur pool ke saare connections band. */
    async disconnect() {
      closed = true;
      await connection.close();
    },
  };
}
