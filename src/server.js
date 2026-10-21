// Ye file process ka entrypoint hai: `npm start` / `npm run dev` yahi file chalate hain.
//
// Kaam ka batwara (important):
//   app.js    -> Express app ki wiring (middleware, routes). Port nahi kholta, isliye tests mein asaani se bante hain.
//   server.js -> process-level cheezein: .env load, config validate, port kholna, Ctrl+C / SIGTERM handle karna.

// `pathToFileURL`: file path ko `file:///...` URL mein badalta hai (neeche "direct run" check ke liye).
import { pathToFileURL } from 'node:url';
// dotenv: `.env` file ki values ko environment variables mein load karta hai (sirf local development ke liye).
import dotenv from 'dotenv';
import { loadConfig, ConfigError } from './config/env.js';
import { createApp } from './app.js';
import { createReadiness } from './health/readiness.js';
import { createLogger } from './logging/logger.js';
import { createDatabase } from './db/database.js';

/**
 * App banata hai, port par sunna shuru karta hai, aur jab port sach mein bind ho jaye tab resolve hota hai.
 * Agar port bind nahi ho paya (jaise EADDRINUSE: port pehle se kisi aur ne le rakha hai) to reject hota hai.
 * Return value mein `close()` hai, jisse server ko orderly tareeke se band kiya ja sakta hai.
 *
 * `readiness` aur `logger` optional hain (default bana lete hain), taaki tests apne fake/capture wale
 * pass kar sakein. Ye "dependency injection" ka chhota roop hai.
 *
 * Database: `config.mongodbUri` set ho to yahan connection banta hai (background mein, retry ke saath: DB abhi down ho to
 * bhi server start hota hai), readiness mein `db` check judta hai (DB down = /health/ready 503), aur close() mein sabse
 * aakhir mein connections band hote hain. Set na ho (dev/test) to app database ke bina chalti hai aur ek warning log hoti hai.
 */
export async function startServer(
  config,
  {
    logger = createLogger({ level: config.logLevel }),
    database = config.mongodbUri
      ? createDatabase({ uri: config.mongodbUri, poolMax: config.dbPoolMax, logger })
      : undefined,
    readiness = createReadiness({ checks: database ? { db: () => database.checkReady() } : {} }),
  } = {},
) {
  if (!database && config.env !== 'test') {
    logger.warn('MONGODB_URI is not set: running without a database (readiness has no db check)');
  }

  // App yahan sirf *banta* hai; abhi tak koi port nahi khula.
  const app = createApp({ config, readiness, logger, database });

  // `app.listen()` turant server object return kar deta hai, lekin port asal mein thodi der baad
  // bind hota hai. Do events mein se koi ek aayega:
  //   'listening' -> bind ho gaya, ab traffic le sakte hain  -> resolve
  //   'error'     -> bind fail (EADDRINUSE, permission...)   -> reject
  // Isi liye event-based API ko Promise mein lapeta, taaki `await` kar sakein.
  // `.once` = listener sirf ek baar chalta hai, phir hata diya jata hai.
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(config.port, config.host);
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  }).catch(async (err) => {
    // Port bind nahi hua: database connection khula reh jaata aur process atak sakta tha, isliye pehle band karo.
    await database?.disconnect();
    throw err;
  });

  // DB connect background mein (await nahi): server ko DB ke wait mein nahi rokte. Fail hone par database module khud
  // retry karta hai aur tab tak readiness 503 deti hai. (`.catch`: connect() kabhi reject nahi karta retry mode mein,
  // phir bhi unhandled rejection se bachne ke liye.)
  database
    ?.connect()
    .catch((err) =>
      logger.error({ errName: err.name, errMessage: err.message }, 'mongodb connect aborted'),
    );

  // Server ko band karne ka sahi order:
  async function close() {
    // 1. Pehle readiness ko "shutting down" mark karo. Ab /health/ready 503 dega, to load balancer
    //    naye requests bhejna band kar dega, aur hum chalte hue requests ko aaram se khatam kar sakte hain.
    readiness.markShuttingDown();

    await new Promise((resolve, reject) => {
      // 2. `server.close` naye connections lena band karta hai. Callback tab chalta hai jab
      //    saare maujooda connections band ho chuke hon. Error aaye to reject.
      server.close((err) => (err ? reject(err) : resolve()));
      // 3. Keep-alive connections (browser/client ne connection khula rakha hai par koi request nahi chal
      //    rahi) warna `close` ko atka sakte hain. Inhe turant band karte hain; jin connections par
      //    request chal rahi hai wo apna response poora karke hi band hote hain.
      server.closeIdleConnections();
    });

    // 4. Sabse aakhir mein database connections band (HTTP requests khatam ho chuki hain, ab koi query nahi aayegi).
    await database?.disconnect();
  }

  // `server.address().port` isliye: agar PORT=0 diya (OS koi free port chune), to asli port yahin milta hai.
  return { server, close, port: server.address().port, logger, database };
}

