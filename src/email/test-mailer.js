// Test-only email delivery: emails bheji nahi jaati, sirf memory mein jama hoti hain.
//
// Kyun: abhi koi real email provider nahi hai (wo baad mein "provider adapter" ke roop mein judega). Mailer ka interface
// chhota rakha hai (`send(message)`), taaki asli adapter (SES/SendGrid...) is jagah bina auth module badle aa sake.
//
// Production mein ye mailer EMAIL DELIVER NAHI KARTA: verification/reset links kisi ko nahi pahunchte. Isliye startup par
// production mein warning log hoti hai (src/modules/auth/index.js), aur asli adapter lagana production ke liye zaruri hai.
//
// Memory bound: sirf aakhri `limit` emails rakhte hain (purani hat jaati hain).

/**
 * @param {object} options
 * @param {import('pino').Logger} options.logger
 * @param {number} [options.limit]
 */
export function createTestMailer({ logger, limit = 100 }) {
  const messages = [];

  return {
    /**
     * @param {{ to: string, template: string, subject: string, text: string }} message
     * Log mein sirf template ka naam jaata hai (recipient ya link/token nahi).
     */
    async send(message) {
      messages.push({ ...message, sentAt: new Date().toISOString() });
      if (messages.length > limit) messages.shift();
      logger.info({ template: message.template }, 'test mailer: email captured (not delivered)');
    },

    /** Jama hui emails (naye last mein). Sirf non-production examples route (mailbox) isse padhta hai. */
    list() {
      return [...messages];
    },

    clear() {
      messages.length = 0;
    },
  };
}
