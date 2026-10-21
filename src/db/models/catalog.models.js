// Catalog se jude collections: categories, products (stock embedded), reviews, wishlist items.
//
// Design choice (embedding vs referencing):
//  - Product ka stock product ke document ke ANDAR hai (embedded `stock`): ek hi document par atomic update milta hai
//    (`$inc` + filter), isliye stock ke liye transaction ki zarurat nahi aur oversell ek hi operation mein rukta hai.
//  - Seller, category aur reviews alag collections hain (referenced): wo alag lifecycle wale hain aur unbounded badhte hain.

import { MAX_PRICE_CENTS, Schema, SLUG_PATTERN, integer, ref, schemaOptions } from './shared.js';
import { CURRENCIES, PRODUCT_STATUSES } from './enums.js';

export const categorySchema = new Schema(
  {
    slug: { type: String, required: true, match: SLUG_PATTERN, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
  },
  schemaOptions({ collection: 'categories', timestamps: { createdAt: true, updatedAt: false } }),
);
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ name: 1 }, { unique: true });

export const productSchema = new Schema(
  {
    sellerId: ref('SellerProfile'),
    categoryId: ref('Category'),
    // Denormalized (jaan-boojh kar): list filter `category=shoes` bina join/lookup ke ek index se chale. Category ka slug
    // rename hona rare hai; hua to products update karne ka migration likha jayega.
    categorySlug: { type: String, required: true, match: SLUG_PATTERN },
    // SKU seller ke andar unique (alag sellers same SKU use kar sakte hain).
    sku: { type: String, required: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    priceCents: integer({ min: 0, max: MAX_PRICE_CENTS }),
    currency: { type: String, enum: CURRENCIES, default: 'INR', required: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'DRAFT', required: true },
    // Admin moderation ka natija (approve/reject). `moderationNote` seller ko dikhta hai (reject ka kaaran).
    moderationNote: { type: String, maxlength: 500 },
    moderatedAt: Date,
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Embedded inventory. available = onHand - reserved. Update hamesha conditional + atomic (Phase 9/10):
    //   updateOne({ _id, $expr: available >= n }, { $inc: { 'stock.reserved': n } })
    stock: {
      type: new Schema(
        {
          onHand: integer({ min: 0, default: 0 }),
          reserved: integer({ min: 0, default: 0 }),
        },
        { _id: false, strict: 'throw' },
      ),
      default: () => ({ onHand: 0, reserved: 0 }),
      required: true,
    },
  },
  schemaOptions({ collection: 'products' }),
);
// Cross-field rule (document save par): reserved kabhi onHand se zyada nahi. (Server-side validator bhi yahi rokta hai.)
productSchema.pre('validate', function checkReserved() {
  if (this.stock && this.stock.reserved > this.stock.onHand) {
    this.invalidate(
      'stock.reserved',
      'stock.reserved must not exceed stock.onHand',
      this.stock.reserved,
    );
  }
});
productSchema.index({ sellerId: 1, sku: 1 }, { unique: true });
// Public list: status = ACTIVE, optional category, sort by createdAt / priceCents / name.
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, categorySlug: 1, createdAt: -1 });
productSchema.index({ status: 1, priceCents: 1 });
productSchema.index({ sellerId: 1, status: 1 });

export const reviewSchema = new Schema(
  {
    productId: ref('Product'),
    userId: ref('User'),
    rating: integer({ min: 1, max: 5 }),
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 4000 },
  },
  schemaOptions({ collection: 'reviews' }),
);
// Ek user ek product par ek hi review.
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ userId: 1 });

// Wishlist ke liye alag "wishlist" collection nahi: (user, product) jodi hi ek document hai, unique index duplicate rokta hai.
export const wishlistItemSchema = new Schema(
  {
    userId: ref('User'),
    productId: ref('Product'),
  },
  schemaOptions({
    collection: 'wishlist_items',
    timestamps: { createdAt: true, updatedAt: false },
  }),
);
wishlistItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
wishlistItemSchema.index({ productId: 1 });