async function main() {
  // `.env` se values load karo (local convenience). Jo environment variable pehle se set hai usse
  // override NAHI karta, isliye production mein asli env vars hi jeette hain.
  // `quiet: true` = dotenv ka apna info message print na kare.
  // Ye import ke waqt nahi, main() mein hai, taaki tests (jo is file ko import karte hain) par `.env` ka asar na ho.
  dotenv.config({ quiet: true });

  // Config validate karo (galat PORT/NODE_ENV jaisi cheezein yahin pakdi jati hain).
  // Fail-fast: config galat ho to server start hi nahi hota.
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // Ye expected galti hai (user ne env galat diya): stack trace nahi, saaf message dikhao aur exit code 1 se band karo.
      // `console.error` isliye (logger nahi) ki logger banane ke liye config chahiye, jo abhi valid hi nahi hai.
      console.error(err.message);
      process.exit(1);
    }
    // ConfigError ke alawa koi aur galti (programming bug) ho to chhupana nahi; upar throw karo,
    // jo neeche `main().catch(...)` pakdega.
    throw err;
  }

  const { port, close, logger } = await startServer(config);
  logger.info({ host: config.host, port, env: config.env }, 'server listening');

  // Process ko band karne ke signals sunte hain:
  //   SIGTERM -> Docker/Kubernetes/deploy tools "please band ho jao" bolne ke liye bhejte hain
  //   SIGINT  -> terminal mein Ctrl+C dabane par aata hai
  // Abhi sirf itna: readiness 503 + server close, phir exit. Requests ko deadline ke saath drain karna
  // aur DB/Redis ko order mein band karna baad ke phase (observability & reliability) mein aayega.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    // `once`: signal ek hi baar handle ho; dobara Ctrl+C dabane par default behaviour (turant exit) wapas mil jata hai.
    process.once(signal, () => {
      // `.then(onSuccess, onError)`: close() theek se ho gaya -> exit code 0 (success);
      // close() mein error aaya -> log karo aur exit code 1 (failure).
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

// "Direct run" check: main() tabhi chalao jab ye file seedha `node src/server.js` se chalayi gayi ho,
// tab nahi jab koi doosri file (jaise tests) isse `import` kare.
//   process.argv[1]  -> jo script node ko chalane ko diya gaya (file path)
//   import.meta.url  -> is module ka apna URL (`file:///...`)
// Dono ko same format mein laane ke liye path ko `pathToFileURL` se URL banaya, phir compare kiya.
// `process.argv[1] &&` guard isliye ki kuch modes mein (jaise node REPL) script path hota hi nahi.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // main() async hai; uski koi bhi bachi hui galti (jaise EADDRINUSE jab port le liya gaya ho) yahan aati hai.
  // Isko pakadna zaruri hai, warna "unhandled rejection" ban jaata. Message print karke exit code 1.
  main().catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}
