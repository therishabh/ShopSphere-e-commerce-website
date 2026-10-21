// Redis connection module (browser sessions ke liye; aage cache/queues bhi).
//
// Pattern database module jaisa hi hai: ek baar banao, dependency ki tarah pass karo. Server Redis ke bina bhi start hota hai
// (background mein connect + auto-reconnect), aur Redis down hone par sirf wo requests fail hoti hain jo session maangti hain
// (503); baaki API chalti rehti hai.

import { createClient } from 'redis';

/**
 * @param {object} options
 * @param {string} options.url  REDIS_URL (password ho sakta hai: kabhi log mat karo)
 * @param {import('pino').Logger} options.logger
 */
export function createRedis({ url, logger }) {
  const client = createClient({
    url,
    // Offline queue band: Redis tak pahunch nahi paye to command turant fail ho (-> 503), request lambi der latki na rahe.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 3000,
      // Connection tootne par har baar thodi der baad dobara koshish: 250ms, 500ms ... max 5s. Number return = hamesha retry.
      reconnectStrategy: (retries) => Math.min((retries + 1) * 250, 5000),
    },
  });

  // 'error' event ka listener zaruri hai, warna EventEmitter process ko crash kar deta hai. Sirf naam + message log (URL/password nahi).
  client.on('error', (err) =>
    logger.error({ errName: err.name, errMessage: err.message }, 'redis error'),
  );
  client.on('ready', () => logger.info('redis ready'));
  client.on('end', () => logger.warn('redis connection closed'));

  return {
    client,

    /** Background connect: initial connect fail hone par client khud retry karta rehta hai. */
    async connect() {
      await client.connect();
    },

    /** Readiness check: client ready hai aur PING ka jawab aata hai? Nahi to throw (readiness 'down' maanti hai). */
    async checkReady() {
      if (!client.isReady) throw new Error('redis is not connected');
      await client.ping();
    },

    /** Shutdown: pending commands khatam hone do (`quit`), connection band ho. Connect hi nahi hua ho to seedha destroy. */
    async disconnect() {
      if (client.isOpen) await client.quit().catch(() => client.destroy());
      else client.destroy();
    },
  };
}
