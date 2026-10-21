// Ye file environment variables (PORT, NODE_ENV, ...) ko ek jagah validate karti hai.
// Baaki poora code `process.env` seedha nahi padhta; wo yahan se bana hua `config` object use karta hai.
//
// Zod kya hai (short mein): ek library jisme hum data ka "shape" (schema) likhte hain,
// jaise "PORT number hona chahiye, 0 se 65535 ke beech". Phir zod asli data ko us schema
// se check karta hai aur galat hone par saaf error batata hai.

import { z } from 'zod';

// Schema = rules ki list. Har key ek environment variable ka naam hai.
//
// Zod chain padhne ka tarika: left se right, har step ek rule/transform add karta hai.
//   z.string()    -> value string honi chahiye
//   .min(1)       -> kam se kam 1 character (khaali string reject)
//   .default(x)   -> variable set nahi hai (undefined) to x maan lo
//   z.enum([...]) -> value sirf in options mein se ek ho sakti hai
const schema = z.object({
  // Kaunsa environment hai. Sirf 3 allowed values; kuch aur (jaise 'staging') error dega.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Server kis address par sunega. 127.0.0.1 = sirf apni machine se access.
  HOST: z.string().min(1).default('127.0.0.1'),

  // Environment variables hamesha *string* hote hain ("3000", 3000 nahi).
  //   z.coerce.number() -> string ko number mein convert karta hai ("3000" -> 3000);
  //                        "abc" jaisi value number nahi ban sakti, to error aayega
  //   .int()            -> decimal nahi chalega (1.5 reject)
  //   .min(0).max(65535)-> valid TCP port range. 0 ka matlab OS khud koi free port de dega (tests mein use hota hai)
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),

  // Log kitna detailed ho. `.optional()` = ye variable na ho to bhi theek hai (error nahi).
  // Yahan `.default()` isliye nahi lagaya ki iska default NODE_ENV par depend karta hai
  // (tests mein 'silent', baaki mein 'info'), aur zod ke default ko doosri field ka pata nahi hota.
  // Isliye default neeche loadConfig() mein parse ke baad decide hota hai.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),

  // MongoDB connection string: mongodb://host:27017/dbname?replicaSet=rs0  ya  mongodb+srv://user:password@cluster/dbname
  // Isme password ho sakta hai, isliye isko kabhi log mat karo aur .env ko git mein mat daalo.
  // `.optional()`: tests (NODE_ENV=test) mein DB ke bina app chalti hai; production mein neeche required banaya gaya hai.
  // Regex sirf scheme check karti hai (mongodb:// ya mongodb+srv://), baaki parsing driver karta hai.
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://')
    .optional(),

  // Database connection pool ka maximum size (ek app instance kitne connections khol sakta hai).
  // MongoDB server ki apni connection limit hoti hai; instances x poolMax us se kam rakhna.
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

// Config galat hone par ye custom error throw hota hai.
// `issues` mein har galti ek alag line hai, taaki saari galtiyan ek saath dikhein
// (ek-ek karke fix na karni pade).
export class ConfigError extends Error {
  constructor(issues) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Environment variables ko padhke validate karta hai aur ek final config object return karta hai.
 *
 * `env` argument ke roop mein liya gaya hai (default: asli process.env), taaki tests apna
 * chhota object pass kar sakein, jaise loadConfig({ PORT: '8080' }), aur machine ke asli
 * environment par depend na karein.
 */
export function loadConfig(env = process.env) {
  // safeParse = check karo, lekin galti par throw mat karo; result object wapas do:
  //   { success: true,  data: ... }   -> sab theek, `data` mein clean values (defaults + conversion ke baad)
  //   { success: false, error: ... }  -> kuch galat, `error.issues` mein har galti ki detail
  // (parse() galti par seedha throw karta hai; hum apna saaf ConfigError dena chahte the.)
  const result = schema.safeParse(env);

  if (!result.success) {
    // Zod ke har issue ko "FIELD: message" line mein badla, e.g. "PORT: Invalid input: expected number, received NaN"
    // `i.path` field ka naam hai (array), isliye join('.') se string banta hai.
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }

  // Yahan tak aaye matlab saari values valid hain. `data` mein PORT ab number hai, string nahi.
  const { NODE_ENV, HOST, PORT, LOG_LEVEL, MONGODB_URI, DB_POOL_MAX } = result.data;

  // Production mein database ke bina app chalana galti hai (fail-fast). Dev/test mein optional hai: DB-based features
  // abhi ke routes mein use nahi hote, aur tests ko database ki zarurat nahi.
  if (NODE_ENV === 'production' && !MONGODB_URI) {
    throw new ConfigError(['MONGODB_URI: required when NODE_ENV=production']);
  }

  // LOG_LEVEL diya hai to wahi; nahi diya to tests mein 'silent' (output saaf rahe), baaki jagah 'info'.
  // `??` = sirf undefined/null par right side use karo.
  const logLevel = LOG_LEVEL ?? (NODE_ENV === 'test' ? 'silent' : 'info');

  // Object.freeze = object read-only ho jaata hai, taaki app mein kahin galti se config badal na jaye.
  // Keys ko readable naam diye (NODE_ENV -> env, HOST -> host...), baaki code yahi naam use karta hai.
  // mongodbUri undefined ho sakta hai (dev/test): tab app database ke bina chalti hai aur readiness mein `db` check nahi judta.
  return Object.freeze({
    env: NODE_ENV,
    host: HOST,
    port: PORT,
    logLevel,
    mongodbUri: MONGODB_URI,
    dbPoolMax: DB_POOL_MAX,
  });
}
