// Admin ka business logic: seller approval, product moderation, audit trail padhna.
//
// Har sensitive admin action ek transaction mein: (state change + audit event). Audit mein actor, entity, from/to status aur
// reason jaata hai; password/token/secret kabhi nahi (audit repository secret-jaisi keys reject bhi karta hai).
// State transitions explicit table se: galat status se transition 409, aur conditional update se do admins ek saath karein to
// sirf ek jeetta hai.

import { ConflictError, NotFoundError } from '../../errors/app-errors.js';
import { buildPagination } from '../../http/query/pagination.js';

// action -> kaunse status se kaunse status par, aur audit ka event naam.
const SELLER_TRANSITIONS = Object.freeze({
  approve: { from: 'PENDING', to: 'APPROVED', event: 'seller.approved' },
  reject: { from: 'PENDING', to: 'REJECTED', event: 'seller.rejected' },
  suspend: { from: 'APPROVED', to: 'SUSPENDED', event: 'seller.suspended' },
  reinstate: { from: 'SUSPENDED', to: 'APPROVED', event: 'seller.reinstated' },
});

const PRODUCT_DECISIONS = Object.freeze({
  approve: { to: 'ACTIVE', event: 'product.approved' },
  reject: { to: 'REJECTED', event: 'product.rejected' },
});

const page = ({ items, total }, query) => ({
  items,
  pagination: buildPagination({ page: query.page, limit: query.limit, total }),
});

export function createAdminService({ database }) {
  const repos = database.repositories;

  return {
    async listSellers({ query }) {
      return page(await repos.sellerProfiles.list(query), query);
    },

    /**
     * Seller ka status badalna (approve/reject/suspend/reinstate). Approve par user ka role SELLER ho jaata hai (isi transaction
     * mein), jisse seller permissions milti hain. Suspend/reject par role nahi chhedte: seller actions "profile APPROVED hai?"
     * se bhi rukte hain (src/modules/authz/ownership.js), isliye suspended seller koi product mutation nahi kar sakta.
     */
    transitionSeller({ actor, sellerId, action, reason }) {
      const rule = SELLER_TRANSITIONS[action];
      return database.transaction(async ({ sellerProfiles, users, products, audit }) => {
        const extra = action === 'approve' ? { approvedAt: new Date(), approvedBy: actor.id } : {};
        const updated = await sellerProfiles.transition({
          id: sellerId,
          from: [rule.from],
          to: rule.to,
          extra,
        });
        if (!updated) {
          const existing = await sellerProfiles.findById(sellerId);
          if (!existing) throw new NotFoundError('Seller not found');
          throw new ConflictError(`Seller cannot be ${action}d from status ${existing.status}`);
        }
        if (action === 'approve') await users.setRole(updated.userId, 'SELLER');
        // Suspend par seller ke ACTIVE products public catalog se hat jaate hain (ON_HOLD) aur reinstate par wapas aate hain.
        // Isi transaction mein: status aur products ek saath badalte hain, beech ki halat kisi ko nahi dikhti.
        let productsAffected;
        if (action === 'suspend') productsAffected = await products.holdActiveBySeller(updated.id);
        if (action === 'reinstate')
          productsAffected = await products.releaseHoldBySeller(updated.id);
        await audit.record({
          actorId: actor.id,
          action: rule.event,
          entityType: 'SellerProfile',
          entityId: updated.id,
          metadata: {
            from: rule.from,
            to: rule.to,
            reason,
            ...(productsAffected !== undefined ? { productsAffected } : {}),
          },
        });
        return updated;
      });
    },

    async listProducts({ query }) {
      return page(await repos.products.listForAdmin(query), query);
    },

    /** Product moderation: PENDING_REVIEW -> ACTIVE (approve) ya REJECTED (reject, kaaran zaruri). */
    moderateProduct({ actor, productId, decision, reason }) {
      const rule = PRODUCT_DECISIONS[decision];
      return database.transaction(async ({ products, sellerProfiles, audit }) => {
        const product = await products.findOwnerView(productId);
        if (!product) throw new NotFoundError('Product not found');
        if (decision === 'approve') {
          // Suspended/rejected seller ka product publish nahi hoga.
          const seller = await sellerProfiles.findById(product.sellerId);
          if (!seller || seller.status !== 'APPROVED')
            throw new ConflictError("The product's seller is not approved");
        }
        const updated = await products.transitionStatus({
          id: productId,
          from: ['PENDING_REVIEW'],
          to: rule.to,
          // reason optional hai (approve par): undefined ko $set mein nahi bhejte.
          set: {
            ...(reason ? { moderationNote: reason } : {}),
            moderatedAt: new Date(),
            moderatedBy: actor.id,
          },
        });
        if (!updated)
          throw new ConflictError(`Product cannot be ${decision}d from status ${product.status}`);
        await audit.record({
          actorId: actor.id,
          action: rule.event,
          entityType: 'Product',
          entityId: productId,
          metadata: { from: 'PENDING_REVIEW', to: rule.to, reason, sellerId: product.sellerId },
        });
        return updated;
      });
    },

    /** Naya category (admin only). Naam ya slug duplicate ho to unique index se 409. */
    createCategory({ actor, input }) {
      return database.transaction(async ({ categories, audit }) => {
        const category = await categories.create(input);
        await audit.record({
          actorId: actor.id,
          action: 'category.created',
          entityType: 'Category',
          entityId: category.id,
          metadata: { slug: category.slug },
        });
        return category;
      });
    },

    /**
     * Review moderation: admin kisi bhi review ko hata sakta hai (kaaran zaruri, audit mein). Review delete aur product ka rating
     * summary ek transaction mein, jaise user ke apne delete mein (reviews.service.js).
     */
    removeReview({ actor, reviewId, reason }) {
      return database.transaction(async ({ reviews, products, audit }) => {
        const removed = await reviews.delete({ id: reviewId });
        if (!removed) throw new NotFoundError('Review not found');
        await products.applyRatingChange({
          id: removed.productId,
          countDelta: -1,
          sumDelta: -removed.rating,
        });
        await audit.record({
          actorId: actor.id,
          action: 'review.removed',
          entityType: 'Review',
          entityId: removed.id,
          metadata: { productId: String(removed.productId), reason },
        });
      });
    },

    async listAuditEvents({ query }) {
      return page(await repos.audit.list(query), query);
    },
  };
}
