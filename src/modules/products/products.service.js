// Products ka business logic: seller-side mutations (Phase 8, Phase 9 mein archive + atomic stock adjust) aur public catalog reads.
//
// Har mutation: (1) permission middleware ne role check kiya, (2) yahan ownership check (`requireOwnedProduct`: product actor ke
// APPROVED seller profile ka hai), (3) update query mein sellerId + allowed status filter phir se (defense in depth), (4) audit.
// Seller ID kabhi client se nahi aati: actor ke seller profile se nikalti hai.

import { ConflictError, NotFoundError, ValidationError } from '../../errors/app-errors.js';
import { buildPagination } from '../../http/query/pagination.js';
import { requireApprovedSeller, requireOwnedProduct } from '../authz/ownership.js';
import { toPublicProduct, toPublicProducts } from './products.public.js';

// Edit rules:
//   DRAFT / REJECTED : koi bhi allowed field badal sakte hain; edit ke baad status DRAFT (dobara submit karna padega).
//   ACTIVE           : sirf `priceCents` (price badalna moderation nahi maangta); naam/description badalna approved content ko
//                      bina review badalna hota (moderation bypass), isliye 409. Status ACTIVE hi rehta hai.
//   baaki (PENDING_REVIEW, ON_HOLD, ARCHIVED): edit nahi.
const EDITABLE = ['DRAFT', 'REJECTED'];
// Archive kisi bhi live state se ho sakta hai (soft delete: row rehti hai, orders/reviews ka history bacha rehta hai).
const ARCHIVABLE = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ON_HOLD'];

const page = ({ items, total }, query) => ({
  items,
  pagination: buildPagination({ page: query.page, limit: query.limit, total }),
});

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

    /** Naam/description/price badalna (sirf owner; rules upar EDITABLE ke comment mein). */
    async update({ actor, productId, patch }) {
      const { profile, product } = await requireOwnedProduct(repos, actor, productId, logger);
      const priceOnly = Object.keys(patch).every((key) => key === 'priceCents');
      let allowedStatuses = EDITABLE;
      let set = { ...patch, status: 'DRAFT' };
      if (product.status === 'ACTIVE') {
        if (!priceOnly) {
          throw new ConflictError(
            'Only the price of an active product can be changed; other edits would bypass moderation',
          );
        }
        allowedStatuses = ['ACTIVE'];
        set = { ...patch };
      }
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.updateByOwner({
          id: productId,
          sellerId: profile.id,
          allowedStatuses,
          set,
        });
        if (!updated)
          throw new ConflictError(
            'Only draft, rejected or (price only) active products can be edited',
          );
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

    /** Soft delete: status ARCHIVED (public catalog se hat jata hai, wishlist mein chhup jata hai). Dobara archive karna 409. */
    async archive({ actor, productId }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.transitionStatus({
          id: productId,
          sellerId: profile.id,
          from: ARCHIVABLE,
          to: 'ARCHIVED',
        });
        if (!updated) throw new ConflictError('Product is already archived');
        await audit.record({
          actorId: actor.id,
          action: 'product.archived',
          entityType: 'Product',
          entityId: productId,
        });
        return updated;
      });
    },

    /**
     * Stock relative badalna (delta). Concurrency-safe: do sellers/tabs ek saath +5 aur -2 bhejein to dono apply hote hain
     * (absolute `setStock` mein purani value padhkar likhne se ek update kho sakta tha). Guard fail hone par 409.
     */
    async adjustStock({ actor, productId, delta }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      return database.transaction(async ({ products, audit }) => {
        const updated = await products.adjustStockByOwner({
          id: productId,
          sellerId: profile.id,
          delta,
        });
        if (!updated)
          throw new ConflictError(
            'Stock cannot go below the reserved quantity or above the maximum, or the product is archived',
          );
        await audit.record({
          actorId: actor.id,
          action: 'product.stock_adjusted',
          entityType: 'Product',
          entityId: productId,
          metadata: { delta, onHand: updated.stock.onHand },
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

    // --- Reads ----------------------------------------------------------------------------------------------------------

    /** Public catalog: sirf ACTIVE products, sirf allowlisted fields (products.public.js). Auth nahi chahiye. */
    async listPublic({ query }) {
      const { items, total } = await repos.products.list(query, { publicOnly: true });
      return page({ items: await toPublicProducts(items, repos.sellerProfiles), total }, query);
    },

    /** Public detail: ACTIVE nahi (draft, review, hold, archived) to 404, taaki unpublished product ka wajood bhi na khule. */
    async getPublic({ productId }) {
      const product = await repos.products.findById(productId, { publicOnly: true });
      if (!product) throw new NotFoundError('Product not found');
      const stores = await repos.sellerProfiles.findPublicByIds([product.sellerId]);
      return toPublicProduct(product, stores.get(String(product.sellerId)));
    },

    /** Seller ki apni list (saare statuses, status filter allowed). Seller ID actor ke profile se aati hai, client se nahi. */
    async listMine({ actor, query }) {
      const profile = await requireApprovedSeller(repos, actor);
      const { items, total } = await repos.products.list(query, {
        publicOnly: false,
        sellerId: profile.id,
      });
      return page({ items, total }, query);
    },

    /** Apna ek product (moderation note, stock reserved sab ke saath). Doosre seller ka ID dene par 403 (ownership.js). */
    async getMine({ actor, productId }) {
      const { profile } = await requireOwnedProduct(repos, actor, productId, logger);
      const product = await repos.products.findById(productId, { publicOnly: false });
      // `sellerId` document se ObjectId aata hai, profile.id string hai: String() se compare (warna hamesha mismatch).
      if (!product || String(product.sellerId) !== profile.id)
        throw new NotFoundError('Product not found');
      return product;
    },
  };
}
