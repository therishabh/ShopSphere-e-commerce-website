// Refresh tokens ka data access. Token ki sirf SHA-256 hash store hoti hai (asli token sirf client ke paas).
//
// Rotation model: har refresh par purana token "claim" (revoke) hota hai aur naya token usi `familyId` mein banta hai.
//   - purana token dobara aaye (revokedAt set + replacedById set) = REUSE: chori ka sanket, poori family revoke.
//   - logout par family revoke hoti hai (replacedById nahi lagta), taaki "normal logout" aur "reuse attack" alag pehchane jaayein.
// TTL index `expiresAt` par hai: expire hone par Mongo document khud delete kar deta hai.

import mongoose from 'mongoose';
import { serialize } from '../serialize.js';

export function createRefreshTokenRepository({ RefreshToken }) {
  return {
    /** familyId na diya ho to naya family (naya login). Rotation par purane token ki familyId do. */
    async create({ userId, familyId, tokenHash, expiresAt, userAgent }) {
      const [token] = await RefreshToken.create([
        {
          userId,
          familyId: familyId ?? new mongoose.Types.ObjectId(),
          tokenHash,
          expiresAt,
          userAgent: userAgent?.slice(0, 255),
        },
      ]);
      return serialize(token);
    },

    async findByHash(tokenHash) {
      return serialize(await RefreshToken.findOne({ tokenHash }).lean());
    },

    /**
     * Atomic "pehle mai": token tab hi revoke hota hai jab abhi tak revoke nahi hua. Do requests ek hi token ke saath ek
     * saath aayein to sirf ek ko document milta hai, doosre ko null (-> reuse maana jata hai).
     */
    async claim(id) {
      return serialize(
        await RefreshToken.findOneAndUpdate(
          { _id: id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { returnDocument: 'after' },
        ).lean(),
      );
    },

    /** Purane (rotated) token par likh do ki uski jagah kaun sa naya token aaya (reuse detection ke liye). */
    async linkReplacement(id, replacedById) {
      await RefreshToken.updateOne({ _id: id }, { $set: { replacedById } });
    },

    /** Ek login-session (family) ke saare active tokens revoke. */
    async revokeFamily(familyId) {
      const result = await RefreshToken.updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return result.modifiedCount;
    },

    /** User ke saare sessions band (logout-all, password reset). */
    async revokeAllForUser(userId) {
      const result = await RefreshToken.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return result.modifiedCount;
    },
  };
}
