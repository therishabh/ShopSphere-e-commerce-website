// Products ka seller-side business logic (Phase 8: sirf wo mutations jo ownership dikhate hain; public catalog/search/reviews Phase 9).
//
// Har mutation: (1) permission middleware ne role check kiya, (2) yahan ownership check (`requireOwnedProduct`: product actor ke
// APPROVED seller profile ka hai), (3) update query mein sellerId + allowed status filter phir se (defense in depth), (4) audit.
// Seller ID kabhi client se nahi aati: actor ke seller profile se nikalti hai.

import { ConflictError, ValidationError } from '../../errors/app-errors.js';
import { requireApprovedSeller, requireOwnedProduct } from '../authz/ownership.js';

// Edit sirf DRAFT ya REJECTED product par: approved (ACTIVE) product ka naam/description badalna moderation bypass hota. (Phase 9
// mein active product edit ka flow aayega.) Edit ke baad status DRAFT.
const EDITABLE = ['DRAFT', 'REJECTED'];

export function createProductService({ database, logger }) {
  const repos = database.repositories;

  return {
    /** Naya product DRAFT mein. Category slug se; SKU seller ke andar unique (duplicate -> 409). */
    async create({ actor, input }) {
      const profile = await requireApprovedSeller(repos, actor);
      const category = await repos.categories.findBySlug(input.category);
      if (!category) {
        throw new ValidationError('Validation failed', {
          details: [{ source: 'body', path: 'category', message: 'unknown category' }],
        });
      }

      return database.transaction(async ({ products, audit }) => {
        const { category: _slug, ...fields } = input; // eslint-disable-line no-unused-vars
        const product = await products.create({
          ...fields,
          sellerId: profile.id,
          categoryId: category.id,
          categorySlug: category.slug,
        });
        await audit.record({
          actorId: actor.id,
          action: 'product.created',
          entityType: 'Product',
          entityId: product.id,
          metadata: { sku: product.sku },
        });
        return product;
      });
    },

    /** Naam/description/price badalna (sirf DRAFT/REJECTED, sirf owner). */
    async update({ actor, productId, patch }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.updateByOwner({
          id: productId,
          sellerId: profile.id,
          allowedStatuses: EDITABLE,
          set: { ...patch, status: 'DRAFT' },
        });
        if (!updated) throw new ConflictError('Only draft or rejected products can be edited');
        await audit.record({
          actorId: actor.id,
          action: 'product.updated',
          entityType: 'Product',
          entityId: productId,
          metadata: { fields: Object.keys(patch) },
        });
        return updated;
      });
    },

    /** Physical stock (onHand) set karna (sirf owner). Reserved stock se kam nahi ho sakta. */
    async setStock({ actor, productId, onHand }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.setStockByOwner({
          id: productId,
          sellerId: profile.id,
          onHand,
        });
        if (!updated)
          throw new ConflictError(
            'Stock cannot be set below the reserved quantity, or the product is archived',
          );
        await audit.record({
          actorId: actor.id,
          action: 'product.stock_updated',
          entityType: 'Product',
          entityId: productId,
          metadata: { onHand },
        });
        return updated;
      });
    },

    /** Review ke liye bhejna: DRAFT/REJECTED -> PENDING_REVIEW (sirf owner). Phir admin approve/reject karta hai. */
    async submit({ actor, productId }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.transitionStatus({
          id: productId,
          sellerId: profile.id,
          from: EDITABLE,
          to: 'PENDING_REVIEW',
        });
        if (!updated)
          throw new ConflictError('Only draft or rejected products can be submitted for review');
        await audit.record({
          actorId: actor.id,
          action: 'product.submitted',
          entityType: 'Product',
          entityId: productId,
        });
        return updated;
      });
    },
  };
}
