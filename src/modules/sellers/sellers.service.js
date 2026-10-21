// Sellers ka business logic: seller banne ki arzi aur apna profile dekhna. Approval admin ka kaam hai (src/modules/admin).

import { NotFoundError } from '../../errors/app-errors.js';

export function createSellerService({ database }) {
  return {
    /**
     * Koi bhi ACTIVE user seller banne ke liye apply kar sakta hai (permission `seller:apply`). Profile PENDING banta hai aur user
     * ka role tab tak CUSTOMER rehta hai jab tak admin approve na kare. Duplicate (user/storeName/slug) -> 409.
     */
    apply({ actor, input }) {
      return database.transaction(async ({ sellerProfiles, audit }) => {
        const profile = await sellerProfiles.create({ userId: actor.id, ...input });
        await audit.record({
          actorId: actor.id,
          action: 'seller.applied',
          entityType: 'SellerProfile',
          entityId: profile.id,
          metadata: { storeName: profile.storeName },
        });
        return profile;
      });
    },

    /** Apna profile (status ke saath: pending/approved/rejected/suspended). */
    async getOwn({ actor }) {
      const profile = await database.repositories.sellerProfiles.findByUserId(actor.id);
      if (!profile) throw new NotFoundError('Seller profile not found');
      return profile;
    },
  };
}
