// Session registry: "is user ki kaun-kaun si sessions chal rahi hain" ka Redis set.
//
// Kyun: express-session sirf ek session id se kaam karta hai, user ke saare sessions dhundhne ka tareeka nahi deta. Password reset
// ya "sab jagah se logout" par user ki SAARI sessions Redis se hata deni hoti hain, isliye har login par session id ek set mein
// (`sess_user:<userId>`) likh lete hain. Session data (`sess:<id>`) connect-redis ka hai; ye set sirf index hai.

// connect-redis ka default key prefix. Session module isi prefix se store banata hai.
export const SESSION_KEY_PREFIX = 'sess:';
const userKey = (userId) => `sess_user:${userId}`;

/**
 * @param {object} deps
 * @param {import('redis').RedisClientType} deps.redis  node-redis client
 * @param {number} deps.absoluteSeconds  session ki max umar; index set ka TTL isse kam nahi hona chahiye
 */
export function createSessionRegistry({ redis, absoluteSeconds }) {
  return {
    /** Naya session is user ka hai, likh lo. */
    async add(userId, sessionId) {
      await redis.sAdd(userKey(userId), sessionId);
      // Set ka TTL: absolute timeout se thoda zyada. Is dauran bhi sessions khatam ho jaayen to set apne aap hat jaata hai.
      await redis.expire(userKey(userId), absoluteSeconds + 3600);
    },

    /** Ek session band hui (logout): index se bhi hata do. */
    async remove(userId, sessionId) {
      await redis.sRem(userKey(userId), sessionId);
    },

    /** User ki saari sessions Redis se delete (password reset, logout-all). @returns kitni sessions hatayi */
    async revokeAll(userId) {
      const ids = await redis.sMembers(userKey(userId));
      if (ids.length > 0) await redis.del(ids.map((id) => `${SESSION_KEY_PREFIX}${id}`));
      await redis.del(userKey(userId));
      return ids.length;
    },
  };
}
