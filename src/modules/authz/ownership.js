// Ownership checks: "kya ye resource is user ka hai?". Permission (role) se alag cheez.
//
// Rule: resource ka maalik HAMESHA server tay karta hai, client ka bheja hua sellerId/ownerId kabhi nahi. Seller ki pehchan
// actor ki id se uska SellerProfile dhundh kar nikalti hai. Isliye seller URL mein sirf product id badalkar doosre seller ka
// product nahi chhoo sakta.
//
// Status codes: product hi nahi mila = 404. Product hai par kisi aur seller ka = 403. (Alternative: dono par 404, jisse
// existence bhi nahi khulti. Yahan product ids unguessable ObjectIds hain aur ACTIVE products public hote hain, isliye saaf
// 403 chuna; docs/modules/authorization-and-sessions.md mein trade-off hai.)

import { AuthorizationError, NotFoundError } from '../../errors/app-errors.js';

/**
 * Actor ka APPROVED seller profile do (ya 403). Pending/rejected/suspended seller koi product mutation nahi kar sakta.
 */
export async function requireApprovedSeller({ sellerProfiles }, actor) {
  const profile = await sellerProfiles.findByUserId(actor.id);
  if (!profile || profile.status !== 'APPROVED') {
    throw new AuthorizationError('Your seller account is not approved', {
      code: 'SELLER_NOT_APPROVED',
    });
  }
  return profile;
}

/**
 * Product actor ke seller ka hona chahiye. @returns { profile, product } ya 404/403 throw.
 * Mutation ke waqt query mein bhi sellerId filter lagta hai (defense in depth): is check mein kabhi bug ho to bhi galat seller
 * ki row update nahi hoti.
 */
export async function requireOwnedProduct({ sellerProfiles, products }, actor, productId, logger) {
  const profile = await requireApprovedSeller({ sellerProfiles }, actor);
  const product = await products.findOwnerView(productId);
  if (!product) throw new NotFoundError('Product not found');
  if (product.sellerId !== profile.id) {
    logger?.warn(
      { userId: actor.id, productId },
      'ownership check failed: product belongs to another seller',
    );
    throw new AuthorizationError('You do not own this product');
  }
  return { profile, product };
}
