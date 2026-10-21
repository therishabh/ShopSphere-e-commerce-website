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

  // --- Authentication (Phase 7)
  // Access token (JWT) ko sign karne ka secret. Kam se kam 32 characters (HS256 ke liye lamba random secret).
  // Banane ka tareeka: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  // Isko kabhi log/commit mat karo. Production mein required (neeche); dev mein na ho to har startup par naya random secret
  // banta hai (restart par purane tokens invalid ho jaate hain).
  AUTH_JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),

  // Frontend ka base URL: verification/reset email ke links isi se bante hain (e.g. https://shop.example.com/reset-password?token=...).
  // Trailing slash neeche hata dete hain. Production mein https:// zaruri.
  APP_BASE_URL: z.url().default('http://localhost:3000'),

  // Access token kitni der valid rahega (seconds). Chhota rakhte hain, kyunki access token ko revoke nahi kar sakte
  // (stateless): chori hone par nuksaan itni der tak hi.
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  // Refresh token kitne din valid (har use par naya token milta hai, ye "sliding" nahi balki har token ki apni age hai).
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  // --- Browser sessions (Phase 8)
  // Redis connection string: redis://host:6379 ya rediss:// (TLS). Browser sessions Redis mein rehti hain. Set na ho to
  // session routes mount hi nahi hote (bearer-token auth waise hi chalta hai). Password ho sakta hai: kabhi log mat karo.
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'must start with redis:// or rediss://')
    .optional(),

  // Session cookie ko sign karne ka secret (>= 32 chars): cookie mein session id hoti hai, aur signature se cookie tampering pakdi jaati hai.
  // REDIS_URL ke saath production mein required; dev mein na ho to har run par random (restart par purani cookies bekaar).
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),

  // Idle timeout (minutes): itni der koi request na aaye to session khatam. Har request par taza hota hai (rolling).
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

  // Absolute timeout (hours): kitna bhi active ho, itne ghante baad dobara login zaruri (chori hui session hamesha nahi chalegi).
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(168).default(12),

  // Kitne reverse proxies (Nginx/load balancer) ke peeche app hai. 0 = seedha internet. Production mein TLS proxy par khatam
  // hota hai, aur Secure cookie / req.ip tabhi sahi chalte hain jab Express `X-Forwarded-*` headers par bharosa kare. Galat
  // number se client apna IP/protocol jhooth bol sakta hai: sirf asli proxy hops ginao. (Poora hardening Phase 11 mein.)
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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
  const {
    NODE_ENV,
    HOST,
    PORT,
    LOG_LEVEL,
    MONGODB_URI,
    DB_POOL_MAX,
    AUTH_JWT_SECRET,
    APP_BASE_URL,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_DAYS,
    REDIS_URL,
    SESSION_SECRET,
    SESSION_IDLE_MINUTES,
    SESSION_ABSOLUTE_HOURS,
    TRUST_PROXY_HOPS,
  } = result.data;

  // Production mein database ke bina app chalana galti hai (fail-fast). Dev/test mein optional hai: DB-based features
  // abhi ke routes mein use nahi hote, aur tests ko database ki zarurat nahi.
  if (NODE_ENV === 'production') {
    const problems = [];
    if (!MONGODB_URI) problems.push('MONGODB_URI: required when NODE_ENV=production');
    if (!AUTH_JWT_SECRET) problems.push('AUTH_JWT_SECRET: required when NODE_ENV=production');
    // Production mein links https:// par hone chahiye (token wala link plain http par sniff ho sakta hai).
    if (!APP_BASE_URL.startsWith('https://'))
      problems.push('APP_BASE_URL: must use https:// when NODE_ENV=production');
    // Redis (browser sessions) configured hai to cookie signing secret zaruri.
    if (REDIS_URL && !SESSION_SECRET)
      problems.push('SESSION_SECRET: required when REDIS_URL is set and NODE_ENV=production');
    if (problems.length > 0) throw new ConfigError(problems);
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
    // Authentication ki settings ek group mein. jwtSecret undefined ho sakta hai (dev/test).
    auth: Object.freeze({
      jwtSecret: AUTH_JWT_SECRET,
      appBaseUrl: APP_BASE_URL.replace(/\/+$/, ''),
      accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
    }),
    redisUrl: REDIS_URL,
    // Browser session ki settings. secret undefined ho sakta hai (dev/test).
    session: Object.freeze({
      secret: SESSION_SECRET,
      idleMinutes: SESSION_IDLE_MINUTES,
      absoluteHours: SESSION_ABSOLUTE_HOURS,
    }),
    trustProxyHops: TRUST_PROXY_HOPS,
  });
}
