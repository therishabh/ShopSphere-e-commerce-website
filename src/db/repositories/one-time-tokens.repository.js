// One-time tokens (email verification, password reset) ka data access. Sirf token ki hash store hoti hai.
//
// "Single-use" ka matlab database level par: `consume` ek hi atomic operation mein check karta hai (token hai, purpose sahi, abhi
// use nahi hua, expire nahi hua) aur use "used" mark karta hai. Do requests ek saath ek hi token bhejein to sirf ek ko milta hai.

import { serialize } from '../serialize.js';

export function createOneTimeTokenRepository({ OneTimeToken }) {
  return {
    async create({ userId, purpose, tokenHash, expiresAt }) {
      const [token] = await OneTimeToken.create([{ userId, purpose, tokenHash, expiresAt }]);
      return serialize(token);
    },

    /**
     * Token ko ek hi baar use karne deta hai. @returns token ka document (userId ke saath) ya null (galat/expired/pehle se used).
     * Caller ko null ka kaaran nahi pata chalna chahiye (sab ek jaisa "invalid token").
     */
    async consume({ tokenHash, purpose }) {
      return serialize(
        await OneTimeToken.findOneAndUpdate(
          { tokenHash, purpose, usedAt: null, expiresAt: { $gt: new Date() } },
          { $set: { usedAt: new Date() } },
          { returnDocument: 'before' },
        ).lean(),
      );
    },

    /** Naya token banane se pehle purane abhi-tak-unused tokens bekaar kar do (sirf sabse naya link chale). */
    async invalidateOutstanding(userId, purpose) {
      await OneTimeToken.updateMany(
        { userId, purpose, usedAt: null },
        { $set: { usedAt: new Date() } },
      );
    },
  };
}
